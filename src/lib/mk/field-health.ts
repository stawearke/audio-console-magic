/**
 * Connection health for field units (the bonded-uplink part of a LiveU-style unit).
 *
 *   PHONE  measures its own uplink (bitrate, delay, packet loss) every couple of seconds
 *     ├─ shows the reporter a signal indicator
 *     ├─ with Auto quality on: lowers its bitrate when the signal is poor, raises it again when it recovers
 *     └─ sends the same numbers to the studio as a small `net` message
 *   STUDIO shows the same numbers and the same indicator on the unit card.
 *
 * Everything that decides something lives here as plain functions, so the phone and the studio always agree:
 * `signalOf` is the one place that turns numbers into "good / fair / poor / bad".
 * Auto quality only moves the *bitrate*. Size and frame rate stay what the director chose (the phone drops frames, not sharpness).
 */

/** How often the phone measures and reports. */
export const HEALTH_INTERVAL_MS = 2000;
/** The studio forgets the numbers if nothing arrives for this long (old phone, phone stopped, link frozen). */
export const NET_STALE_MS = 3 * HEALTH_INTERVAL_MS + 1000;

// ------------------------------------------------------------------------------------------------- numbers

/** One measurement of the phone's uplink. This is exactly what travels in the `net` message. */
export interface FieldNet {
  /** Bitrate actually leaving the phone, kbps (measured, not the target). */
  kbps: number;
  /** Round-trip delay in ms. */
  rtt: number;
  /** Share of packets lost since the last measurement, 0-1. */
  loss: number;
  /** The most the phone is allowed to send right now, kbps. Equals the director's pick, or Auto's current ceiling. */
  cap: number;
  /** Network jitter in ms, when the phone can tell. */
  jitter?: number;
}

const finite = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined;

/** Keeps a `net` measurement only if every number in it is sane (it arrives over the network). */
export function cleanFieldNet(m: unknown): FieldNet | null {
  const r = (m && typeof m === "object" ? m : null) as Record<string, unknown> | null;
  if (!r) return null;
  const kbps = finite(r["kbps"], 0, 200_000);
  const rtt = finite(r["rtt"], 0, 60_000);
  const loss = finite(r["loss"], 0, 1);
  const cap = finite(r["cap"], 0, 200_000);
  if (kbps === undefined || rtt === undefined || loss === undefined || cap === undefined)
    return null;
  const jitter = finite(r["jitter"], 0, 60_000);
  return {
    kbps: Math.round(kbps),
    rtt: Math.round(rtt),
    loss: Math.round(loss * 1000) / 1000,
    cap: Math.round(cap),
    ...(jitter !== undefined ? { jitter: Math.round(jitter) } : {}),
  };
}

// ------------------------------------------------------------------------------------------------- indicator

export type SignalLevel = "good" | "fair" | "poor" | "bad";

/** Where "fair", "poor" and "bad" begin. The worse of loss and delay decides. */
export const SIGNAL_LIMITS = {
  loss: { fair: 0.02, poor: 0.05, bad: 0.1 },
  rtt: { fair: 150, poor: 300, bad: 600 },
} as const;

const ORDER: SignalLevel[] = ["good", "fair", "poor", "bad"];
const levelOf = (v: number, l: { fair: number; poor: number; bad: number }): SignalLevel =>
  v >= l.bad ? "bad" : v >= l.poor ? "poor" : v >= l.fair ? "fair" : "good";

export interface Signal {
  level: SignalLevel;
  /** 1-4 filled bars for the indicator (4 = good). */
  bars: 1 | 2 | 3 | 4;
  label: string;
}

/** The signal indicator, from the numbers. Used by the phone and by the unit card, so they never disagree. */
export function signalOf(net: Pick<FieldNet, "rtt" | "loss">): Signal {
  const a = levelOf(net.loss, SIGNAL_LIMITS.loss);
  const b = levelOf(net.rtt, SIGNAL_LIMITS.rtt);
  const level = ORDER[Math.max(ORDER.indexOf(a), ORDER.indexOf(b))]!;
  return { level, bars: (4 - ORDER.indexOf(level)) as Signal["bars"], label: level.toUpperCase() };
}

// ------------------------------------------------------------------------------------------------- wording

const mbps = (kbps: number) => (kbps / 1000).toFixed(1);

export /** "7.8 Mbps · 90 ms · 1.2 % loss" */
function formatNet(net: FieldNet): string {
  return `${mbps(net.kbps)} Mbps · ${net.rtt} ms · ${(net.loss * 100).toFixed(1)} % loss`;
}

/**
 * Wording for what Auto quality is doing, or null when there is nothing to say.
 * `topKbps` = the most Auto may send (what the director's size and frame rate normally use).
 */
export function autoNote(
  net: FieldNet,
  auto: boolean,
  topKbps: number,
): { text: string; lowered: boolean } | null {
  if (!auto) return null;
  if (topKbps > 0 && net.cap < topKbps)
    return { text: `AUTO · lowered to ${mbps(net.cap)} of ${mbps(topKbps)} Mbps`, lowered: true };
  return { text: "AUTO", lowered: false };
}

// ------------------------------------------------------------------------------------------------- on-air alert

/** What is wrong with a unit that is on air: a weak signal, a bad one, or no picture coming at all. */
export type AirAlert = "poor" | "bad" | "down";

/** The raw condition right now (jumpy; run it through `AlertGate` before showing or sounding anything). */
export function airAlertOf(onAir: boolean, link: string, net: FieldNet | null): AirAlert | null {
  if (!onAir) return null;
  if (link !== "live") return "down"; // on air with the phone offline or not live: the picture is black
  if (!net) return null;
  const { level } = signalOf(net);
  return level === "bad" ? "bad" : level === "poor" ? "poor" : null;
}

/** How long trouble must last before it is shown (a lone blip is not worth a beep), and how long calm must last before it clears. */
export const ALERT_RAISE_MS: Record<AirAlert, number> = { poor: 4000, bad: 3000, down: 4000 };
export const ALERT_CLEAR_MS = 6000;

/** Smooths `airAlertOf` over time: raises after sustained trouble, clears after sustained calm, follows the real severity in between. */
export class AlertGate {
  private since: number | null = null;
  private calmSince: number | null = null;
  private shown: AirAlert | null = null;

  /** Feed the raw condition now and then (`now` in ms, any steady clock). Returns what to show. */
  feed(raw: AirAlert | null, now: number): AirAlert | null {
    if (raw) {
      this.calmSince = null;
      this.since ??= now;
      if (now - this.since >= ALERT_RAISE_MS[raw]) this.shown = raw;
    } else {
      this.since = null;
      if (this.shown) {
        this.calmSince ??= now;
        if (now - this.calmSince >= ALERT_CLEAR_MS) {
          this.shown = null;
          this.calmSince = null;
        }
      }
    }
    return this.shown;
  }
}

/** The banner wording. */
export function airAlertText(a: AirAlert): string {
  return a === "down"
    ? "ON AIR · NOT SENDING · cut away"
    : a === "bad"
      ? "ON AIR · SIGNAL BAD · consider cutting away"
      : "ON AIR · WEAK SIGNAL";
}

/** How loud an alert is: a beep sounds only when it gets worse. */
export const alertRank = (a: AirAlert | null): number =>
  a === "down" ? 3 : a === "bad" ? 2 : a === "poor" ? 1 : 0;

// ------------------------------------------------------------------------------------------------- measuring

/** The few fields of the browser's WebRTC statistics this module reads. */
export interface RawNet {
  /** performance.now()-style time of the reading, ms. */
  at: number;
  bytesSent: number;
  packetsSent: number;
  /** Cumulative packets the receiver says it lost. */
  packetsLost: number;
  /** Seconds, as WebRTC reports them. */
  rtt?: number;
  jitter?: number;
  /** What the browser thinks the path can carry, bit/s. */
  availableBps?: number;
}

type StatLike = Record<string, unknown>;
const n = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** Picks the video-sending numbers out of `RTCPeerConnection.getStats()` (a Map-like of reports). */
export function readRawNet(
  report: { forEach: (cb: (s: StatLike) => void) => void },
  at: number,
): RawNet | null {
  let out: RawNet | null = null;
  let pairRtt: number | undefined;
  let remoteRtt: number | undefined;
  let jitter: number | undefined;
  let lost = 0;
  let avail: number | undefined;
  let havePair = false;
  report.forEach((x) => {
    if (x["type"] === "outbound-rtp" && x["kind"] === "video") {
      out = {
        at,
        bytesSent: n(x["bytesSent"]) ?? 0,
        packetsSent: n(x["packetsSent"]) ?? 0,
        packetsLost: 0,
      };
    } else if (x["type"] === "remote-inbound-rtp" && x["kind"] === "video") {
      lost = Math.max(0, n(x["packetsLost"]) ?? 0);
      remoteRtt = n(x["roundTripTime"]);
      jitter = n(x["jitter"]);
    } else if (x["type"] === "candidate-pair" && x["state"] === "succeeded") {
      // Prefer the pair the browser actually uses; otherwise the first one that works.
      const used = x["nominated"] === true || x["selected"] === true;
      if (used || !havePair) {
        pairRtt = n(x["currentRoundTripTime"]);
        avail = n(x["availableOutgoingBitrate"]);
        havePair = true;
      }
    }
  });
  const o = out as RawNet | null;
  if (!o) return null;
  const rtt = pairRtt ?? remoteRtt;
  return {
    ...o,
    packetsLost: lost,
    ...(rtt !== undefined ? { rtt } : {}),
    ...(jitter !== undefined ? { jitter } : {}),
    ...(avail !== undefined ? { availableBps: avail } : {}),
  };
}

/**
 * Two readings in a row become one measurement: bitrate and loss are *between* them, delay is the latest.
 * Returns null when the readings are too close together or the counters went backwards (the call restarted).
 */
export function diffNet(prev: RawNet, cur: RawNet, cap: number): FieldNet | null {
  const dt = cur.at - prev.at;
  const dBytes = cur.bytesSent - prev.bytesSent;
  const dSent = cur.packetsSent - prev.packetsSent;
  if (dt < 250 || dBytes < 0 || dSent < 0) return null;
  const dLost = Math.max(0, cur.packetsLost - prev.packetsLost);
  const loss = dSent + dLost > 0 ? Math.min(1, dLost / (dSent + dLost)) : 0;
  return cleanFieldNet({
    kbps: (dBytes * 8) / dt,
    rtt: (cur.rtt ?? prev.rtt ?? 0) * 1000,
    loss,
    cap,
    ...(cur.jitter !== undefined ? { jitter: cur.jitter * 1000 } : {}),
  });
}

// ------------------------------------------------------------------------------------------------- auto quality

/** Never go below this unless the director's own ceiling is lower (a picture this thin is still a picture). */
export const AUTO_FLOOR_KBPS = 250;
const CUT_BAD = 0.5;
const CUT_POOR = 0.75;
const RAISE = 1.2;
/** Good measurements in a row before raising (4 x 2 s = 8 s), and the shorter wait for the steps after the first. */
const GOOD_BEFORE_RAISE = 4;
const GOOD_AFTER_RAISE = 1;
/** Poor measurements in a row before cutting. "Bad" cuts at once. */
const POOR_BEFORE_CUT = 2;
const COOLDOWN_AFTER_CUT_MS = 4000;
const COOLDOWN_AFTER_RAISE_MS = 6000;

const step50 = (k: number) => Math.max(50, Math.round(k / 50) * 50);

export type AutoMove = "cut" | "raise" | "hold";

/**
 * Decides, measurement by measurement, how much the phone may send.
 * Falls fast, climbs slowly, and only climbs when the ceiling is what actually limits the picture.
 */
export class AutoRate {
  private _cap: number;
  private bad = 0;
  private good = 0;
  private changedAt = -Infinity;

  constructor(
    private _base: number,
    private floorKbps = AUTO_FLOOR_KBPS,
  ) {
    this._cap = _base;
  }

  /** What the phone may send right now. */
  get cap() {
    return this._cap;
  }

  /** The most Auto may ever send: what the director's size and frame rate normally use. */
  get base() {
    return this._base;
  }

  private get floor() {
    return Math.min(this._base, this.floorKbps);
  }

  /** New starting point (the director changed size or frame rate, or a new live session began). Always starts from the top. */
  reset(base: number) {
    this._base = base;
    this._cap = base;
    this.bad = 0;
    this.good = 0;
    this.changedAt = -Infinity;
  }

  /** `now` in ms (any steady clock). */
  step(net: FieldNet, now: number, availableBps?: number): { move: AutoMove; cap: number } {
    const { level } = signalOf(net);
    const wait = now - this.changedAt;

    if (level === "bad" || level === "poor") {
      this.good = 0;
      this.bad++;
      const need = level === "bad" ? 1 : POOR_BEFORE_CUT;
      if (this.bad >= need && wait >= COOLDOWN_AFTER_CUT_MS) {
        const factor = level === "bad" ? CUT_BAD : CUT_POOR;
        // If we know what really got through, go just under it instead of stepping down for a long time.
        const proven = net.kbps > 0 ? net.kbps * 0.9 : Infinity;
        const next = Math.max(this.floor, Math.min(step50(this._cap * factor), step50(proven)));
        if (next < this._cap) return this.move("cut", next, now);
      }
      return { move: "hold", cap: this._cap };
    }

    this.bad = 0;
    if (level === "fair") {
      this.good = 0;
      return { move: "hold", cap: this._cap };
    }

    // good
    this.good++;
    const limited = net.kbps >= this._cap * 0.7; // the ceiling is what holds the picture back
    if (
      this._cap < this._base &&
      this.good >= GOOD_BEFORE_RAISE &&
      limited &&
      wait >= COOLDOWN_AFTER_RAISE_MS
    ) {
      const room = availableBps ? (availableBps / 1000) * 0.85 : Infinity;
      const next = Math.min(
        this._base,
        step50(Math.min(this._cap * RAISE, Math.max(room, this._cap))),
      );
      if (next > this._cap) {
        this.good = GOOD_AFTER_RAISE;
        return this.move("raise", next, now);
      }
    }
    return { move: "hold", cap: this._cap };
  }

  private move(move: AutoMove, cap: number, now: number) {
    this._cap = cap;
    this.changedAt = now;
    this.bad = 0;
    return { move, cap };
  }
}

// ------------------------------------------------------------------------------------------------- the phone's loop

export interface HealthIo {
  /** The connection to measure (null = nothing to measure right now). */
  pc: () => { getStats: () => Promise<{ forEach: (cb: (s: StatLike) => void) => void }> } | null;
  /** The ceiling changed: apply it to the encoder, tell the studio. */
  apply: (capKbps: number, move: AutoMove) => void;
  /** A new measurement: show it on the phone, send it to the studio. */
  report: (net: FieldNet, auto: boolean) => void;
  /** Steady clock in ms. */
  now?: () => number;
}

/** Measures every couple of seconds, runs Auto quality, and reports. One per phone. */
export class FieldHealth {
  private rate: AutoRate;
  private auto = false;
  private prev: RawNet | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private now: () => number;

  constructor(
    private io: HealthIo,
    base: number,
  ) {
    this.rate = new AutoRate(base);
    this.now = io.now ?? (() => performance.now());
  }

  /** What the phone may send right now: the forced bitrate, or Auto's ceiling. */
  get cap() {
    return this.rate.cap;
  }

  get isAuto() {
    return this.auto;
  }

  /**
   * The director's choice. `base` is the bitrate for the chosen size and frame rate (or the forced bitrate when `auto` is false).
   * Calling it again with the same values changes nothing, so it is safe to call whenever the setup is re-sent.
   */
  configure(base: number, auto: boolean) {
    const changed = base !== this.rate.base || auto !== this.auto;
    this.auto = auto;
    if (changed) this.rate.reset(base);
  }

  start() {
    if (this.timer) return;
    this.prev = null;
    this.rate.reset(this.rate.base); // every live session starts at the top
    this.timer = setInterval(() => void this.tick(), HEALTH_INTERVAL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.prev = null;
  }

  /** One measurement. Public so tests (and a manual refresh) can drive it. */
  async tick(): Promise<void> {
    if (this.busy) return;
    const pc = this.io.pc();
    if (!pc) {
      this.prev = null;
      return;
    }
    this.busy = true;
    try {
      const at = this.now();
      const raw = readRawNet(await pc.getStats(), at);
      if (!raw) return;
      const prev = this.prev;
      this.prev = raw;
      if (!prev) return;
      const net = diffNet(prev, raw, this.rate.cap);
      if (!net) return;
      if (this.auto) {
        const r = this.rate.step(net, at, raw.availableBps);
        if (r.move !== "hold") {
          this.io.apply(r.cap, r.move);
          net.cap = r.cap;
        }
      }
      this.io.report(net, this.auto);
    } catch {
      /* a failed reading is skipped */
    } finally {
      this.busy = false;
    }
  }
}

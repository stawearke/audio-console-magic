import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- an in-memory "connection server": a reporter and a viewer find each other and talk directly
type Handler = (...a: unknown[]) => void;
class FakeConn {
  open = false;
  other: FakeConn | null = null;
  private h: Record<string, Handler> = {};
  on(ev: string, cb: Handler) {
    this.h[ev] = cb;
  }
  emit(ev: string, ...a: unknown[]) {
    this.h[ev]?.(...a);
  }
  send(m: unknown) {
    const copy = structuredClone(m);
    this.other?.emit("data", copy);
  }
  close() {
    this.open = false;
  }
}
const peers = new Map<string, FakePeer>();
class FakePeer {
  destroyed = false;
  disconnected = false;
  open = true;
  h: Record<string, Handler> = {};
  constructor(public id: string = `anon-${peers.size}`) {
    peers.set(this.id, this);
    queueMicrotask(() => this.h["open"]?.());
  }
  on(ev: string, cb: Handler) {
    this.h[ev] = cb;
  }
  connect(id: string) {
    const mine = new FakeConn();
    const theirs = new FakeConn();
    mine.other = theirs;
    theirs.other = mine;
    const target = peers.get(id);
    queueMicrotask(() => {
      target?.h["connection"]?.(theirs);
      mine.open = theirs.open = true;
      mine.emit("open");
      theirs.emit("open");
    });
    return mine;
  }
  call() {
    return { on() {}, close() {} };
  }
  destroy() {
    this.destroyed = true;
    peers.delete(this.id);
  }
}
vi.mock("peerjs", () => ({ Peer: FakePeer }));

import { FieldReporter, FieldViewer } from "@/lib/mk/field-link";
import {
  AUTO_FLOOR_KBPS,
  AutoRate,
  cleanFieldNet,
  diffNet,
  FieldHealth,
  HEALTH_INTERVAL_MS,
  NET_STALE_MS,
  readRawNet,
  signalOf,
  type FieldNet,
  type RawNet,
} from "@/lib/mk/field-health";

const net = (o: Partial<FieldNet> = {}): FieldNet => ({
  kbps: 8000,
  rtt: 60,
  loss: 0,
  cap: 8000,
  ...o,
});
const good = (o: Partial<FieldNet> = {}) => net(o);
const poor = (o: Partial<FieldNet> = {}) => net({ loss: 0.07, ...o });
const bad = (o: Partial<FieldNet> = {}) => net({ loss: 0.2, ...o });

describe("what travels in a net message", () => {
  it("keeps sane numbers and rounds them", () => {
    expect(
      cleanFieldNet({ kbps: 4321.6, rtt: 88.4, loss: 0.01234, cap: 4500, jitter: 12.5 }),
    ).toEqual({ kbps: 4322, rtt: 88, loss: 0.012, cap: 4500, jitter: 13 });
  });
  it("rejects junk instead of showing nonsense", () => {
    expect(cleanFieldNet(null)).toBeNull();
    expect(cleanFieldNet("x")).toBeNull();
    expect(cleanFieldNet({ kbps: 1, rtt: 1, loss: 1.5, cap: 1 })).toBeNull();
    expect(cleanFieldNet({ kbps: -1, rtt: 1, loss: 0, cap: 1 })).toBeNull();
    expect(cleanFieldNet({ kbps: NaN, rtt: 1, loss: 0, cap: 1 })).toBeNull();
    expect(cleanFieldNet({ kbps: 1, rtt: 1, loss: 0 })).toBeNull();
  });
});

describe("signal indicator", () => {
  it("grades loss and delay, and the worse one wins", () => {
    expect(signalOf({ loss: 0, rtt: 40 })).toMatchObject({ level: "good", bars: 4 });
    expect(signalOf({ loss: 0.03, rtt: 40 })).toMatchObject({ level: "fair", bars: 3 });
    expect(signalOf({ loss: 0, rtt: 350 })).toMatchObject({ level: "poor", bars: 2 });
    expect(signalOf({ loss: 0.02, rtt: 700 })).toMatchObject({
      level: "bad",
      bars: 1,
      label: "BAD",
    });
    expect(signalOf({ loss: 0.12, rtt: 20 })).toMatchObject({ level: "bad" });
  });
  it("switches exactly at the limits", () => {
    expect(signalOf({ loss: 0.0199, rtt: 149 }).level).toBe("good");
    expect(signalOf({ loss: 0.02, rtt: 149 }).level).toBe("fair");
    expect(signalOf({ loss: 0.05, rtt: 0 }).level).toBe("poor");
    expect(signalOf({ loss: 0.1, rtt: 0 }).level).toBe("bad");
  });
});

describe("measuring from WebRTC statistics", () => {
  const stats = (o: Record<string, unknown>[]) => new Map(o.map((x, i) => [String(i), x]));
  it("reads the video sender, the receiver's report and the working path", () => {
    const raw = readRawNet(
      stats([
        { type: "outbound-rtp", kind: "audio", bytesSent: 1, packetsSent: 1 },
        { type: "outbound-rtp", kind: "video", bytesSent: 5000, packetsSent: 40 },
        {
          type: "remote-inbound-rtp",
          kind: "video",
          packetsLost: 3,
          roundTripTime: 0.2,
          jitter: 0.01,
        },
        { type: "candidate-pair", state: "failed", currentRoundTripTime: 9 },
        {
          type: "candidate-pair",
          state: "succeeded",
          nominated: true,
          currentRoundTripTime: 0.08,
          availableOutgoingBitrate: 3_000_000,
        },
      ]),
      1000,
    );
    expect(raw).toEqual({
      at: 1000,
      bytesSent: 5000,
      packetsSent: 40,
      packetsLost: 3,
      rtt: 0.08,
      jitter: 0.01,
      availableBps: 3_000_000,
    });
  });
  it("falls back to the receiver's delay and returns null with no video", () => {
    const r = readRawNet(
      stats([
        { type: "outbound-rtp", kind: "video", bytesSent: 1, packetsSent: 1 },
        { type: "remote-inbound-rtp", kind: "video", packetsLost: -2, roundTripTime: 0.3 },
      ]),
      5,
    );
    expect(r).toMatchObject({ rtt: 0.3, packetsLost: 0 });
    expect(readRawNet(stats([{ type: "outbound-rtp", kind: "audio" }]), 5)).toBeNull();
  });
  it("turns two readings into bitrate, loss and delay", () => {
    const a: RawNet = { at: 0, bytesSent: 0, packetsSent: 0, packetsLost: 0 };
    const b: RawNet = {
      at: 2000,
      bytesSent: 1_000_000,
      packetsSent: 900,
      packetsLost: 100,
      rtt: 0.12,
      jitter: 0.004,
    };
    expect(diffNet(a, b, 4000)).toEqual({ kbps: 4000, rtt: 120, loss: 0.1, cap: 4000, jitter: 4 });
  });
  it("skips readings that cannot be compared", () => {
    const a: RawNet = { at: 1000, bytesSent: 500, packetsSent: 50, packetsLost: 0 };
    expect(diffNet(a, { ...a, at: 1100 }, 1)).toBeNull(); // too close together
    expect(diffNet(a, { ...a, at: 3000, bytesSent: 10, packetsSent: 5 }, 1)).toBeNull(); // call restarted
  });
});

describe("Auto quality", () => {
  const T = HEALTH_INTERVAL_MS;
  /** Feeds measurements 2 s apart and returns each decision. */
  const run = (r: AutoRate, list: FieldNet[], from = 0) =>
    list.map((m, i) => r.step(m, from + (i + 1) * T));

  it("cuts at once on a bad signal, to half", () => {
    const r = new AutoRate(8000);
    expect(run(r, [bad()])[0]).toEqual({ move: "cut", cap: 4000 });
  });
  it("waits for two poor measurements before cutting, to three quarters", () => {
    const r = new AutoRate(8000);
    expect(run(r, [poor(), poor()]).map((x) => x.move)).toEqual(["hold", "cut"]);
    expect(r.cap).toBe(6000);
  });
  it("ignores a single poor blip", () => {
    const r = new AutoRate(8000);
    expect(run(r, [poor(), good(), poor(), good()]).every((x) => x.move === "hold")).toBe(true);
    expect(r.cap).toBe(8000);
  });
  it("goes just under what really got through instead of stepping down for a minute", () => {
    const r = new AutoRate(8000);
    expect(run(r, [bad({ kbps: 1200 })])[0]).toEqual({ move: "cut", cap: 1100 });
  });
  it("never goes under the floor", () => {
    const r = new AutoRate(8000);
    let t = 0;
    for (let i = 0; i < 20; i++) r.step(bad({ kbps: 100 }), (t += T * 2));
    expect(r.cap).toBe(AUTO_FLOOR_KBPS);
    expect(new AutoRate(200).step(bad({ kbps: 50 }), T).cap).toBeLessThanOrEqual(200); // a low base is its own floor
  });
  it("gives a cut time to show up before cutting again", () => {
    const r = new AutoRate(8000);
    const [a, b, c] = run(r, [bad(), bad(), bad()]);
    expect([a!.move, b!.move, c!.move]).toEqual(["cut", "hold", "cut"]);
  });
  it("holds on a fair signal: no cut, no climb", () => {
    const r = new AutoRate(8000);
    run(r, [bad()]);
    const fair = net({ loss: 0.03, kbps: 4000, cap: 4000 });
    expect(run(r, Array(10).fill(fair), 10_000).every((x) => x.move === "hold")).toBe(true);
    expect(r.cap).toBe(4000);
  });
  it("climbs back slowly once the signal has been good for a while, and stops at the top", () => {
    const r = new AutoRate(8000);
    run(r, [bad()]); // 4000
    const ok = () => good({ kbps: r.cap, cap: r.cap });
    const caps: number[] = [];
    let t = 10_000;
    for (let i = 0; i < 60; i++) {
      const d = r.step(ok(), (t += T));
      if (d.move === "raise") caps.push(d.cap);
    }
    expect(caps[0]).toBe(4800); // +20 %
    expect(caps.at(-1)).toBe(8000);
    expect(caps.every((c, i) => i === 0 || c > caps[i - 1]!)).toBe(true);
    expect(r.cap).toBe(8000);
  });
  it("waits 4 good measurements for the first climb", () => {
    const r = new AutoRate(8000);
    run(r, [bad()]);
    const ok = good({ kbps: 4000, cap: 4000 });
    expect(run(r, [ok, ok, ok, ok], 20_000).map((x) => x.move)).toEqual([
      "hold",
      "hold",
      "hold",
      "raise",
    ]);
  });
  it("does not climb when the ceiling is not what limits the picture", () => {
    const r = new AutoRate(8000);
    run(r, [bad()]);
    const quiet = good({ kbps: 800, cap: 4000 }); // a still scene needs little
    expect(run(r, Array(10).fill(quiet), 20_000).every((x) => x.move === "hold")).toBe(true);
    expect(r.cap).toBe(4000);
  });
  it("does not climb past what the browser says the path can carry", () => {
    const r = new AutoRate(8000);
    run(r, [bad()]);
    const ok = good({ kbps: 4000, cap: 4000 });
    let last = { move: "hold", cap: r.cap };
    for (let i = 0; i < 4; i++) last = r.step(ok, 20_000 + i * T, 4_200_000); // 4.2 Mbps free -> room for ~3.6
    expect(last.move).toBe("hold");
    expect(r.cap).toBe(4000);
  });
  it("starts again from the top when the director changes the picture", () => {
    const r = new AutoRate(8000);
    run(r, [bad()]);
    r.reset(4500);
    expect(r.cap).toBe(4500);
    expect(r.base).toBe(4500);
  });
});

describe("the phone's measuring loop", () => {
  /** A pretend connection whose counters the test moves. */
  const world = { bytes: 0, pkts: 0, lost: 0, rttMs: 50 };
  const pc = {
    getStats: async () =>
      new Map<string, Record<string, unknown>>([
        [
          "o",
          { type: "outbound-rtp", kind: "video", bytesSent: world.bytes, packetsSent: world.pkts },
        ],
        [
          "r",
          {
            type: "remote-inbound-rtp",
            kind: "video",
            packetsLost: world.lost,
            roundTripTime: world.rttMs / 1000,
          },
        ],
      ]),
  };
  let clock = 0;
  const second2 = (kbps: number, loss: number, rttMs = 50) => {
    clock += HEALTH_INTERVAL_MS;
    const packets = Math.round((kbps * 2) / 9.6);
    world.bytes += (kbps * HEALTH_INTERVAL_MS) / 8;
    world.pkts += packets;
    world.lost += Math.round(packets * loss);
    world.rttMs = rttMs;
  };
  beforeEach(() => {
    Object.assign(world, { bytes: 0, pkts: 0, lost: 0, rttMs: 50 });
    clock = 0;
  });

  const make = (base: number, auto: boolean) => {
    const applied: number[] = [];
    const reported: { net: FieldNet; auto: boolean }[] = [];
    const h = new FieldHealth(
      {
        pc: () => pc,
        apply: (c) => applied.push(c),
        report: (n, a) => reported.push({ net: n, auto: a }),
        now: () => clock,
      },
      base,
    );
    h.configure(base, auto);
    return { h, applied, reported };
  };

  it("reports from the second reading on, and lowers then raises the bitrate", async () => {
    const { h, applied, reported } = make(8000, true);
    await h.tick(); // first reading: nothing to compare with yet
    expect(reported).toHaveLength(0);
    second2(8000, 0);
    await h.tick();
    expect(reported[0]).toMatchObject({ auto: true, net: { kbps: 8000, loss: 0, cap: 8000 } });

    second2(8000, 0.15, 400); // the signal collapses
    await h.tick();
    expect(applied).toEqual([4000]);
    expect(reported.at(-1)!.net).toMatchObject({ cap: 4000, rtt: 400 });
    expect(signalOf(reported.at(-1)!.net).level).toBe("bad");

    for (let i = 0; i < 6; i++) {
      second2(h.cap, 0); // it recovers, and the phone sends what it is allowed
      await h.tick();
    }
    expect(applied.at(-1)).toBeGreaterThan(4000);
    expect(h.cap).toBe(applied.at(-1));
  });

  it("with Auto off it only measures: the forced bitrate never moves", async () => {
    const { h, applied, reported } = make(3000, false);
    await h.tick();
    for (let i = 0; i < 5; i++) {
      second2(3000, 0.3, 900);
      await h.tick();
    }
    expect(applied).toEqual([]);
    expect(reported.length).toBe(5);
    expect(reported.every((r) => r.net.cap === 3000 && !r.auto)).toBe(true);
  });

  it("is safe to configure again with the same values, and restarts from the top when they change", async () => {
    const { h } = make(8000, true);
    await h.tick();
    second2(8000, 0.2);
    await h.tick();
    expect(h.cap).toBe(4000);
    h.configure(8000, true); // the setup was re-sent: nothing changes
    expect(h.cap).toBe(4000);
    h.configure(4500, true); // director picked another size
    expect(h.cap).toBe(4500);
  });

  it("skips a tick when there is nothing to measure or the stats fail", async () => {
    const reported: FieldNet[] = [];
    let call: typeof pc | null = null;
    const h = new FieldHealth(
      { pc: () => call, apply: () => {}, report: (n) => reported.push(n), now: () => clock },
      1000,
    );
    await h.tick();
    call = { getStats: async () => Promise.reject(new Error("closed")) };
    await expect(h.tick()).resolves.toBeUndefined();
    expect(reported).toHaveLength(0);
  });
});

describe("reporter to studio, end to end", () => {
  const W = { bytes: 0, pkts: 0, lost: 0, rttMs: 40 };
  const maxBitrates: (number | undefined)[] = [];
  const fakePc = {
    getStats: async () =>
      new Map<string, Record<string, unknown>>([
        ["o", { type: "outbound-rtp", kind: "video", bytesSent: W.bytes, packetsSent: W.pkts }],
        [
          "r",
          {
            type: "remote-inbound-rtp",
            kind: "video",
            packetsLost: W.lost,
            roundTripTime: W.rttMs / 1000,
          },
        ],
      ]),
    getSenders: () => [
      {
        track: { kind: "video" },
        getParameters: () => ({ encodings: [{}] }),
        setParameters: async (p: { encodings: { maxBitrate?: number }[] }) =>
          void maxBitrates.push(p.encodings[0]?.maxBitrate),
      },
    ],
  };
  const world = async (kbps: number, loss: number, rttMs = 40) => {
    const packets = Math.round((kbps * 2) / 9.6);
    W.bytes += (kbps * 2000) / 8;
    W.pkts += packets;
    W.lost += Math.round(packets * loss);
    W.rttMs = rttMs;
    await vi.advanceTimersByTimeAsync(HEALTH_INTERVAL_MS);
  };

  let reporter: FieldReporter;
  let viewer: FieldViewer;
  const phoneSaw: { net: FieldNet; auto: boolean }[] = [];

  beforeEach(async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"],
    });
    peers.clear();
    Object.assign(W, { bytes: 0, pkts: 0, lost: 0, rttMs: 40 });
    maxBitrates.length = 0;
    phoneSaw.length = 0;
    reporter = new FieldReporter(
      "room",
      1,
      () => ({
        name: "Ryan",
        loc: "Kisumu",
        orient: "portrait",
        fps: 30,
        kbps: 8000,
        held: "portrait",
      }),
      () => ({}) as MediaStream,
      () => {},
    );
    reporter.onNet = (n, a) => phoneSaw.push({ net: n, auto: a });
    reporter.setQuality(8000, 30, true);
    await reporter.start();
    viewer = new FieldViewer("room", 1, { video: false }, () => {});
    await viewer.start();
    await vi.advanceTimersByTimeAsync(10);
    // The studio's monitor asks for the picture: the phone answers with its stream.
    reporter.setLive(true, 8000);
    const call = { metadata: {}, answer() {}, on() {}, close() {}, peerConnection: fakePc };
    peers.get("mkf-room-1")!.h["call"]!(call);
    await vi.advanceTimersByTimeAsync(10);
  });
  afterEach(() => {
    reporter.stop();
    viewer.stop();
    vi.useRealTimers();
  });

  it("tells the studio Auto is on and what the phone is sending", () => {
    expect(viewer.state).toMatchObject({ link: "live", auto: true, kbps: 8000, net: null });
  });

  it("shows the studio the same numbers and signal the phone shows", async () => {
    await world(7800, 0);
    await world(7800, 0.01, 90);
    const studio = viewer.state.net!;
    expect(studio).toMatchObject({ kbps: 7800, rtt: 90, cap: 8000 });
    expect(studio.loss).toBeCloseTo(0.01, 2);
    const phone = phoneSaw.at(-1)!.net;
    expect(studio).toEqual(phone);
    expect(signalOf(studio)).toEqual(signalOf(phone));
  });

  it("lowers the bitrate on a bad signal, tells the studio, and raises it again when the signal recovers", async () => {
    await world(8000, 0);
    await world(8000, 0);
    await world(8000, 0.2, 500); // bad
    expect(maxBitrates.at(-1)).toBe(4_000_000);
    expect(viewer.state.kbps).toBe(4000);
    expect(viewer.state.net).toMatchObject({ cap: 4000 });
    expect(signalOf(viewer.state.net!).level).toBe("bad");

    for (let i = 0; i < 40; i++) await world(viewer.state.kbps, 0, 50);
    expect(maxBitrates.at(-1)).toBe(8_000_000);
    expect(viewer.state.kbps).toBe(8000);
    expect(signalOf(viewer.state.net!).level).toBe("good");
  });

  it("with a forced bitrate it only reports", async () => {
    reporter.setQuality(3000, 30, false);
    await world(3000, 0);
    await world(3000, 0.3, 900);
    await world(3000, 0.3, 900);
    expect(viewer.state).toMatchObject({ auto: false, kbps: 3000 });
    expect(viewer.state.net).toMatchObject({ cap: 3000 });
    expect(signalOf(viewer.state.net!).level).toBe("bad");
  });

  it("forgets the numbers when the phone goes quiet or stops being live", async () => {
    await world(8000, 0);
    await world(8000, 0);
    expect(viewer.state.net).not.toBeNull();
    // the phone's measuring stops but the link stays: after a few seconds the card must not keep a healthy-looking reading
    await vi.advanceTimersByTimeAsync(0);
    (reporter as unknown as { health: FieldHealth }).health.stop();
    await vi.advanceTimersByTimeAsync(NET_STALE_MS + 50);
    expect(viewer.state.net).toBeNull();
    // and when GO LIVE ends
    reporter.setLive(true, 8000);
    await world(8000, 0);
    await world(8000, 0);
    expect(viewer.state.net).not.toBeNull();
    reporter.setLive(false, 8000);
    await vi.advanceTimersByTimeAsync(10);
    expect(viewer.state).toMatchObject({ link: "standby", net: null });
  });

  it("tells the studio when the phone is keeping a backup recording", async () => {
    expect(viewer.state.rec).toBe(false);
    reporter.setRec(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(viewer.state.rec).toBe(true);
    reporter.setRec(true); // no change: nothing more to say
    reporter.setRec(false);
    await vi.advanceTimersByTimeAsync(10);
    expect(viewer.state.rec).toBe(false);
  });

  it("ignores a net message with nonsense in it", async () => {
    await world(8000, 0);
    await world(8000, 0);
    const before = viewer.state.net;
    const conn = (viewer as unknown as { conn: FakeConn }).conn;
    conn.other!.send({ t: "net", kbps: "fast", rtt: 1, loss: 0, cap: 1 });
    expect(viewer.state.net).toEqual(before);
  });
});

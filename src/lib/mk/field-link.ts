import type { DataConnection, MediaConnection, Peer } from "peerjs";

/**
 * Field units, peer-to-peer (VDO.Ninja style, no server of your own).
 *
 *   REPORTER (phone, /field?room=…&unit=N)  ——— video + audio ———>  VIEWER (/field-view in OBS, or the director's monitor)
 *
 * - The reporter opens its link, waits under a fixed id, and answers calls once GO LIVE is pressed.
 * - A viewer connects a small data channel to see "online / standby / live", and only when the unit is live
 *   does it call the reporter for the picture. Any number of viewers can watch the same unit.
 * Only the connection set-up goes through the free PeerJS cloud; the picture flows directly between devices.
 */

export const fieldPeerId = (room: string, unit: number) => `mkf-${room}-${unit}`;

export type FieldLink = "connecting" | "offline" | "standby" | "live";

export interface FieldState {
  link: FieldLink;
  name: string;
  loc: string;
  /** Soft problem to show (e.g. network). */
  error: string | null;
}

type ToViewer = { t: "state"; live: boolean; name: string; loc: string };

const RETRY_MS = 3000;
const NO_PICTURE_MS = 12000;

export function newFieldRoom() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** The link a reporter opens. */
export function reporterUrl(base: string, room: string, unit: number, name: string, loc: string) {
  const q = new URLSearchParams({ room, unit: String(unit) });
  if (name.trim()) q.set("name", name.trim());
  if (loc.trim()) q.set("loc", loc.trim());
  return `${base.replace(/\/+$/, "")}/field?${q.toString()}`;
}

/** The address OBS loads as a browser source for this unit (what the director never has to touch). */
export function viewerUrl(base: string, room: string, unit: number) {
  return `${base.replace(/\/+$/, "")}/field-view?room=${encodeURIComponent(room)}&unit=${unit}`;
}

// ---------------------------------------------------------------------------------------------- viewer

/** Silent placeholder tracks: they make the call offer ask for video + audio back from the reporter. */
function placeholderStream(): MediaStream {
  const out = new MediaStream();
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 2;
    const v = canvas.captureStream(1).getVideoTracks()[0];
    if (v) {
      v.enabled = false;
      out.addTrack(v);
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const a = new Ctx().createMediaStreamDestination().stream.getAudioTracks()[0];
    if (a) {
      a.enabled = false;
      out.addTrack(a);
    }
  } catch {
    /* the call may then carry video only */
  }
  return out;
}

/** Watches one field unit: its status, and (when `video`) its picture. */
export class FieldViewer {
  state: FieldState = { link: "connecting", name: "", loc: "", error: null };
  /** The incoming picture (null until the unit is live and the call is up). */
  stream: MediaStream | null = null;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private call: MediaConnection | null = null;
  private dead = false;
  private video: boolean;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private decoy: MediaStream | null = null;

  constructor(
    private room: string,
    private unit: number,
    opts: { video: boolean },
    private onChange: () => void,
  ) {
    this.video = opts.video;
  }

  private patch(p: Partial<FieldState>) {
    this.state = { ...this.state, ...p };
    this.onChange();
  }

  async start() {
    if (this.peer || this.dead) return;
    const { Peer } = await import("peerjs");
    if (this.dead) return;
    const peer = new Peer();
    this.peer = peer;
    peer.on("open", () => this.connect());
    peer.on("error", (e) => {
      if (e.type === "peer-unavailable") {
        this.patch({ link: "offline", error: null });
        this.dropCall();
        this.schedule();
      } else if (["network", "server-error", "socket-error", "socket-closed"].includes(e.type)) {
        this.patch({ error: "Cannot reach the connection server. Check the internet on this device." });
        this.schedule();
      }
    });
    peer.on("disconnected", () => {
      try {
        peer.reconnect();
      } catch {
        /* ignore */
      }
    });
  }

  /** Switch the picture on or off (the director's monitor). Status keeps running either way. */
  setVideo(on: boolean) {
    if (this.video === on) return;
    this.video = on;
    if (!on) this.dropCall();
    else if (this.state.link === "live") this.startCall();
  }

  private schedule() {
    if (this.dead || this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.connect();
    }, RETRY_MS);
  }

  private connect() {
    const peer = this.peer;
    if (!peer || this.dead || peer.destroyed || peer.disconnected) return;
    try {
      this.conn?.close();
    } catch {
      /* ignore */
    }
    const conn = peer.connect(fieldPeerId(this.room, this.unit), { reliable: true });
    this.conn = conn;
    conn.on("data", (d) => {
      const m = d as ToViewer;
      if (m?.t !== "state") return;
      this.patch({ link: m.live ? "live" : "standby", name: m.name, loc: m.loc, error: null });
      if (m.live && this.video) this.startCall();
      if (!m.live) this.dropCall();
    });
    conn.on("close", () => {
      if (this.conn !== conn) return;
      this.conn = null;
      this.dropCall();
      this.patch({ link: "offline" });
      this.schedule();
    });
    conn.on("error", () => {
      this.dropCall();
      this.patch({ link: "offline" });
      this.schedule();
    });
  }

  private startCall() {
    const peer = this.peer;
    if (!peer || this.call || this.dead) return;
    this.decoy ??= placeholderStream();
    const call = peer.call(fieldPeerId(this.room, this.unit), this.decoy);
    this.call = call;
    call.on("stream", (s) => {
      if (this.call !== call) return;
      if (this.watchdog) clearTimeout(this.watchdog);
      this.stream = s;
      this.onChange();
    });
    call.on("close", () => {
      if (this.call !== call) return;
      this.call = null;
      this.stream = null;
      this.onChange();
      if (this.state.link === "live" && this.video && !this.dead) setTimeout(() => this.startCall(), 1500);
    });
    call.on("error", () => call.close());
    // Calls can hang silently on a bad network: give up and call again.
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      if (this.call === call && !this.stream) {
        this.dropCall();
        if (this.state.link === "live" && this.video) this.startCall();
      }
    }, NO_PICTURE_MS);
  }

  private dropCall() {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
    const c = this.call;
    this.call = null;
    if (c) {
      try {
        c.close();
      } catch {
        /* ignore */
      }
    }
    if (this.stream) {
      this.stream = null;
      this.onChange();
    }
  }

  stop() {
    this.dead = true;
    if (this.retry) clearTimeout(this.retry);
    this.dropCall();
    try {
      this.conn?.close();
    } catch {
      /* ignore */
    }
    this.peer?.destroy();
    this.peer = null;
  }
}

// -------------------------------------------------------------------------------------------- reporter

/** The reporter's side: sits under a fixed id, tells viewers its status, sends the camera when live. */
export class FieldReporter {
  private peer: Peer | null = null;
  private conns = new Set<DataConnection>();
  private calls = new Set<MediaConnection>();
  private live = false;
  private kbps = 2500;
  private dead = false;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private room: string,
    private unit: number,
    private meta: () => { name: string; loc: string },
    private getStream: () => MediaStream | null,
    private onStatus: (s: { registered: boolean; viewers: number; error: string | null }) => void,
  ) {}

  private report(error: string | null = null) {
    this.onStatus({ registered: !!this.peer && !this.peer.disconnected && !!this.peer.open, viewers: this.calls.size, error });
  }

  async start() {
    if (this.dead) return;
    const { Peer } = await import("peerjs");
    if (this.dead) return;
    const peer = new Peer(fieldPeerId(this.room, this.unit));
    this.peer = peer;
    peer.on("open", () => this.report());
    peer.on("connection", (c) => {
      this.conns.add(c);
      c.on("open", () => this.send(c));
      c.on("close", () => this.conns.delete(c));
      c.on("error", () => this.conns.delete(c));
    });
    peer.on("call", (call) => {
      const s = this.getStream();
      if (!this.live || !s) {
        call.close();
        return;
      }
      call.answer(s);
      this.calls.add(call);
      this.report();
      this.applyBitrate();
      call.on("close", () => {
        this.calls.delete(call);
        this.report();
      });
      call.on("error", () => call.close());
    });
    peer.on("disconnected", () => {
      try {
        peer.reconnect();
      } catch {
        /* ignore */
      }
    });
    peer.on("error", (e) => {
      if (e.type === "unavailable-id") {
        // Same unit still open in a closing tab / just reloaded: try again shortly.
        this.report("Taking over this unit…");
        peer.destroy();
        this.peer = null;
        this.retry = setTimeout(() => void this.start(), 2500);
      } else if (["network", "server-error", "socket-error", "socket-closed"].includes(e.type)) {
        this.report("Cannot reach the connection server. Check your signal.");
      }
    });
  }

  private send(c: DataConnection) {
    const m = this.meta();
    const msg: ToViewer = { t: "state", live: this.live, name: m.name, loc: m.loc };
    try {
      if (c.open) c.send(msg);
    } catch {
      /* ignore */
    }
  }

  private broadcast() {
    this.conns.forEach((c) => this.send(c));
  }

  setLive(on: boolean, kbps: number) {
    this.live = on;
    this.kbps = kbps;
    if (!on) {
      this.calls.forEach((c) => c.close());
      this.calls.clear();
    }
    this.broadcast();
    this.report();
  }

  /** Camera / mic changed: swap the tracks without dropping the call. */
  swapTracks(s: MediaStream) {
    for (const call of this.calls) {
      const pc = call.peerConnection;
      for (const t of s.getTracks())
        pc.getSenders()
          .find((x) => x.track?.kind === t.kind)
          ?.replaceTrack(t)
          .catch(() => {});
    }
  }

  private applyBitrate() {
    for (const call of this.calls) {
      const sender = call.peerConnection.getSenders().find((x) => x.track?.kind === "video");
      if (!sender) continue;
      const prm = sender.getParameters();
      prm.encodings = [{ ...(prm.encodings?.[0] ?? {}), maxBitrate: this.kbps * 1000, maxFramerate: 30 }];
      // Under a weak signal drop frames, not sharpness.
      (prm as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = "maintain-resolution";
      void sender.setParameters(prm).catch(() => {});
    }
  }

  /** The connection used for live statistics (first viewer). */
  statsPc(): RTCPeerConnection | null {
    const first = this.calls.values().next().value as MediaConnection | undefined;
    return first?.peerConnection ?? null;
  }

  stop() {
    this.dead = true;
    if (this.retry) clearTimeout(this.retry);
    this.calls.forEach((c) => c.close());
    this.calls.clear();
    this.conns.forEach((c) => c.close());
    this.conns.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}

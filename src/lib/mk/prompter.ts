import { useSyncExternalStore } from "react";

import { deskId } from "./shared";

/**
 * Teleprompter state. The switcher window is the HOST: it owns this state and pushes it to the
 * /prompter output window over a BroadcastChannel. Scroll position is stored in "em" (relative
 * to the font size) so it is the same on every screen regardless of size or text wrapping.
 */
export interface PrompterState {
  text: string;
  playing: boolean;
  /** 1..20. One step = 0.1 em of scroll per second (5 is a calm read). */
  speed: number;
  /** Output font size in % of screen height. */
  size: number;
  /** Horizontal mirror, for beam-splitter glass. */
  mirror: boolean;
  /** Vertical flip. */
  flip: boolean;
  /** Scroll position in em at `t0` (or while paused). */
  pos: number;
  /** Date.now() when the current run started. */
  t0: number;
}

export const DEFAULT_PROMPTER: PrompterState = {
  text: "",
  playing: false,
  speed: 5,
  size: 9,
  mirror: false,
  flip: false,
  pos: 0,
  t0: 0,
};

export const PROMPTER_CHANNEL = "mk-prompter";
const KEY = "mk-prompter";

let state: PrompterState = DEFAULT_PROMPTER;
const subs = new Set<() => void>();

const emit = () => subs.forEach((f) => f());

export const prompterStore = {
  get: () => state,
  /** Take a state that came from elsewhere (not a local edit): not sent on again. */
  apply(next: PrompterState) {
    applying = true;
    try {
      prompterStore.set(next);
    } finally {
      applying = false;
    }
  },
  set(next: PrompterState) {
    state = next;
    emit();
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  },
};

/**
 * Over OBS: every desk and output page is a peer. A local change is sent as a whole state with a revision;
 * peers keep the newest revision (hybrid clock, so PC clocks do not need to agree). Scroll start is sent as an
 * AGE, not a clock time, so the picture runs in step on every PC.
 */
type Relay = (message: Record<string, unknown>) => void;
let relay: Relay | null = null;
let unsubRelay: (() => void) | null = null;
let applying = false;
let rev = 0;
let lastText: string | null = null;
let textTimer: ReturnType<typeof setTimeout> | null = null;

const num = (v: unknown, d: number, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;

/** Validate a state from outside (BroadcastChannel or OBS). `text` undefined keeps the current script. */
export function cleanPrompter(raw: unknown, base: PrompterState): PrompterState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    text: typeof r["text"] === "string" ? r["text"].slice(0, 200_000) : base.text,
    playing: r["playing"] === true,
    speed: Math.round(num(r["speed"], base.speed, 1, 20)),
    size: Math.round(num(r["size"], base.size, 4, 18)),
    mirror: r["mirror"] === true,
    flip: r["flip"] === true,
    pos: num(r["pos"], 0, 0, 1e7),
    t0: typeof r["t0"] === "number" ? r["t0"] : 0,
  };
}

function sendState(withText: boolean) {
  if (!relay) return;
  rev = Math.max(rev + 1, Date.now());
  const { t0, text, ...rest } = state;
  relay({
    type: "state",
    from: deskId(),
    rev,
    state: { ...rest, age: Math.max(0, Date.now() - t0), ...(withText ? { text } : {}) },
  });
  if (withText) lastText = text;
}

let seenText = "";

function onLocalChange() {
  if (applying || !relay) return;
  const typing = state.text !== seenText;
  seenText = state.text;
  if (typing) {
    // typing: wait for a pause, then send script + state together
    if (textTimer) clearTimeout(textTimer);
    textTimer = setTimeout(() => {
      textTimer = null;
      sendState(true);
    }, 250);
    return;
  }
  if (textTimer) return; // a script send is already queued and will carry this change too
  sendState(state.text !== lastText); // first send after connecting carries the script
}

/** Connect (or with null, disconnect) the OBS relay. */
export function setPrompterRelay(r: Relay | null) {
  unsubRelay?.();
  unsubRelay = null;
  if (textTimer) clearTimeout(textTimer);
  textTimer = null;
  relay = r;
  if (!r) return;
  lastText = null;
  seenText = state.text;
  unsubRelay = prompterStore.subscribe(onLocalChange);
  r({ type: "hello", from: deskId() }); // ask whoever is running for the current script
}
export const prompterRelayUp = () => relay !== null;

/** A message from another desk / output page. */
export function receivePrompter(raw: unknown) {
  const m = raw as { type?: unknown; from?: unknown; rev?: unknown; state?: unknown } | null;
  const me = deskId();
  if (!m || typeof m.from !== "string" || m.from === me) return;
  if (m.type === "hello") {
    if (relay && rev > 0) {
      const { t0, ...rest } = state;
      relay({
        type: "state",
        from: me,
        rev,
        state: { ...rest, age: Math.max(0, Date.now() - t0) },
      });
      lastText = state.text;
    }
    return;
  }
  if (m.type !== "state" || typeof m.rev !== "number" || !m.state) return;
  if (m.rev < rev || (m.rev === rev && m.from <= me)) return;
  const inc = m.state as Record<string, unknown>;
  const next = cleanPrompter({ ...inc, t0: Date.now() - num(inc["age"], 0, 0, 1e9) }, state);
  rev = m.rev;
  applying = true;
  try {
    prompterStore.set(next);
  } finally {
    applying = false;
  }
  lastText = next.text;
}

export const usePrompter = () =>
  useSyncExternalStore(prompterStore.subscribe, prompterStore.get, () => DEFAULT_PROMPTER);

/** Current scroll position in em. */
export const posOf = (s: PrompterState, now = Date.now()) =>
  s.pos + (s.playing ? (s.speed * 0.1 * (now - s.t0)) / 1000 : 0);

const set = (patch: Partial<PrompterState>) => prompterStore.set({ ...state, ...patch });
/** Change something that affects the running clock: freeze position first, then continue. */
const rebase = (patch: Partial<PrompterState>) => {
  const now = Date.now();
  set({ pos: posOf(state, now), t0: now, ...patch });
};

export const prompter = {
  play: () => state.playing || rebase({ playing: true }),
  pause: () => state.playing && rebase({ playing: false }),
  toggle: () => (state.playing ? prompter.pause() : prompter.play()),
  top: () => set({ pos: 0, t0: Date.now() }),
  /** Jump by em (negative = back). */
  nudge: (em: number) => {
    const now = Date.now();
    set({ pos: Math.max(0, posOf(state, now) + em), t0: now });
  },
  /** The output reached the end of the script. */
  ended: (endEm: number) => state.playing && set({ playing: false, pos: endEm, t0: 0 }),
  setText: (text: string) => set({ text: text.slice(0, 200_000) }),
  setSpeed: (speed: number) => rebase({ speed: Math.max(1, Math.min(20, Math.round(speed))) }),
  setSize: (size: number) => set({ size: Math.max(4, Math.min(18, Math.round(size))) }),
  setMirror: (mirror: boolean) => set({ mirror }),
  setFlip: (flip: boolean) => set({ flip }),
};

function persist() {
  try {
    const { text, speed, size, mirror, flip } = state;
    localStorage.setItem(KEY, JSON.stringify({ text, speed, size, mirror, flip }));
  } catch {
    /* private mode / quota: not fatal */
  }
}

/**
 * Run once from the switcher page: loads the saved script, mirrors every change to the output
 * window(s), answers their "hello" and obeys their keyboard commands. Returns a cleanup.
 */
export function startPrompterHost(): () => void {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<PrompterState> | null;
    if (saved) {
      prompterStore.set({
        ...DEFAULT_PROMPTER,
        text: typeof saved.text === "string" ? saved.text : "",
        speed: typeof saved.speed === "number" ? saved.speed : DEFAULT_PROMPTER.speed,
        size: typeof saved.size === "number" ? saved.size : DEFAULT_PROMPTER.size,
        mirror: saved.mirror === true,
        flip: saved.flip === true,
      });
    }
  } catch {
    /* ignore corrupt storage */
  }

  if (typeof BroadcastChannel === "undefined") return () => {};
  const ch = new BroadcastChannel(PROMPTER_CHANNEL);
  const send = () => ch.postMessage({ type: "state", state });
  ch.onmessage = (e: MessageEvent) => {
    const m = e.data as { type?: string; cmd?: string; em?: number } | undefined;
    if (m?.type === "hello") send();
    else if (m?.type === "ended" && typeof m.em === "number") prompter.ended(m.em);
    else if (m?.type === "cmd") {
      if (m.cmd === "toggle") prompter.toggle();
      else if (m.cmd === "top") prompter.top();
      else if (m.cmd === "back") prompter.nudge(-3);
      else if (m.cmd === "fwd") prompter.nudge(3);
      else if (m.cmd === "faster") prompter.setSpeed(state.speed + 1);
      else if (m.cmd === "slower") prompter.setSpeed(state.speed - 1);
    }
  };
  const unsub = prompterStore.subscribe(() => {
    send();
    persist();
  });
  send();
  return () => {
    unsub();
    ch.close();
  };
}

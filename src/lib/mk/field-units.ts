import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { cleanFieldCtl, DEFAULT_FIELD_ORIENT, FieldViewer, isFieldFps, isFieldKbps, isFieldOrient, isFieldQuality, newFieldRoom, type FieldCtl, type FieldOrient, type FieldTally, type FieldSetup, type FieldState } from "./field-link";

/** First CAM slot (0-based) a field unit may take: CAM 9. Studio cameras CAM 1-8 stay untouched. */
export const FIELD_FIRST_SLOT = 8;

export interface FieldUnitInfo {
  /** What the director chose for this unit's picture. Missing = the default (portrait, 1080p HQ, 30 fps, automatic bitrate). */
  quality?: string;
  fps?: number;
  orient?: FieldOrient;
  /** Forced bitrate in kbps; 0 or missing = automatic. */
  kbps?: number;
  /** Camera / mic settings the director chose (zoom, focus, exposure …). Sent again whenever the reporter reconnects. */
  ctl?: FieldCtl;
  /** Unit number: 1, 2, 3… Also the reporter's connection id. */
  n: number;
  name: string;
  loc: string;
}

interface Saved {
  room: string;
  base: string;
  units: FieldUnitInfo[];
}

const KEY = "mk-field-units";
const EMPTY: Saved = { room: "", base: "", units: [] };

const read = (): Saved => {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Partial<Saved>;
    return {
      room: typeof p.room === "string" ? p.room : "",
      base: typeof p.base === "string" ? p.base : "",
      units: Array.isArray(p.units)
        ? p.units
            .filter((u): u is FieldUnitInfo => !!u && typeof u.n === "number")
            .map((u) => ({ n: u.n, name: String(u.name ?? ""), loc: String(u.loc ?? ""), ...(isFieldQuality(u.quality) ? { quality: u.quality } : {}),
              ...(isFieldFps(u.fps) ? { fps: u.fps } : {}),
              ...(isFieldOrient(u.orient) ? { orient: u.orient } : {}),
              ...(isFieldKbps(u.kbps) ? { kbps: u.kbps } : {}),
              ...(Object.keys(cleanFieldCtl(u.ctl)).length ? { ctl: cleanFieldCtl(u.ctl) } : {}),
            }))
        : [],
    };
  } catch {
    return EMPTY;
  }
};

let state: Saved = EMPTY;
let loaded = false;
const subs = new Set<() => void>();

const write = (next: Saved) => {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f());
};

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  const saved = read();
  state = {
    room: saved.room || newFieldRoom(),
    base: saved.base || window.location.origin,
    units: saved.units,
  };
  write(state);
}

export const fieldUnits = {
  subscribe(f: () => void) {
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  },
  snapshot: () => state,
  init: load,
  add(name: string, loc: string): FieldUnitInfo {
    load();
    const n = state.units.length ? Math.max(...state.units.map((u) => u.n)) + 1 : 1;
    const unit = { n, name: name.trim(), loc: loc.trim() };
    write({ ...state, units: [...state.units, unit] });
    return unit;
  },
  update(n: number, patch: Partial<Pick<FieldUnitInfo, "name" | "loc" | "quality" | "fps" | "orient" | "kbps" | "ctl">>) {
    write({ ...state, units: state.units.map((u) => (u.n === n ? { ...u, ...patch } : u)) });
  },
  remove(n: number) {
    write({ ...state, units: state.units.filter((u) => u.n !== n) });
  },
  setBase(base: string) {
    write({ ...state, base: base.trim() });
  },
  /** Use this room (the one kept in OBS). */
  setRoom(room: string) {
    if (room && room !== state.room) write({ ...state, room });
  },
  /** New room code: every old reporter link and OBS source stops working. */
  newRoom() {
    write({ ...state, room: newFieldRoom() });
  },
};

export const useFieldUnits = () => {
  const s = useSyncExternalStore(fieldUnits.subscribe, fieldUnits.snapshot, () => EMPTY);
  useEffect(() => fieldUnits.init(), []);
  return s;
};

/** The setup the director chose for a unit, in the form the reporter's phone understands. */
export function setupOf(u: Pick<FieldUnitInfo, "quality" | "fps" | "orient" | "kbps">): Partial<FieldSetup> {
  return {
    ...(u.quality ? { res: u.quality } : {}),
    ...(u.fps ? { fps: u.fps } : {}),
    ...(u.orient ? { orient: u.orient } : {}),
    ...(u.kbps !== undefined ? { kbps: u.kbps } : {}),
  };
}

/** Live status (and optionally the picture) of one unit. `setup` is what the director wants the phone to do. */
export function useFieldViewer(room: string, unit: number, video: boolean, setup?: Partial<FieldSetup>, ctl?: FieldCtl) {
  const [, tick] = useState(0);
  const ref = useRef<FieldViewer | null>(null);
  const wantVideo = useRef(video);
  wantVideo.current = video;
  const wantSetup = useRef(setup);
  wantSetup.current = setup;
  const wantCtl = useRef(ctl);
  wantCtl.current = ctl;

  useEffect(() => {
    if (!room) return;
    const v = new FieldViewer(room, unit, { video: wantVideo.current, ...(wantSetup.current ? { setup: wantSetup.current } : {}), ...(wantCtl.current ? { ctl: wantCtl.current } : {}) }, () => tick((x) => x + 1));
    ref.current = v;
    void v.start();
    return () => {
      v.stop();
      ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, unit]);

  useEffect(() => {
    ref.current?.setVideo(video);
  }, [video]);

  const v = ref.current;
  const state: FieldState = v?.state ?? { link: "connecting", quality: "", name: "", loc: "", orient: DEFAULT_FIELD_ORIENT, fps: 0, kbps: 0, held: "", error: null, caps: null, ctl: {}, battery: null, level: 0, ack: 0, talking: false, auto: false, net: null };
  return {
    state,
    stream: v?.stream ?? null,
    setSetup: (p: Partial<FieldSetup>) => v?.setSetup(p),
    setQuality: (id: string) => v?.setQuality(id),
    setCtl: (c: FieldCtl) => v?.setCtl(c),
    // These read the viewer when called, so a call from an effect never meets a stale (null) viewer.
    setTally: (t: FieldTally) => ref.current?.setTally(t),
    cue: (text: string) => ref.current?.cue(text) ?? 0,
    talk: (on: boolean) => ref.current?.talk(on) ?? Promise.resolve<string | null>("The reporter is offline."),
  };
}

/**
 * Sends camera moves to the phone at most about 12 times a second (dragging a slider would otherwise flood it),
 * and always sends the last position.
 */
export function useThrottledCtl(send: (c: FieldCtl) => void, ms = 80) {
  const latest = useRef(send);
  latest.current = send;
  const pending = useRef<FieldCtl>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (patch: FieldCtl) => {
    pending.current = { ...pending.current, ...patch };
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      const p = pending.current;
      pending.current = {};
      latest.current(p);
    }, ms);
  };
}

// Shared setup between desks. The three operators connect to ONE OBS WebSocket; live state
// (scenes, audio, graphics on/off) already comes from OBS. The *setup* (camera mapping, graphics
// design, limiter ...) lived in each browser, so desks drifted apart. Here the shared part is kept
// in OBS itself (obs-websocket "persistent data", one slot per key) and a CustomEvent tells the
// other desks to re-read it. Connection settings (host / password) are NEVER shared.
import { useSyncExternalStore } from "react";

import type { MkConfig } from "./types";

export const SHARED_REALM = "OBS_WEBSOCKET_DATA_REALM_GLOBAL";
export const slotName = (key: string) => `mkvision.shared.v1.${key}`;
export const EVENT_TAG = "mkvision.cfg";

export const SHARED_KEYS = [
  "camScenes",
  "dsks",
  "graphics",
  "graphicsScene",
  "rundown",
  "fx",
  "pips",
  "ad",
  "adPresets",
  "adActive",
  "mergePresets",
  "mergeActive",
  "tags",
  "hiddenAudio",
  "limiter",
  "audioFollowVideo",
] as const satisfies readonly (keyof MkConfig)[];
export type SharedKey = (typeof SHARED_KEYS)[number];

export const isSharedKey = (k: string): k is SharedKey =>
  (SHARED_KEYS as readonly string[]).includes(k);

/** What one slot in OBS holds. `rev` only ever goes up; `by` is the desk that wrote it. */
export interface SharedEntry {
  rev: number;
  by: string;
  value: unknown;
}

export function cleanEntry(raw: unknown): SharedEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r["rev"] !== "number" || !Number.isFinite(r["rev"]) || r["rev"] < 1 || !("value" in r))
    return null;
  return {
    rev: Math.floor(r["rev"]),
    by: typeof r["by"] === "string" ? r["by"] : "",
    value: r["value"],
  };
}

/** Shared keys whose value differs between two configs. */
export function changedKeys(prev: MkConfig, next: MkConfig): SharedKey[] {
  return SHARED_KEYS.filter(
    (k) => prev[k] !== next[k] && JSON.stringify(prev[k]) !== JSON.stringify(next[k]),
  );
}

/** The next revision for a key: always above what OBS holds and what this desk has seen. */
export const nextRev = (remote: SharedEntry | null, known: number) =>
  Math.max(remote?.rev ?? 0, known) + 1;

/**
 * Which remote entries to apply: newer than what this desk has seen, and not a key this desk has
 * an unsent edit for (that edit goes out next and wins).
 */
export function planPull(
  remote: Partial<Record<SharedKey, SharedEntry | null>>,
  known: Partial<Record<SharedKey, number>>,
  dirty: ReadonlySet<string>,
  me: string,
): {
  keys: SharedKey[];
  patch: Partial<Record<SharedKey, unknown>>;
  revs: Partial<Record<SharedKey, number>>;
} {
  const keys: SharedKey[] = [];
  const patch: Partial<Record<SharedKey, unknown>> = {};
  const revs: Partial<Record<SharedKey, number>> = {};
  for (const k of SHARED_KEYS) {
    const e = remote[k];
    if (!e || e.rev <= (known[k] ?? 0) || dirty.has(k)) continue;
    revs[k] = e.rev;
    if (e.by === me) continue; // our own write coming back
    keys.push(k);
    patch[k] = e.value;
  }
  return { keys, patch, revs };
}

// ------------------------------------------------------------------ this desk's identity + status

const ID_KEY = "mkvision.desk.id";
let id: string | null = null;
export function deskId(): string {
  if (id) return id;
  let v: string | null = null;
  try {
    v = typeof window === "undefined" ? null : window.sessionStorage.getItem(ID_KEY);
  } catch {
    /* ignore */
  }
  if (!v) {
    v = Math.random().toString(36).slice(2, 10);
    try {
      window.sessionStorage.setItem(ID_KEY, v);
    } catch {
      /* ignore */
    }
  }
  return (id = v);
}

const REV_KEY = "mkvision.shared.rev.v1";
export function loadKnown(): Partial<Record<SharedKey, number>> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(REV_KEY) ?? "null") as Record<
      string,
      unknown
    > | null;
    const out: Partial<Record<SharedKey, number>> = {};
    if (raw && typeof raw === "object")
      for (const k of SHARED_KEYS) if (typeof raw[k] === "number") out[k] = raw[k] as number;
    return out;
  } catch {
    return {};
  }
}
export function saveKnown(known: Partial<Record<SharedKey, number>>) {
  try {
    window.localStorage.setItem(REV_KEY, JSON.stringify(known));
  } catch {
    /* ignore */
  }
}

export type SyncState = "off" | "ok" | "busy" | "error";
export interface SyncInfo {
  state: SyncState;
  at: number | null;
  /** Desk that last changed something here (not this one). */
  lastKeys: string[];
}

let info: SyncInfo = { state: "off", at: null, lastKeys: [] };
const subs = new Set<() => void>();
export function setSync(patch: Partial<SyncInfo>) {
  info = { ...info, ...patch };
  subs.forEach((l) => l());
}
export function useSync(): SyncInfo {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => info,
    () => info,
  );
}

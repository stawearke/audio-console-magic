// Operator roles. Director, Graphics and Sound operators each open the same app on their own
// PC / phone and connect to the SAME OBS WebSocket. OBS is the single source of truth, so every
// desk reads everything correctly; the role only decides which controls that desk shows
// (and which shared settings it may change). It is a UI guard, not security: OBS has one password.
import { useSyncExternalStore } from "react";

import type { Panel } from "./use-panels";

export type Role = "director" | "graphics" | "sound" | "prompter";
export const ROLES: Role[] = ["director", "graphics", "sound", "prompter"];
export const ROLE_LABEL: Record<Role, string> = {
  director: "Director",
  graphics: "Graphics",
  sound: "Sound",
  prompter: "Prompter",
};

const KEY = "mkvision.role.v1";

export const isRole = (v: unknown): v is Role =>
  typeof v === "string" && (ROLES as string[]).includes(v);

/** Panels each desk may show (the Director sees everything). */
export const ROLE_PANELS: Record<Role, Panel[]> = {
  director: ["multiview", "wall", "audio", "status", "graphics", "sounds"],
  graphics: ["multiview", "status", "graphics"],
  sound: ["multiview", "audio", "sounds"],
  /** The prompter operator gets one screen of their own (no switcher panels at all). */
  prompter: [],
};

/** Parts of the screen that only some desks get. */
export const ROLE_CAN = {
  /** Program / preview buses, cut, auto take, T-bar, DSK, PIP, merge, effects. */
  switch: (r: Role) => r === "director",
  /** Stream / record buttons. */
  output: (r: Role) => r === "director",
  /** Master fader strip + limiter. */
  master: (r: Role) => r === "director" || r === "sound",
  /** Keyboard shortcuts, camera tally, teleprompter host (one desk runs these, not three). */
  host: (r: Role) => r === "director",
  /** Runs the teleprompter script + keeps the output window(s) in step. */
  prompter: (r: Role) => r === "director" || r === "prompter",
};

/** Which shared setup keys a desk may write back to OBS (the Director may write all of them). */
const WRITES: Record<Exclude<Role, "director">, string[]> = {
  graphics: ["graphics", "graphicsScene", "tags"],
  sound: ["hiddenAudio", "limiter", "audioFollowVideo"],
  prompter: [],
};
export const canWrite = (role: Role, key: string) =>
  role === "director" || (WRITES[role] ?? []).includes(key);

let cache: Role | null = null;
const listeners = new Set<() => void>();

function load(): Role {
  try {
    const v = window.localStorage.getItem(KEY);
    return isRole(v) ? v : "director";
  } catch {
    return "director";
  }
}

export function getRole(): Role {
  if (typeof window === "undefined") return "director";
  return (cache ??= load());
}

export function setRole(role: Role) {
  if (cache === role) return;
  cache = role;
  try {
    window.localStorage.setItem(KEY, role);
  } catch {
    /* blocked storage: the role holds until reload */
  }
  listeners.forEach((l) => l());
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useRole(): Role {
  return useSyncExternalStore(subscribe, getRole, () => "director");
}

/** Link to give a crew member: opens the app straight into their desk. */
export function roleLink(role: Role): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/?role=${role}&lock=1`;
}

// ------------------------------------------------------------------ locked desks
// A desk opened from a crew link (…/?role=sound&lock=1) is locked: no desk switch, no links to other
// pages, and typing another address bounces back to its own screen. Open …/?unlock=1 to undo.
// This keeps people on their own job; it is not security (OBS has one password).

const LOCK_KEY = "mkvision.lock.v1";
let lockCache: boolean | null = null;

function loadLock(): boolean {
  try {
    return window.localStorage.getItem(LOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function isLocked(): boolean {
  if (typeof window === "undefined") return false;
  return (lockCache ??= loadLock());
}

export function setLocked(on: boolean) {
  if (lockCache === on) return;
  lockCache = on;
  try {
    if (on) window.localStorage.setItem(LOCK_KEY, "1");
    else window.localStorage.removeItem(LOCK_KEY);
  } catch {
    /* blocked storage: holds until reload */
  }
  listeners.forEach((l) => l());
}

export function useLocked(): boolean {
  return useSyncExternalStore(subscribe, isLocked, () => false);
}

/** Pages each desk may open when locked (the Director is never restricted). */
const ROUTES: Record<Exclude<Role, "director">, string[]> = {
  graphics: ["/", "/graphics", "/onair", "/settings"],
  sound: ["/", "/audio", "/sounds", "/settings"],
  prompter: ["/", "/prompter", "/settings"],
};

export function routeAllowed(role: Role, locked: boolean, path: string): boolean {
  if (!locked || role === "director") return true;
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return ROUTES[role].includes(clean);
}

/** Settings sections a locked desk may see: connection always, plus what its own job needs. */
const SECTIONS: Record<Exclude<Role, "director">, string[]> = {
  graphics: ["OBS Connection", "Graphics"],
  sound: ["OBS Connection", "Sounds", "Listen (hear OBS on this device)"],
  prompter: ["OBS Connection"],
};

export function sectionAllowed(role: Role, locked: boolean, title: string): boolean {
  if (!locked || role === "director") return true;
  return SECTIONS[role].includes(title);
}

/** Hook: is this page / settings section open to the current desk? */
export function useAccess() {
  const role = useRole();
  const locked = useLocked();
  return {
    role,
    locked,
    route: (path: string) => routeAllowed(role, locked, path),
    section: (title: string) => sectionAllowed(role, locked, title),
  };
}

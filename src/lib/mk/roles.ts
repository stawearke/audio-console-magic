// Operator roles. Director, Graphics and Sound operators each open the same app on their own
// PC / phone and connect to the SAME OBS WebSocket. OBS is the single source of truth, so every
// desk reads everything correctly; the role only decides which controls that desk shows
// (and which shared settings it may change). It is a UI guard, not security: OBS has one password.
import { useSyncExternalStore } from "react";

import type { Panel } from "./use-panels";

export type Role = "director" | "graphics" | "sound";
export const ROLES: Role[] = ["director", "graphics", "sound"];
export const ROLE_LABEL: Record<Role, string> = {
  director: "Director",
  graphics: "Graphics",
  sound: "Sound",
};

const KEY = "mkvision.role.v1";

export const isRole = (v: unknown): v is Role =>
  v === "director" || v === "graphics" || v === "sound";

/** Panels each desk may show (the Director sees everything). */
export const ROLE_PANELS: Record<Role, Panel[]> = {
  director: ["multiview", "wall", "audio", "status", "graphics", "sounds"],
  graphics: ["multiview", "status", "graphics"],
  sound: ["multiview", "audio", "sounds"],
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
};

/** Which shared setup keys a desk may write back to OBS (the Director may write all of them). */
const WRITES: Record<Exclude<Role, "director">, string[]> = {
  graphics: ["graphics", "graphicsScene", "tags"],
  sound: ["hiddenAudio", "limiter", "audioFollowVideo"],
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
  return `${window.location.origin}/?role=${role}`;
}

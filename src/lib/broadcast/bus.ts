import type { BusMessage, Program, Show } from "./types";

export const CHANNEL = "onair-graphics";
export const PROGRAM_KEY = "onair:state";
export const SHOWS_KEY = "onair:shows";
export const BACKUP_KEY = "onair:shows:backup";

export function openBus(onMessage: (m: BusMessage) => void) {
  const bc = new BroadcastChannel(CHANNEL);
  bc.onmessage = (e) => onMessage(e.data as BusMessage);
  const onStorage = (e: StorageEvent) => {
    if (e.key === PROGRAM_KEY && e.newValue) {
      try { onMessage({ type: "state", ...JSON.parse(e.newValue) }); } catch { /* ignore */ }
    }
  };
  window.addEventListener("storage", onStorage);
  return {
    send: (m: BusMessage) => bc.postMessage(m),
    close: () => { bc.close(); window.removeEventListener("storage", onStorage); },
  };
}

export function readState(): { program: Program; preview: Program } {
  try {
    const v = localStorage.getItem(PROGRAM_KEY);
    if (v) return JSON.parse(v);
  } catch { /* ignore */ }
  return { program: {}, preview: {} };
}

export function loadShows(): Show[] | null {
  for (const k of [SHOWS_KEY, BACKUP_KEY]) {
    try {
      const v = localStorage.getItem(k);
      if (v) { const s = JSON.parse(v); if (Array.isArray(s) && s.length) return s; }
    } catch { /* try backup */ }
  }
  return null;
}

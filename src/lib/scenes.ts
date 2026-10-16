import { useCallback, useEffect, useState } from "react";
import { sanitizeMixer, type Mixer } from "./mixer-state";

// Scene slots live in this browser only (device-specific mixer settings are never uploaded).
export type Scene = { name: string; mixer: Mixer } | null;
export const SCENE_SLOTS = 8;
const KEY = "voxone-scenes-v2";

export type ScenesApi = {
  slots: Scene[]; current: number;
  store: (i: number) => void; recall: (i: number) => void; rename: (i: number, name: string) => void; clear: (i: number) => void;
};

export function useScenes(getMixer: () => Mixer, apply: (m: Mixer) => void): ScenesApi {
  const [slots, setSlots] = useState<Scene[]>(() => Array<Scene>(SCENE_SLOTS).fill(null));
  const [current, setCurrent] = useState(-1);

  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!Array.isArray(raw)) return;
      setSlots(Array.from({ length: SCENE_SLOTS }, (_, i) => {
        const s = raw[i] as { name?: unknown; mixer?: unknown } | null | undefined;
        if (!s || typeof s.name !== "string") return null;
        try { return { name: s.name.slice(0, 20), mixer: sanitizeMixer(s.mixer) }; } catch { return null; }
      }));
    } catch { /* ignore a corrupt store */ }
  }, []);

  const persist = useCallback((next: Scene[]) => {
    setSlots(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full or blocked */ }
  }, []);

  return {
    slots, current,
    store: (i) => { const next = [...slots]; next[i] = { name: slots[i]?.name ?? `Scene ${i + 1}`, mixer: structuredClone(getMixer()) }; persist(next); setCurrent(i); },
    recall: (i) => { const s = slots[i]; if (s) { apply(structuredClone(s.mixer)); setCurrent(i); } },
    rename: (i, name) => { const s = slots[i]; if (!s) return; const next = [...slots]; next[i] = { ...s, name: name.slice(0, 20) }; persist(next); },
    clear: (i) => { const next = [...slots]; next[i] = null; persist(next); if (current === i) setCurrent(-1); },
  };
}

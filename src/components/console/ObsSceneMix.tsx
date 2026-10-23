import { useEffect, useRef } from "react";
import { loadLinks, loadSlots, slotForScene } from "@/lib/obs-desk";
import { emitAutoRecall, recallSnapshot } from "@/lib/obs-recall";
import { useObsInputs } from "./obs-inputs";

/**
 * Always mounted on the OBS desk (whatever tab is open): when OBS goes to a scene that has a linked snapshot and
 * Auto-recall is on, that mix comes back. The scene OBS is already on when you connect never triggers a recall.
 */
export function SceneMixRunner() {
  const { state, inputs, connected } = useObsInputs();
  const seen = useRef<string | undefined>(undefined);
  const live = useRef(inputs);
  live.current = inputs;
  const scene = state.programScene;
  useEffect(() => {
    if (!connected) { seen.current = undefined; return; }
    if (!scene) return;
    if (seen.current === undefined) { seen.current = scene; return; }
    if (seen.current === scene) return;
    seen.current = scene;
    const links = loadLinks();
    if (!links.auto) return;
    const slots = loadSlots();
    const slot = slotForScene(links, slots, scene);
    if (slot < 0) return;
    const snap = slots[slot]!;
    const plan = recallSnapshot(snap, live.current);
    emitAutoRecall({ scene, slot, name: snap.name, applied: plan.apply.length, missing: plan.missing });
  }, [scene, connected]);
  return null;
}

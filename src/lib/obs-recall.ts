// Puts a saved mix back into OBS (same calls the MK mixer makes), and tells the UI when it happened on its own.
import { engine } from "@/lib/mk/use-switcher";
import type { AudioChannel } from "@/lib/mk/types";
import { recallPlan, type Snapshot } from "@/lib/obs-desk";

export function recallSnapshot(snap: Snapshot, inputs: AudioChannel[]) {
  const plan = recallPlan(snap, inputs);
  for (const n of plan.apply) {
    const want = snap.inputs[n]!;
    const now = inputs.find((c) => c.name === n)!;
    void engine.setAudioVolume(n, want.db);
    if (now.muted !== want.muted) void engine.toggleAudioMute(n);
    if (now.stream !== want.stream) void engine.toggleAudioStream(n);
    engine.setEq(n, want.eq);
    if (want.voice) engine.setVoice(n, want.voice);
  }
  return plan;
}

export interface AutoRecall {
  scene: string;
  slot: number;
  name: string;
  applied: number;
  missing: string[];
}
const listeners = new Set<(e: AutoRecall) => void>();
export const onAutoRecall = (f: (e: AutoRecall) => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
export const emitAutoRecall = (e: AutoRecall) => listeners.forEach((f) => f(e));

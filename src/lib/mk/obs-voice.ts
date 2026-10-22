// Voice processing that runs INSIDE OBS, as native filters on one input. Pure data + maths, no UI.
// Chain order in OBS: denoise -> gate -> EQ -> compressor -> gain (-> master limiter).

export interface ObsVoice {
  denoise: { on: boolean };
  gate: { on: boolean; threshold: number; attack: number; release: number };
  comp: { on: boolean; threshold: number; ratio: number; attack: number; release: number; makeup: number };
}

export const DEFAULT_VOICE: ObsVoice = {
  denoise: { on: false },
  gate: { on: false, threshold: -40, attack: 5, release: 150 },
  comp: { on: false, threshold: -18, ratio: 3, attack: 6, release: 60, makeup: 0 },
};

export type VoiceKey = keyof ObsVoice;

/** OBS filter name + kind for each stage. Names are ours so we never touch the user's own filters. */
export const VOICE_FILTERS: Record<VoiceKey, { name: string; kind: string }> = {
  denoise: { name: "MK Denoise", kind: "noise_suppress_filter_v2" },
  gate: { name: "MK Gate", kind: "noise_gate_filter" },
  comp: { name: "MK Compressor", kind: "compressor_filter" },
};

/** Desired top-to-bottom order of our filters on an input (includes the existing MK EQ / Gain / Limiter). */
export const FILTER_CHAIN = ["MK Denoise", "MK Gate", "MK EQ", "MK Compressor", "MK Gain", "MK Limiter"];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

export function toSettings(key: VoiceKey, v: ObsVoice): Record<string, number | string> {
  if (key === "denoise") return { method: "rnnoise" };
  if (key === "gate") {
    const g = v.gate;
    return { open_threshold: g.threshold, close_threshold: g.threshold - 4, attack_time: g.attack, hold_time: 200, release_time: g.release };
  }
  const c = v.comp;
  return { threshold: c.threshold, ratio: c.ratio, attack_time: c.attack, release_time: c.release, output_gain: c.makeup };
}

/** Fold the settings of one existing OBS filter back into a voice. Missing values keep the default. */
export function applySettings(key: VoiceKey, voice: ObsVoice, on: boolean, st: Record<string, unknown>): void {
  const num = (k: string, d: number) => (typeof st[k] === "number" ? (st[k] as number) : d);
  if (key === "denoise") voice.denoise.on = on;
  else if (key === "gate") {
    voice.gate = { on, threshold: num("open_threshold", voice.gate.threshold), attack: num("attack_time", voice.gate.attack), release: num("release_time", voice.gate.release) };
  } else {
    voice.comp = { on, threshold: num("threshold", voice.comp.threshold), ratio: num("ratio", voice.comp.ratio), attack: num("attack_time", voice.comp.attack), release: num("release_time", voice.comp.release), makeup: num("output_gain", voice.comp.makeup) };
  }
}

/** Ranges the OBS filters accept (also used by the knobs). */
export const VOICE_RANGE = {
  gateThreshold: [-60, 0], gateAttack: [1, 100], gateRelease: [10, 500],
  compThreshold: [-60, 0], compRatio: [1, 20], compAttack: [1, 100], compRelease: [10, 500], compMakeup: [0, 24],
} as const;

/** VOXONE processing settings -> the OBS filters that can reproduce them. */
export function voiceFromDsp(dsp: {
  input: { browserNS: boolean };
  gate: { on: boolean; threshold: number; attack: number; release: number };
  comp: { on: boolean; threshold: number; ratio: number; attack: number; release: number; makeup: number };
}): ObsVoice {
  const R = VOICE_RANGE;
  return {
    denoise: { on: dsp.input.browserNS },
    gate: { on: dsp.gate.on, threshold: clamp(dsp.gate.threshold, ...R.gateThreshold), attack: clamp(dsp.gate.attack, ...R.gateAttack), release: clamp(dsp.gate.release, ...R.gateRelease) },
    comp: {
      on: dsp.comp.on, threshold: clamp(dsp.comp.threshold, ...R.compThreshold), ratio: clamp(dsp.comp.ratio, ...R.compRatio),
      attack: clamp(dsp.comp.attack, ...R.compAttack), release: clamp(dsp.comp.release, ...R.compRelease), makeup: clamp(dsp.comp.makeup, ...R.compMakeup),
    },
  };
}

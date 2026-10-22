// Voice processing that runs INSIDE OBS, as native filters on one input. Pure data + maths, no UI.
// Chain order in OBS: denoise -> gate -> EQ -> compressor -> gain (-> master limiter).

export interface ObsVoice {
  denoise: { on: boolean };
  gate: { on: boolean; threshold: number; attack: number; release: number };
  comp: { on: boolean; threshold: number; ratio: number; attack: number; release: number; makeup: number };
  /** Ducking: this input drops while `source` (another OBS input, usually a mic) is loud. An OBS compressor with a sidechain. */
  duck: { on: boolean; source: string; threshold: number; ratio: number; attack: number; release: number };
}

export const DEFAULT_VOICE: ObsVoice = {
  denoise: { on: false },
  gate: { on: false, threshold: -40, attack: 5, release: 150 },
  comp: { on: false, threshold: -18, ratio: 3, attack: 6, release: 60, makeup: 0 },
  duck: { on: false, source: "", threshold: -35, ratio: 12, attack: 20, release: 400 },
};

export type VoiceKey = keyof ObsVoice;

/** OBS filter name + kind for each stage. Names are ours so we never touch the user's own filters. */
export const VOICE_FILTERS: Record<VoiceKey, { name: string; kind: string }> = {
  denoise: { name: "MK Denoise", kind: "noise_suppress_filter_v2" },
  gate: { name: "MK Gate", kind: "noise_gate_filter" },
  comp: { name: "MK Compressor", kind: "compressor_filter" },
  duck: { name: "MK Duck", kind: "compressor_filter" },
};

/** Desired top-to-bottom order of our filters on an input (includes the existing MK EQ / Gain / Limiter). */
export const FILTER_CHAIN = ["MK Denoise", "MK Gate", "MK EQ", "MK Compressor", "MK Duck", "MK Gain", "MK Limiter"];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

export function toSettings(key: VoiceKey, v: ObsVoice): Record<string, number | string> {
  if (key === "denoise") return { method: "rnnoise" };
  if (key === "gate") {
    const g = v.gate;
    return { open_threshold: g.threshold, close_threshold: g.threshold - 4, attack_time: g.attack, hold_time: 200, release_time: g.release };
  }
  if (key === "duck") {
    const d = v.duck;
    return { sidechain_source: d.source, threshold: d.threshold, ratio: d.ratio, attack_time: d.attack, release_time: d.release, output_gain: 0 };
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
  } else if (key === "duck") {
    voice.duck = {
      on, source: typeof st["sidechain_source"] === "string" ? (st["sidechain_source"] as string) : voice.duck.source,
      threshold: num("threshold", voice.duck.threshold), ratio: num("ratio", voice.duck.ratio), attack: num("attack_time", voice.duck.attack), release: num("release_time", voice.duck.release),
    };
  } else {
    voice.comp = { on, threshold: num("threshold", voice.comp.threshold), ratio: num("ratio", voice.comp.ratio), attack: num("attack_time", voice.comp.attack), release: num("release_time", voice.comp.release), makeup: num("output_gain", voice.comp.makeup) };
  }
}

/** Ranges the OBS filters accept (also used by the knobs). */
export const VOICE_RANGE = {
  gateThreshold: [-60, 0], gateAttack: [1, 100], gateRelease: [10, 500],
  compThreshold: [-60, 0], compRatio: [1, 20], compAttack: [1, 100], compRelease: [10, 500], compMakeup: [0, 24],
  duckThreshold: [-60, 0], duckRatio: [2, 32], duckAttack: [1, 100], duckRelease: [10, 1000],
} as const;

/** Anything from a snapshot file or storage -> a complete, valid voice (older saves have no duck; junk is ignored). */
export function normalizeVoice(raw: unknown): ObsVoice {
  const v = JSON.parse(JSON.stringify(DEFAULT_VOICE)) as ObsVoice;
  if (!raw || typeof raw !== "object") return v;
  const r = raw as Record<string, unknown>;
  for (const key of Object.keys(VOICE_FILTERS) as VoiceKey[]) {
    const src = r[key];
    if (!src || typeof src !== "object") continue;
    const dst = v[key] as Record<string, unknown>;
    for (const k of Object.keys(dst)) {
      const x = (src as Record<string, unknown>)[k];
      if (typeof x === typeof dst[k] && (typeof x !== "number" || Number.isFinite(x))) dst[k] = x;
    }
  }
  return v;
}

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
    // VOXONE ducks from a channel of its own desk; an OBS duck needs an OBS input, so it starts off.
    duck: { ...DEFAULT_VOICE.duck },
  };
}

import type { Dsp, PanLaw } from "./mixer-state";

type BiquadType = "lowshelf" | "highshelf" | "peaking";

// RBJ cookbook magnitude response in dB (matches the Web Audio biquad closely enough for a display).
function response(type: BiquadType, f0: number, gainDb: number, q: number, freqs: number[], sr: number): number[] {
  const A = Math.pow(10, gainDb / 40), w0 = (2 * Math.PI * f0) / sr, cos = Math.cos(w0), sin = Math.sin(w0);
  const alpha = type === "peaking" ? sin / (2 * q) : sin / Math.SQRT2;
  const s = 2 * Math.sqrt(A) * alpha;
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (type === "peaking") { b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A; }
  else if (type === "lowshelf") { b0 = A * (A + 1 - (A - 1) * cos + s); b1 = 2 * A * (A - 1 - (A + 1) * cos); b2 = A * (A + 1 - (A - 1) * cos - s); a0 = A + 1 + (A - 1) * cos + s; a1 = -2 * (A - 1 + (A + 1) * cos); a2 = A + 1 + (A - 1) * cos - s; }
  else { b0 = A * (A + 1 + (A - 1) * cos + s); b1 = -2 * A * (A - 1 + (A + 1) * cos); b2 = A * (A + 1 + (A - 1) * cos - s); a0 = A + 1 - (A - 1) * cos + s; a1 = 2 * (A - 1 - (A + 1) * cos); a2 = A + 1 - (A - 1) * cos - s; }
  return freqs.map(f => {
    const w = (2 * Math.PI * f) / sr, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2);
    const dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
    return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
  });
}

export function eqCurve(eq: Dsp["eq"], freqs: number[], sr = 48000): number[] {
  if (!eq.on) return freqs.map(() => 0);
  const bands = [
    response("lowshelf", eq.lowFreq, eq.lowGain, 0.7, freqs, sr),
    response("peaking", eq.lmFreq, eq.lmGain, eq.lmQ, freqs, sr),
    response("peaking", eq.hmFreq, eq.hmGain, eq.hmQ, freqs, sr),
    response("highshelf", eq.highFreq, eq.highGain, 0.7, freqs, sr),
  ];
  return freqs.map((_, i) => bands.reduce((sum, b) => sum + (b[i] ?? 0), 0));
}

// Left/right gains for a mono source. Laws differ in how much the centre is attenuated.
export function panGains(pan: number, law: PanLaw): [number, number] {
  const x = (Math.min(100, Math.max(-100, pan)) + 100) / 200; // 0 = left, 1 = right
  if (law === "0") return [Math.min(1, 2 * (1 - x)), Math.min(1, 2 * x)];
  const lin: [number, number] = [1 - x, x];
  const pow: [number, number] = [Math.cos((x * Math.PI) / 2), Math.sin((x * Math.PI) / 2)];
  if (law === "-6") return lin;
  if (law === "-3") return pow;
  return [Math.sqrt(lin[0] * pow[0]), Math.sqrt(lin[1] * pow[1])];
}

// Stereo balance: attenuate only the far side.
export function balanceGains(pan: number): [number, number] {
  const p = Math.min(100, Math.max(-100, pan)) / 100;
  return [p > 0 ? 1 - p : 1, p < 0 ? 1 + p : 1];
}

export function compOut(c: Dsp["comp"], inDb: number): number {
  const knee = 6;
  const over = inDb - c.threshold;
  let out: number;
  if (2 * over < -knee) out = inDb;
  else if (2 * Math.abs(over) <= knee) out = inDb + ((1 / c.ratio - 1) * (over + knee / 2) ** 2) / (2 * knee);
  else out = c.threshold + over / c.ratio;
  return out + c.makeup;
}

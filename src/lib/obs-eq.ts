// The OBS "3 band equalizer" has three gains (low, mid, high) and fixed crossovers, nothing else.
// This draws an approximate curve for it and turns graph drags into gain changes. Pure functions, no UI.
import { flatDsp, type Dsp } from "@/lib/mixer-state";
import { EQ_RANGE, type EqValues } from "@/lib/mk/types";

export type ObsEqKey = "lo" | "mid" | "hi";

/** Where the three points sit on the graph (Hz). Only their height is adjustable. */
export const OBS_EQ_NODES: ReadonlyArray<{ key: ObsEqKey; label: string; f: number }> = [
  { key: "lo", label: "L", f: 300 },
  { key: "mid", label: "M", f: 2000 },
  { key: "hi", label: "H", f: 8000 },
];

/** dB shown above and below the centre line. */
export const OBS_EQ_SPAN = 18;

/** The three OBS gains as a parametric curve (low shelf, wide middle bell, high shelf) for drawing. */
export function obsEqCurve(eq: Pick<EqValues, "lo" | "mid" | "hi">): Dsp["eq"] {
  return { ...flatDsp().eq, on: true, lowGain: eq.lo, lowFreq: 800, lmGain: eq.mid, lmFreq: 2000, lmQ: 0.45, hmGain: 0, highGain: eq.hi, highFreq: 5000 };
}

/** Graph height position -> gain, kept inside what the OBS filter accepts and rounded to 0.5 dB. */
export function gainFromY(y: number, height: number, key: ObsEqKey): number {
  if (!(height > 0) || !Number.isFinite(y)) return 0;
  const raw = ((height / 2 - y) / (height / 2)) * OBS_EQ_SPAN;
  const [lo, hi] = EQ_RANGE[key];
  const g = Math.round(Math.max(lo, Math.min(hi, raw)) * 2) / 2;
  return g === 0 ? 0 : g; // never -0
}

/** Which point a press at horizontal position x belongs to: the one closest along the frequency axis. */
export function nearestNode(x: number, width: number): number {
  if (!(width > 0)) return 0;
  const fx = (f: number) => (Math.log10(f / 20) / 3) * width;
  let best = 0;
  let bd = Infinity;
  OBS_EQ_NODES.forEach((n, i) => {
    const d = Math.abs(x - fx(n.f));
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

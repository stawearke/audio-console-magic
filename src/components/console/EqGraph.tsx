import { useEffect, useRef } from "react";
import type { Dsp } from "@/lib/mixer-state";
import { eqCurve } from "@/lib/dsp-math";

type Eq = Dsp["eq"];
const BANDS = [
  { f: "lowFreq", g: "lowGain", lo: 30, hi: 500 },
  { f: "lmFreq", g: "lmGain", lo: 100, hi: 2000, q: "lmQ" },
  { f: "hmFreq", g: "hmGain", lo: 1000, hi: 8000, q: "hmQ" },
  { f: "highFreq", g: "highGain", lo: 4000, hi: 18000 },
] as const;
const RANGE = 18; // dB shown above and below the centre line
const xOf = (f: number, w: number) => (Math.log10(f / 20) / 3) * w;

// EQ curve drawn from the channel's own settings (works before audio starts).
// Drag a band node to change frequency and gain; scroll over it to change Q.
export function EqGraph({ eq, getAnalyser, onChange, compact, className }: {
  eq: Eq; getAnalyser?: () => AnalyserNode | null; onChange?: (patch: Partial<Eq>) => void; compact?: boolean; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const eqRef = useRef(eq);
  eqRef.current = eq;
  const drag = useRef(-1);

  useEffect(() => {
    let raf = 0;
    const N = 120;
    const freqs = Array.from({ length: N }, (_, i) => 20 * Math.pow(1000, i / (N - 1)));
    const draw = () => {
      const cv = ref.current;
      const g = cv?.getContext("2d");
      if (!cv || !g) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      const css = getComputedStyle(cv);
      const e = eqRef.current;
      g.clearRect(0, 0, w, h);
      g.strokeStyle = css.getPropertyValue("--grid"); g.lineWidth = 1;
      [100, 1000, 10000].forEach((f) => { const x = xOf(f, w); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); });
      g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
      const an = compact ? null : getAnalyser?.() ?? null;
      if (an) {
        const data = new Float32Array(an.frequencyBinCount);
        an.getFloatFrequencyData(data);
        g.fillStyle = css.getPropertyValue("--spectrum");
        g.beginPath(); g.moveTo(0, h);
        for (let i = 0; i < w; i += 3) {
          const f = 20 * Math.pow(1000, i / w);
          const bin = Math.min(data.length - 1, Math.round((f / (an.context.sampleRate / 2)) * data.length));
          const y = h - (((data[bin] ?? -100) + 100) / 80) * h;
          g.lineTo(i, Math.min(h, Math.max(0, y)));
        }
        g.lineTo(w, h); g.fill();
      }
      const total = eqCurve(e, freqs, an?.context.sampleRate ?? 48000);
      g.strokeStyle = css.getPropertyValue("--curve"); g.lineWidth = (compact ? 1.5 : 2) * dpr;
      g.beginPath();
      total.forEach((v, i) => { const x = (i / (N - 1)) * w, y = h / 2 - (Math.max(-RANGE, Math.min(RANGE, v)) / RANGE) * (h / 2); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
      if (!compact && e.on) {
        BANDS.forEach((b, i) => {
          const x = xOf(e[b.f], w), y = h / 2 - (e[b.g] / RANGE) * (h / 2);
          g.fillStyle = css.getPropertyValue("--curve"); g.globalAlpha = drag.current === i ? 1 : 0.85;
          g.beginPath(); g.arc(x, y, 5 * dpr, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
          g.fillStyle = css.getPropertyValue("--c-display-text") || "#000";
          g.font = `${8 * dpr}px monospace`; g.textAlign = "center"; g.fillText(String(i + 1), x, y + 3 * dpr);
        });
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getAnalyser, compact]);

  const nearest = (ev: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return -1;
    const e = eqRef.current; let best = -1, bd = 18;
    BANDS.forEach((b, i) => {
      const x = xOf(e[b.f], r.width), y = r.height / 2 - (e[b.g] / RANGE) * (r.height / 2);
      const dist = Math.hypot(ev.clientX - r.left - x, ev.clientY - r.top - y);
      if (dist < bd) { bd = dist; best = i; }
    });
    return best;
  };
  const move = (ev: React.PointerEvent) => {
    const i = drag.current, r = ref.current?.getBoundingClientRect(), b = BANDS[i];
    if (!r || !b || !onChange) return;
    const f = 20 * Math.pow(1000, Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)));
    const gain = Math.round(Math.max(-15, Math.min(15, ((r.height / 2 - (ev.clientY - r.top)) / (r.height / 2)) * RANGE)) * 2) / 2;
    onChange({ [b.f]: Math.round(Math.min(b.hi, Math.max(b.lo, f))), [b.g]: gain, on: true });
  };

  return <canvas ref={ref} className={`eq-screen ${compact ? "h-10" : "h-32"} w-full rounded-md ${compact ? "" : "touch-none"} ${className ?? ""}`}
    onPointerDown={compact || !onChange ? undefined : (ev) => { const i = nearest(ev); if (i >= 0) { drag.current = i; (ev.target as HTMLElement).setPointerCapture(ev.pointerId); } }}
    onPointerMove={compact ? undefined : (ev) => { if (drag.current >= 0) move(ev); }}
    onPointerUp={() => { drag.current = -1; }}
    onWheel={compact || !onChange ? undefined : (ev) => {
      const i = nearest(ev as unknown as React.PointerEvent), b = BANDS[i];
      if (b && "q" in b) { const q = eqRef.current[b.q]; onChange({ [b.q]: Math.round(Math.min(8, Math.max(0.3, q - Math.sign(ev.deltaY) * 0.2)) * 10) / 10 }); }
    }}
    aria-label="Parametric EQ graph. Drag the numbered points to change frequency and gain." />;
}

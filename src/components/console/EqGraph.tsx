import { useEffect, useRef } from "react";
import type { Params } from "@/lib/audio-engine";

// Draws the combined EQ curve plus a live spectrum.
export function EqGraph({ params, getFilters, getAnalyser }: {
  params: Params; getFilters: () => BiquadFilterNode[]; getAnalyser: () => AnalyserNode | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pRef = useRef(params);
  pRef.current = params;

  useEffect(() => {
    let raf = 0;
    const N = 200;
    const freqs = new Float32Array(N);
    for (let i = 0; i < N; i++) freqs[i] = 20 * Math.pow(1000, i / (N - 1));
    const mag = new Float32Array(N), ph = new Float32Array(N);
    const draw = () => {
      const cv = ref.current;
      if (!cv) return;
      const g = cv.getContext("2d")!;
      const w = (cv.width = cv.clientWidth * devicePixelRatio);
      const h = (cv.height = cv.clientHeight * devicePixelRatio);
      const css = getComputedStyle(cv);
      g.clearRect(0, 0, w, h);
      g.strokeStyle = css.getPropertyValue("--grid");
      g.lineWidth = 1;
      [100, 1000, 10000].forEach((f) => { const x = (Math.log10(f / 20) / 3) * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); });
      g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();

      const an = getAnalyser();
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

      const filters = getFilters();
      const total = new Float32Array(N);
      filters.forEach((f) => { f.getFrequencyResponse(freqs, mag, ph); for (let i = 0; i < N; i++) total[i] = (total[i] ?? 0) + 20 * Math.log10(mag[i] ?? 1); });
      if (!filters.length) {
        const e = pRef.current.eq;
        void e;
      }
      g.strokeStyle = css.getPropertyValue("--curve");
      g.lineWidth = 2 * devicePixelRatio;
      g.beginPath();
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * w;
        const y = h / 2 - ((total[i] ?? 0) / 18) * (h / 2);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getFilters, getAnalyser]);

  return <canvas ref={ref} className="eq-screen h-32 w-full rounded-md" />;
}

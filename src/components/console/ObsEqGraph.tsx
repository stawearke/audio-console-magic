import { useEffect, useRef } from "react";
import { eqCurve } from "@/lib/dsp-math";
import { OBS_EQ_NODES, OBS_EQ_SPAN, gainFromY, nearestNode, obsEqCurve } from "@/lib/obs-eq";
import type { EqValues } from "@/lib/mk/types";

const xOf = (f: number, w: number) => (Math.log10(f / 20) / 3) * w;

/** The OBS 3-band EQ drawn as a curve. Drag the L, M or H point up or down to change that band. */
export function ObsEqGraph({ eq, onChange }: { eq: EqValues; onChange?: ((patch: Partial<EqValues>) => void) | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef(-1);

  useEffect(() => {
    const draw = () => {
      const cv = ref.current;
      const g = cv?.getContext("2d");
      if (!cv || !g) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(cv.clientWidth * dpr);
      const h = Math.round(cv.clientHeight * dpr);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      const css = getComputedStyle(cv);
      g.clearRect(0, 0, w, h);
      g.strokeStyle = css.getPropertyValue("--grid");
      g.lineWidth = 1;
      [100, 1000, 10000].forEach((f) => { const x = xOf(f, w); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); });
      g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
      const N = 120;
      const freqs = Array.from({ length: N }, (_, i) => 20 * Math.pow(1000, i / (N - 1)));
      const curve = eqCurve(obsEqCurve(eq), freqs);
      g.strokeStyle = css.getPropertyValue("--curve");
      g.lineWidth = 2 * dpr;
      g.beginPath();
      curve.forEach((v, i) => {
        const x = (i / (N - 1)) * w;
        const y = h / 2 - (Math.max(-OBS_EQ_SPAN, Math.min(OBS_EQ_SPAN, v)) / OBS_EQ_SPAN) * (h / 2);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.stroke();
      OBS_EQ_NODES.forEach((n, i) => {
        const x = xOf(n.f, w);
        const y = h / 2 - (eq[n.key] / OBS_EQ_SPAN) * (h / 2);
        g.fillStyle = css.getPropertyValue("--curve");
        g.globalAlpha = drag.current === i ? 1 : 0.85;
        g.beginPath(); g.arc(x, y, 7 * dpr, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
        g.fillStyle = css.getPropertyValue("--c-display-text") || "#000";
        g.font = `${9 * dpr}px monospace`; g.textAlign = "center"; g.fillText(n.label, x, y + 3 * dpr);
      });
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [eq]);

  const set = (ev: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    const n = OBS_EQ_NODES[drag.current];
    if (!r || !n || !onChange) return;
    onChange({ [n.key]: gainFromY(ev.clientY - r.top, r.height, n.key) });
  };

  return (
    <canvas
      ref={ref}
      className="eq-screen h-32 w-full touch-none rounded-md"
      aria-label="EQ graph. Drag the L, M and H points up or down to change the low, mid and high gain."
      onPointerDown={onChange ? (ev) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        drag.current = nearestNode(ev.clientX - r.left, r.width);
        (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
        set(ev);
      } : undefined}
      onPointerMove={(ev) => { if (drag.current >= 0) set(ev); }}
      onPointerUp={() => { drag.current = -1; }}
    />
  );
}

import { useEffect, useRef } from "react";
import { compOut } from "@/lib/dsp-math";
import type { Dsp } from "@/lib/mixer-state";
import { useDesk } from "./desk-context";

export function CompCurve({ comp, size = "h-24 w-24" }: { comp: Dsp["comp"]; size?: string }) {
  const pts = [-60, -50, -40, -30, -20, -10, 0].map((x) => [x, comp.on ? compOut({ ...comp }, x) : x] as const);
  const sx = (v: number) => ((v + 60) / 60) * 100, sy = (v: number) => 100 - ((Math.max(-60, Math.min(0, v)) + 60) / 60) * 100;
  return <svg viewBox="0 0 100 100" className={`eq-screen ${size} rounded-md`} role="img" aria-label="Compressor transfer curve">
    <line x1="0" y1="100" x2="100" y2="0" stroke="var(--grid)" strokeWidth="1" />
    <polyline fill="none" stroke="var(--curve)" strokeWidth="3" points={pts.map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ")} />
  </svg>;
}

// FILTERS / GATE / COMP / EQ badges. Lit when the processor is on; GATE and COMP flash while they are reducing the signal.
export function ActivityBadges({ id, dsp }: { id: string; dsp: Dsp }) {
  const d = useDesk();
  const gate = useRef<HTMLSpanElement>(null), comp = useRef<HTMLSpanElement>(null), ds = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const e = d.getEngine();
      if (e.ready) {
        if (gate.current) gate.current.dataset["act"] = String(e.gateReduction(id) > 6);
        if (comp.current) comp.current.dataset["act"] = String(e.compReduction(id) > 1);
        if (ds.current) ds.current.dataset["act"] = String(e.deessReduction(id) > 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [d, id]);
  const on = dsp.input.hpfOn || dsp.input.lpfOn;
  return <div className="strip-badges">
    <span className="badge" data-on={on}>FILTERS</span>
    <span className="badge" ref={gate} data-on={dsp.gate.on}>GATE</span>
    <span className="badge" ref={comp} data-on={dsp.comp.on}>COMP</span>
    <span className="badge" ref={ds} data-on={dsp.deess.on}>DE-ESS</span>
    <span className="badge" data-on={dsp.eq.on}>EQ</span>
    <span className="badge" data-on={dsp.duck.on}>DUCK</span>
  </div>;
}

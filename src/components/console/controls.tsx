import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type KnobProps = {
  label: string; value: number; min: number; max: number; step?: number;
  unit?: string; def?: number; log?: boolean; onChange: (v: number) => void;
};

export function Knob({ label, value, min, max, step = 1, unit = "", def, log, onChange }: KnobProps) {
  const toNorm = (v: number) => (log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min));
  const fromNorm = (x: number) => {
    const raw = log ? min * Math.pow(max / min, x) : min + x * (max - min);
    return Math.round(raw / step) * step;
  };
  const norm = Math.min(1, Math.max(0, toNorm(value)));
  const angle = -135 + norm * 270;

  const onPointerDown = (e: React.PointerEvent) => {
    const startY = e.clientY;
    const start = norm;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const x = Math.min(1, Math.max(0, start + (startY - ev.clientY) / 180));
      onChange(fromNorm(x));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const shown = Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : Number.isInteger(step) ? value.toFixed(0) : value.toFixed(1);

  return (
    <div className="flex w-16 flex-col items-center gap-1 select-none">
      <div
        className="knob relative size-11 cursor-ns-resize touch-none rounded-full"
        onPointerDown={onPointerDown}
        onDoubleClick={() => def !== undefined && onChange(def)}
        onWheel={(e) => onChange(fromNorm(Math.min(1, Math.max(0, norm - Math.sign(e.deltaY) * 0.03))))}
        role="slider" aria-label={label} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max}
         tabIndex={0}
         onKeyDown={(e) => { if (["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", "Home", "End"].includes(e.key)) { e.preventDefault(); onChange(e.key === "Home" ? min : e.key === "End" ? max : Math.min(max, Math.max(min, value + (["ArrowUp", "ArrowRight"].includes(e.key) ? step : -step)))); } }}
        style={{ ["--knob-fill" as string]: `${norm * 270}deg` }}
      >
        <div className="knob-cap absolute inset-1.5 rounded-full" style={{ transform: `rotate(${angle}deg)` }}>
          <span className="knob-pointer absolute left-1/2 top-0.5 h-2.5 w-0.5 -translate-x-1/2 rounded-full" />
        </div>
      </div>
      <span className="readout text-[10px]">{shown}{unit}</span>
      <span className="label-text text-[9px] uppercase tracking-widest">{label}</span>
    </div>
  );
}

export function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="ghost" size="sm" aria-pressed={on} onClick={onClick} className="console-btn flex h-7 items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-widest" data-on={on}>
      <span className="led size-1.5 rounded-full" data-on={on} />
      {children}
    </Button>
  );
}

export function Module({ title, on, onToggle, children, extra }: { title: string; on?: boolean; onToggle?: () => void; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="module flex flex-col gap-3 rounded-lg p-3" data-on={on ?? true}>
      <header className="flex items-center justify-between gap-2">
        <h3 className="module-title text-[11px] font-bold uppercase tracking-[0.2em]">{title}</h3>
        <div className="flex items-center gap-2">
          {extra}
          {onToggle && <Toggle on={!!on} onClick={onToggle}>{on ? "On" : "Off"}</Toggle>}
        </div>
      </header>
      <div className="flex flex-wrap justify-center gap-x-1 gap-y-3">{children}</div>
    </section>
  );
}

export function Meter({ read, label, mode = "level" }: { read: () => number; label: string; mode?: "level" | "gr" }) {
  const bar = useRef<HTMLDivElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0; let hold = -100;
    const tick = () => {
      const v = read();
      if (bar.current) {
        const pct = mode === "gr" ? Math.min(100, (v / 20) * 100) : Math.min(100, Math.max(0, ((v + 60) / 60) * 100));
        bar.current.style.height = `${pct}%`;
      }
      hold = Math.max(v, hold - 0.4);
      if (txt.current) txt.current.textContent = mode === "gr" ? `-${v.toFixed(1)}` : hold <= -60 ? "-∞" : hold.toFixed(1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [read, mode]);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="meter-track relative h-40 w-3 overflow-hidden rounded-sm">
        <div ref={bar} className={`${mode === "gr" ? "meter-gr top-0" : "meter-fill bottom-0"} absolute inset-x-0`} style={{ height: 0 }} />
      </div>
      <span ref={txt} className="readout w-10 text-center text-[10px]">-∞</span>
      <span className="label-text text-[9px] uppercase tracking-widest">{label}</span>
    </div>
  );
}

export function Fader({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <input
        type="range" min={-30} max={12} step={0.5} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(0)}
        className="fader h-40" aria-label={label}
        style={{ writingMode: "vertical-lr", direction: "rtl" }}
      />
      <span className="readout text-[10px]">{value > 0 ? "+" : ""}{value.toFixed(1)}</span>
      <span className="label-text text-[9px] uppercase tracking-widest">{label}</span>
    </div>
  );
}

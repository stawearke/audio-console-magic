import { useEffect, useRef, useState, type ReactNode } from "react";
import { getTemplate } from "./templates";
import { LAYERS, type LiveGraphic, type Program } from "./types";

/** Scales a fixed 1920x1080 canvas to fit its container. */
export function Stage({ children, className = "", fit = "width" }: { children: ReactNode; className?: string; fit?: "width" | "contain" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [s, setS] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setS(fit === "contain" ? Math.min(r.width / 1920, r.height / 1080) : r.width / 1920);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);
  return (
    <div ref={ref} className={`relative overflow-hidden ${fit === "width" ? "aspect-video w-full" : "h-full w-full"} ${className}`}>
      {s > 0 && (
        <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transform: `scale(${s})`, transformOrigin: "0 0" }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function Graphic({ g }: { g: LiveGraphic }) {
  const t = getTemplate(g.item.templateId);
  if (!t) return null;
  return <t.Render data={{ ...t.defaults, ...g.item.data }} theme={g.theme} takenAt={g.take} />;
}

/** One layer: animates in on new TAKE, swaps content on UPDATE, animates out on CLEAR. */
function LayerSlot({ live, z }: { live: LiveGraphic | undefined; z: number }) {
  const [shown, setShown] = useState<LiveGraphic | undefined>(live);
  const [phase, setPhase] = useState<"in" | "out">("in");
  useEffect(() => {
    if (live) {
      setShown(live);
      setPhase("in");
      return;
    }
    if (!shown) return;
    setPhase("out");
    const t = setTimeout(() => setShown(undefined), shown.item.animMs + 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
  if (!shown) return null;
  return (
    <div
      key={shown.take}
      className={`gfx gfx-${phase}-${shown.item.transition}`}
      style={{ position: "absolute", inset: 0, zIndex: z, ["--gfx-d" as string]: `${shown.item.animMs}ms` }}
    >
      <Graphic g={shown} />
    </div>
  );
}

export function ProgramView({ program }: { program: Program }) {
  return (
    <>
      {LAYERS.map((l, i) => (
        <LayerSlot key={l} live={program[l]} z={(i + 1) * 10} />
      ))}
    </>
  );
}

export function SafeGuides() {
  return (
    <>
      <div style={{ position: "absolute", inset: "5%", border: "2px dashed rgba(255,255,255,.25)", pointerEvents: "none", zIndex: 999 }} />
      <div style={{ position: "absolute", inset: "10%", border: "2px dashed rgba(255,200,0,.3)", pointerEvents: "none", zIndex: 999 }} />
    </>
  );
}

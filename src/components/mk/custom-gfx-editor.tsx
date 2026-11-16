// Custom graphic editor: shapes, text and images on a 1920 x 1080 canvas, each with its own entrance.
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Lock, LockOpen, Pause, Play, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CustomFields } from "@/components/mk/custom-fields";
import { CUSTOM_TEMPLATES, makeEl, newElId } from "@/lib/mk/custom-gfx";
import { BARLOW_IMPORT_CSS, CUSTOM_KEYFRAMES, customElHtml, customPoseAt, fileToLogo, NEUTRAL_POSE } from "@/lib/mk/graphics";
import { CUSTOM_ANIMS, CUSTOM_EASES, CUSTOM_LOOPS, GFX_FONTS, type CustomEl, type CustomElType, type CustomKey } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

const field = "mk-field h-8 w-full min-w-0 rounded-[3px] px-2 text-xs";
const CW = 1920;
const CH = 1080;
const SNAP = 12;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="mk-label text-[9px]">{label}</span>
      {children}
    </label>
  );
}
function Colour({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="color"
      className="h-8 w-full cursor-pointer rounded-[3px] border border-white/15 bg-black/30 p-0.5"
      value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
function Num({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <Row label={label}>
      <input
        type="number"
        className={field}
        value={Math.round(value * 100) / 100}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </Row>
  );
}
function Slide({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <Row label={`${label} ${Math.round(value)}${unit}`}>
      <input type="range" className="mk-range h-8" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Row>
  );
}

type Edit = (id: string, patch: Partial<CustomEl>) => void;

/** The canvas: renders the real output HTML, with drag / resize handles on top. */
export function CustomCanvas({
  elements,
  onChange,
  sel,
  setSel,
  backdropClass,
  scrub,
  onLive,
}: {
  elements: CustomEl[];
  onChange: (els: CustomEl[]) => void;
  sel: string | null;
  setSel: (id: string | null) => void;
  backdropClass: string;
  /** Time (ms) the timeline is parked at; null = play normally. */
  scrub: number | null;
  onLive: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0);
  const [mode, setMode] = useState<"in" | "out">("in");
  const drag = useRef<{ id: string; mode: string; sx: number; sy: number; o: CustomEl; k: number } | null>(null);
  const els = useRef(elements);
  els.current = elements;

  const html =
    `<style>${BARLOW_IMPORT_CSS}${CUSTOM_KEYFRAMES}</style>` + elements.map((e) => customElHtml(e, (px) => `${(px / 19.2).toFixed(3)}cqw`, scrub ?? mode)).join("");

  const snap = (v: number, targets: number[]) => {
    for (const t of targets) if (Math.abs(v - t) < SNAP) return t;
    return v;
  };

  const down = (e: React.PointerEvent, el: CustomEl, mode: string) => {
    e.stopPropagation();
    setSel(el.id);
    if (el.locked) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const r = box.current!.getBoundingClientRect();
    drag.current = { id: el.id, mode, sx: e.clientX, sy: e.clientY, o: { ...el }, k: CW / r.width };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) * d.k;
    const dy = (e.clientY - d.sy) * d.k;
    let { x, y, w, h } = d.o;
    if (d.mode === "move") {
      x = snap(d.o.x + dx, [0, (CW - w) / 2, CW - w]);
      y = snap(d.o.y + dy, [0, (CH - h) / 2, CH - h]);
    } else {
      if (d.mode.includes("e")) w = Math.max(10, d.o.w + dx);
      if (d.mode.includes("s")) h = Math.max(10, d.o.h + dy);
      if (d.mode.includes("w")) {
        w = Math.max(10, d.o.w - dx);
        x = d.o.x + d.o.w - w;
      }
      if (d.mode.includes("n")) {
        h = Math.max(10, d.o.h - dy);
        y = d.o.y + d.o.h - h;
      }
    }
    onChange(els.current.map((q) => (q.id === d.id ? { ...q, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) } : q)));
  };
  const up = () => {
    drag.current = null;
  };

  const key = (e: React.KeyboardEvent) => {
    const el = elements.find((q) => q.id === sel);
    if (!el || (e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
    const s = e.shiftKey ? 10 : 1;
    const patch: Partial<CustomEl> | null =
      e.key === "ArrowLeft" ? { x: el.x - s } : e.key === "ArrowRight" ? { x: el.x + s } : e.key === "ArrowUp" ? { y: el.y - s } : e.key === "ArrowDown" ? { y: el.y + s } : null;
    if (patch && !el.locked) {
      e.preventDefault();
      onChange(elements.map((q) => (q.id === el.id ? { ...q, ...patch } : q)));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onChange(elements.filter((q) => q.id !== el.id));
      setSel(null);
    }
  };

  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mk-label mr-auto text-[9px]">{scrub === null ? "Drag to move · corners to resize · arrows nudge · Delete removes" : `Timeline preview at ${(scrub / 1000).toFixed(2)} s — press Live to edit on the canvas`}</span>
        <button
          type="button"
          className="mk-button flex h-6 items-center gap-1 rounded-[3px] px-2 text-[9px]"
          onClick={() => {
            setMode("in");
            setRun((n) => n + 1);
            onLive();
          }}
        >
          <Play className="h-3 w-3" /> Replay entrance
        </button>
        <button
          type="button"
          className="mk-button flex h-6 items-center gap-1 rounded-[3px] px-2 text-[9px]"
          onClick={() => {
            setMode("out");
            setRun((n) => n + 1);
            onLive();
          }}
        >
          <Play className="h-3 w-3" /> Preview exit
        </button>
      </div>
      <div
        ref={box}
        tabIndex={0}
        onKeyDown={key}
        onPointerMove={move}
        onPointerUp={up}
        onPointerDown={() => setSel(null)}
        className={cn("relative aspect-video w-full select-none overflow-hidden rounded-[3px] border border-white/10 outline-none", backdropClass)}
        style={{ containerType: "inline-size" }}
      >
        <div key={run} className="pointer-events-none absolute inset-0" dangerouslySetInnerHTML={{ __html: html }} />
        {scrub === null &&
          elements.map((el) => {
          if (!el.visible) return null;
          const on = el.id === sel;
          return (
            <div
              key={el.id}
              onPointerDown={(e) => down(e, el, "move")}
              className={cn("absolute", on ? "outline outline-2 outline-amber-400" : "hover:outline hover:outline-1 hover:outline-white/40", el.locked ? "cursor-not-allowed" : "cursor-move")}
              style={{
                left: `${(el.x / CW) * 100}%`,
                top: `${(el.y / CH) * 100}%`,
                width: `${(el.w / CW) * 100}%`,
                height: `${(el.h / CH) * 100}%`,
                transform: `rotate(${el.rot}deg)`,
              }}
            >
              {on &&
                !el.locked &&
                (["nw", "ne", "sw", "se"] as const).map((m) => (
                  <span
                    key={m}
                    onPointerDown={(e) => down(e, el, m)}
                    className="absolute h-2.5 w-2.5 rounded-[2px] border border-black bg-amber-300"
                    style={{
                      left: m.includes("w") ? -5 : undefined,
                      right: m.includes("e") ? -5 : undefined,
                      top: m.includes("n") ? -5 : undefined,
                      bottom: m.includes("s") ? -5 : undefined,
                      cursor: m === "nw" || m === "se" ? "nwse-resize" : "nesw-resize",
                    }}
                  />
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Add buttons, layer list and inspector. */
export function CustomInspector({
  elements,
  onChange,
  sel,
  setSel,
  say,
  time,
  selKey,
  setSelKey,
}: {
  elements: CustomEl[];
  onChange: (els: CustomEl[]) => void;
  sel: string | null;
  setSel: (id: string | null) => void;
  say: (m: string) => void;
  time: number | null;
  selKey: string | null;
  setSelKey: (id: string | null) => void;
}) {
  const el = elements.find((q) => q.id === sel) ?? null;
  const edit: Edit = (id, patch) => onChange(elements.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const add = (type: CustomElType, over: Partial<CustomEl> = {}) => {
    if (elements.length >= 60) return say("60 elements is the limit");
    const n = makeEl(type, over);
    onChange([...elements, n]);
    setSel(n.id);
  };
  const move = (i: number, dir: 1 | -1) => {
    const j = i + dir;
    if (j < 0 || j >= elements.length) return;
    const a = [...elements];
    [a[i], a[j]] = [a[j]!, a[i]!];
    onChange(a);
  };
  const dup = (e: CustomEl) => {
    if (elements.length >= 60) return say("60 elements is the limit");
    const n = { ...e, id: newElId(), name: `${e.name} copy`, x: e.x + 30, y: e.y + 30 };
    onChange([...elements, n]);
    setSel(n.id);
  };
  const pickImage = async (file: File | undefined, apply: (data: string) => void) => {
    if (!file) return;
    try {
      apply(await fileToLogo(file, 1024));
    } catch {
      say("That file is not a valid image");
    }
  };

  const btn = "mk-button h-8 rounded-[3px] px-2 text-[10px]";
  const icon = "mk-button flex h-6 w-6 items-center justify-center rounded-[3px]";

  return (
    <div className="col-span-2 grid gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <select
          aria-label="Add a starter template"
          className={cn(field, "w-auto")}
          value=""
          onChange={(e) => {
            const t = CUSTOM_TEMPLATES.find((q) => q.id === e.target.value);
            if (!t) return;
            const els = t.build();
            if (elements.length + els.length > 60) return say("Not enough room: 60 elements is the limit");
            onChange([...elements, ...els]);
            setSel(null);
          }}
        >
          <option value="">Add template…</option>
          {CUSTOM_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        {elements.length > 0 && (
          <button
            type="button"
            className={btn}
            onClick={() => {
              if (!window.confirm("Remove every element from this graphic?")) return;
              onChange([]);
              setSel(null);
            }}
          >
            Clear all
          </button>
        )}
      </div>
      <CustomFields elements={elements} onChange={onChange} say={say} />
      <div className="flex flex-wrap gap-1">
        <button type="button" className={btn} onClick={() => add("rect")}>+ Rectangle</button>
        <button type="button" className={btn} onClick={() => add("rect", { name: "Parallelogram", slant: 60 })}>+ Parallelogram</button>
        <button type="button" className={btn} onClick={() => add("ellipse")}>+ Ellipse</button>
        <button type="button" className={btn} onClick={() => add("text")}>+ Text</button>
        <span className={cn(btn, "flex cursor-pointer items-center gap-1")}>
          <Upload className="h-3 w-3" /> + Image
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              void pickImage(f, (image) => add("image", { image, name: f?.name.replace(/\.[^.]+$/, "").slice(0, 30) || "Image" }));
            }}
          />
        </span>
      </div>

      <div className="grid max-h-40 gap-0.5 overflow-y-auto rounded-[3px] border border-white/10 p-1">
        {elements.length === 0 && <span className="p-2 text-[10px] text-muted-foreground">Empty. Add a shape or text above.</span>}
        {elements
          .map((e, i) => ({ e, i }))
          .reverse()
          .map(({ e, i }) => (
            <div key={e.id} className={cn("flex items-center gap-1 rounded-[3px] px-1", e.id === sel && "bg-amber-400/15")}>
              <button type="button" className="min-w-0 flex-1 truncate py-1 text-left text-[11px]" onClick={() => setSel(e.id)}>
                {e.type === "text" ? `“${e.text.slice(0, 22)}”` : e.name}
              </button>
              <button type="button" title={e.visible ? "Hide" : "Show"} className={icon} onClick={() => edit(e.id, { visible: !e.visible })}>
                {e.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </button>
              <button type="button" title={e.locked ? "Unlock" : "Lock"} className={icon} onClick={() => edit(e.id, { locked: !e.locked })}>
                {e.locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
              </button>
              <button type="button" title="Bring forward" className={icon} onClick={() => move(i, 1)}>
                <ArrowUp className="h-3 w-3" />
              </button>
              <button type="button" title="Send back" className={icon} onClick={() => move(i, -1)}>
                <ArrowDown className="h-3 w-3" />
              </button>
              <button type="button" title="Duplicate" className={icon} onClick={() => dup(e)}>
                <Copy className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="Delete"
                className={icon}
                onClick={() => {
                  onChange(elements.filter((q) => q.id !== e.id));
                  if (sel === e.id) setSel(null);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
      </div>

      {el ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <Row label="Name">
              <input className={field} value={el.name} maxLength={40} onChange={(e) => edit(el.id, { name: e.target.value })} />
            </Row>
          </div>
          {(el.type === "text" || el.type === "image") && (
            <div className="col-span-2">
              <Row label="Fill-in field name (crew edits this live; empty = fixed)">
                <input className={field} value={el.field} maxLength={30} placeholder="e.g. Name" onChange={(e) => edit(el.id, { field: e.target.value })} />
              </Row>
            </div>
          )}
          <Num label="X" value={el.x} onChange={(x) => edit(el.id, { x })} />
          <Num label="Y" value={el.y} onChange={(y) => edit(el.id, { y })} />
          <Num label="Width" value={el.w} min={1} onChange={(w) => edit(el.id, { w })} />
          <Num label="Height" value={el.h} min={1} onChange={(h) => edit(el.id, { h })} />
          <Slide label="Rotate" value={el.rot} min={-180} max={180} unit="°" onChange={(rot) => edit(el.id, { rot })} />
          <Slide label="Opacity" value={el.opacity} min={0} max={100} unit="%" onChange={(opacity) => edit(el.id, { opacity })} />

          {(el.type === "rect" || el.type === "ellipse") && (
            <>
              <Row label="Fill">
                <Colour value={el.fill} onChange={(fill) => edit(el.id, { fill })} />
              </Row>
              <Row label="Gradient">
                <span className="flex items-center gap-1.5">
                  <button type="button" className={cn(btn, el.fill2 && "mk-lit-amber")} onClick={() => edit(el.id, { fill2: el.fill2 ? null : "#000000" })}>
                    {el.fill2 ? "On" : "Off"}
                  </button>
                  {el.fill2 && <Colour value={el.fill2} onChange={(fill2) => edit(el.id, { fill2 })} />}
                </span>
              </Row>
              {el.fill2 && <Slide label="Gradient angle" value={el.angle} min={0} max={360} unit="°" onChange={(angle) => edit(el.id, { angle })} />}
              {el.type === "rect" && (
                <>
                  <Slide label="Corner radius" value={el.radius} min={0} max={200} unit="px" onChange={(radius) => edit(el.id, { radius })} />
                  <Slide label="Slant" value={el.slant} min={-300} max={300} unit="px" onChange={(slant) => edit(el.id, { slant })} />
                </>
              )}
              <Row label="Outline colour">
                <Colour value={el.stroke} onChange={(stroke) => edit(el.id, { stroke })} />
              </Row>
              <Slide label="Outline width" value={el.strokeW} min={0} max={40} unit="px" onChange={(strokeW) => edit(el.id, { strokeW })} />
            </>
          )}

          {el.type === "text" && (
            <>
              <div className="col-span-2">
                <Row label="Text (Enter = new line)">
                  <textarea className={cn(field, "h-16 py-1")} value={el.text} maxLength={500} onChange={(e) => edit(el.id, { text: e.target.value })} />
                </Row>
              </div>
              <Row label="Font">
                <select className={field} value={el.font} onChange={(e) => edit(el.id, { font: e.target.value as CustomEl["font"] })}>
                  {GFX_FONTS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </Row>
              <Row label="Weight">
                <select className={field} value={el.weight} onChange={(e) => edit(el.id, { weight: Number(e.target.value) })}>
                  {[300, 400, 500, 600, 700, 800].map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </Row>
              <Num label="Size (px)" value={el.fontSize} min={6} max={800} onChange={(fontSize) => edit(el.id, { fontSize })} />
              <Row label="Colour">
                <Colour value={el.color} onChange={(color) => edit(el.id, { color })} />
              </Row>
              <Row label="Align">
                <select className={field} value={el.align} onChange={(e) => edit(el.id, { align: e.target.value as CustomEl["align"] })}>
                  <option value="left">Left</option>
                  <option value="center">Centre</option>
                  <option value="right">Right</option>
                </select>
              </Row>
              <Slide label="Letter spacing" value={el.spacing} min={-5} max={40} unit="px" onChange={(spacing) => edit(el.id, { spacing })} />
              <Row label="Capitals">
                <button type="button" className={cn(btn, el.upper && "mk-lit-amber")} onClick={() => edit(el.id, { upper: !el.upper })}>
                  {el.upper ? "ALL CAPS" : "As typed"}
                </button>
              </Row>
            </>
          )}

          {el.type === "image" && (
            <div className="col-span-2">
              <Row label="Image">
                <span className={cn(btn, "flex cursor-pointer items-center justify-center gap-1")}>
                  <Upload className="h-3 w-3" /> {el.image ? "Change image" : "Upload image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      void pickImage(f, (image) => edit(el.id, { image }));
                    }}
                  />
                </span>
              </Row>
            </div>
          )}

          {el.type !== "text" && el.type !== "image" && <Slide label="Shadow" value={el.shadow} min={0} max={80} unit="px" onChange={(shadow) => edit(el.id, { shadow })} />}
          {(el.type === "text" || el.type === "image") && <Slide label="Shadow" value={el.shadow} min={0} max={80} unit="px" onChange={(shadow) => edit(el.id, { shadow })} />}

          <div className="col-span-2 mk-label pt-1 text-[9px]">Entrance animation</div>
          <Row label="Comes on with">
            <select className={field} value={el.anim} onChange={(e) => edit(el.id, { anim: e.target.value as CustomEl["anim"] })}>
              {CUSTOM_ANIMS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </Row>
          <Num label="Duration (ms)" value={el.animMs} min={50} max={5000} step={50} onChange={(animMs) => edit(el.id, { animMs })} />
          <div className="col-span-2">
            <Slide label="Delay" value={el.delay} min={0} max={5000} step={50} unit="ms" onChange={(delay) => edit(el.id, { delay })} />
          </div>

          <KeyframePanel el={el} onChange={(patch) => edit(el.id, patch)} time={time} selKey={selKey} setSelKey={setSelKey} />

          <div className="col-span-2 mk-label pt-1 text-[9px]">Exit animation (when taken off air)</div>
          <Row label="Goes off with">
            <select className={field} value={el.out} onChange={(e) => edit(el.id, { out: e.target.value as CustomEl["out"] })}>
              {CUSTOM_ANIMS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id === "none" ? "None (vanishes)" : a.label.replace("from", "to")}
                </option>
              ))}
            </select>
          </Row>
          <Num label="Duration (ms)" value={el.outMs} min={50} max={5000} step={50} onChange={(outMs) => edit(el.id, { outMs })} />
          <div className="col-span-2">
            <Slide label="Exit delay" value={el.outDelay} min={0} max={5000} step={50} unit="ms" onChange={(outDelay) => edit(el.id, { outDelay })} />
          </div>

          <div className="col-span-2 mk-label pt-1 text-[9px]">Loop effect (keeps going while on air)</div>
          <Row label="Effect">
            <select className={field} value={el.loop} onChange={(e) => edit(el.id, { loop: e.target.value as CustomEl["loop"] })}>
              {CUSTOM_LOOPS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </Row>
          {el.loop !== "none" && <Num label="One cycle (ms)" value={el.loopMs} min={200} max={10000} step={100} onChange={(loopMs) => edit(el.id, { loopMs })} />}
        </div>
      ) : (
        <span className="text-[10px] text-muted-foreground">Select an element on the canvas or in the list to edit it.</span>
      )}
    </div>
  );
}

const newKey = (t: number, pose: Partial<CustomKey> = {}): CustomKey => ({ id: newElId(), t, ...NEUTRAL_POSE, ease: "inout", ...pose });
const byTime = (a: CustomKey, b: CustomKey) => a.t - b.t;

/** Canvas + timeline together. Time and the selected keyframe live in the page so the inspector can use them. */
export function CustomStage({
  elements,
  onChange,
  sel,
  setSel,
  backdropClass,
  time,
  setTime,
  selKey,
  setSelKey,
}: {
  elements: CustomEl[];
  onChange: (els: CustomEl[]) => void;
  sel: string | null;
  setSel: (id: string | null) => void;
  backdropClass: string;
  time: number | null;
  setTime: (t: number | null) => void;
  selKey: string | null;
  setSelKey: (id: string | null) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const els = useRef(elements);
  els.current = elements;
  const drag = useRef<{ el: string; key: string } | null>(null);

  const total = Math.max(
    3000,
    Math.ceil(Math.max(...elements.map((e) => Math.max(e.delay + e.animMs, ...e.keys.map((k) => k.t))), 0) / 500) * 500 + 500,
  );

  // Preview playback: walk the playhead from 0 to the end.
  useEffect(() => {
    if (!playing) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = now - t0;
      if (t >= total) {
        setTime(total);
        setPlaying(false);
        return;
      }
      setTime(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total, setTime]);

  const timeAt = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return 0;
    return Math.min(total, Math.max(0, Math.round(((clientX - r.left) / r.width) * total / 10) * 10));
  };
  const setKeys = (elId: string, fn: (k: CustomKey[]) => CustomKey[]) =>
    onChange(els.current.map((e) => (e.id === elId ? { ...e, keys: fn(e.keys).sort(byTime) } : e)));

  const ticks: number[] = [];
  for (let t = 0; t <= total; t += total > 8000 ? 1000 : 500) ticks.push(t);
  const pct = (t: number) => `${(t / total) * 100}%`;

  return (
    <div className="grid gap-1.5">
      <CustomCanvas elements={elements} onChange={onChange} sel={sel} setSel={setSel} backdropClass={backdropClass} scrub={time} onLive={() => { setTime(null); setPlaying(false); }} />

      <div className="grid gap-1 rounded-[3px] border border-white/10 p-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mk-label mr-auto text-[9px]">Timeline · double-click a row to add a keyframe · drag diamonds to retime</span>
          <button
            type="button"
            className="mk-button flex h-6 items-center gap-1 rounded-[3px] px-2 text-[9px]"
            onClick={() => {
              if (playing) setPlaying(false);
              else {
                setTime(0);
                setPlaying(true);
              }
            }}
          >
            {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />} {playing ? "Stop" : "Play"}
          </button>
          <button type="button" className={cn("mk-button h-6 rounded-[3px] px-2 text-[9px]", time === null && "mk-lit-amber")} onClick={() => { setTime(null); setPlaying(false); }}>
            Live
          </button>
        </div>

        <div className="grid grid-cols-[6.5rem_1fr] gap-x-1 gap-y-0.5">
          <span />
          <div
            ref={trackRef}
            className="relative h-5 cursor-col-resize rounded-[2px] bg-black/30"
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setPlaying(false);
              setTime(timeAt(e.clientX));
            }}
            onPointerMove={(e) => {
              if (e.buttons === 1 && !drag.current) setTime(timeAt(e.clientX));
            }}
          >
            {ticks.map((t) => (
              <span key={t} className="pointer-events-none absolute top-0 h-full border-l border-white/15 pl-0.5 font-mono text-[8px] text-muted-foreground" style={{ left: pct(t) }}>
                {t / 1000}s
              </span>
            ))}
            {time !== null && <span className="pointer-events-none absolute top-0 z-10 h-full w-0.5 bg-amber-400" style={{ left: pct(time) }} />}
          </div>

          {[...elements].reverse().map((el) => (
            <div key={el.id} className="contents">
              <button type="button" onClick={() => { setSel(el.id); setSelKey(null); }} className={cn("truncate rounded-[2px] px-1 text-left text-[10px]", el.id === sel && "bg-amber-400/15")}>
                {el.type === "text" ? `“${el.text.slice(0, 14)}”` : el.name}
              </button>
              <div
                className={cn("relative h-[22px] rounded-[2px] bg-white/[0.04]", el.id === sel && "bg-amber-400/10")}
                onPointerDown={() => { setSel(el.id); }}
                onDoubleClick={(e) => {
                  if (el.locked) return;
                  const t = timeAt(e.clientX);
                  const k = newKey(t, customPoseAt(el.keys, t) ?? {});
                  setKeys(el.id, (ks) => [...ks, k]);
                  setSel(el.id);
                  setSelKey(k.id);
                }}
              >
                {el.anim !== "none" && <span className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sky-400/60" style={{ left: pct(el.delay), width: pct(el.animMs) }} />}
                {el.keys.length > 1 && <span className="pointer-events-none absolute top-1/2 h-px bg-amber-300/50" style={{ left: pct(el.keys[0]!.t), width: pct(el.keys[el.keys.length - 1]!.t - el.keys[0]!.t) }} />}
                {el.keys.map((k) => (
                  <span
                    key={k.id}
                    title={`${(k.t / 1000).toFixed(2)} s`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSel(el.id);
                      setSelKey(k.id);
                      if (el.locked) return;
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      drag.current = { el: el.id, key: k.id };
                    }}
                    onPointerMove={(e) => {
                      const d = drag.current;
                      if (!d || d.key !== k.id) return;
                      const t = timeAt(e.clientX);
                      setKeys(d.el, (ks) => ks.map((q) => (q.id === d.key ? { ...q, t } : q)));
                      if (time !== null) setTime(t);
                    }}
                    onPointerUp={() => { drag.current = null; }}
                    className={cn("absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-ew-resize border border-black", k.id === selKey ? "bg-amber-300" : "bg-white/80")}
                    style={{ left: pct(k.t) }}
                  />
                ))}
                {time !== null && <span className="pointer-events-none absolute top-0 h-full w-px bg-amber-400/70" style={{ left: pct(time) }} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Keyframe controls for the selected element (lives in the inspector). */
export function KeyframePanel({
  el,
  onChange,
  time,
  selKey,
  setSelKey,
}: {
  el: CustomEl;
  onChange: (patch: Partial<CustomEl>) => void;
  time: number | null;
  selKey: string | null;
  setSelKey: (id: string | null) => void;
}) {
  const key = el.keys.find((k) => k.id === selKey) ?? null;
  const setKeys = (keys: CustomKey[]) => onChange({ keys: [...keys].sort(byTime) });
  const editKey = (patch: Partial<CustomKey>) => key && setKeys(el.keys.map((k) => (k.id === key.id ? { ...k, ...patch } : k)));
  const btn = "mk-button h-8 rounded-[3px] px-2 text-[10px]";
  return (
    <>
      <div className="col-span-2 mk-label pt-1 text-[9px]">Keyframes (move, scale, rotate, fade over time)</div>
      <div className="col-span-2 flex flex-wrap gap-1">
        <button
          type="button"
          className={btn}
          disabled={el.keys.length >= 16}
          onClick={() => {
            const t = time ?? (el.keys.length ? el.keys[el.keys.length - 1]!.t + 500 : 0);
            const k = newKey(t, customPoseAt(el.keys, t) ?? {});
            setKeys([...el.keys, k]);
            setSelKey(k.id);
          }}
        >
          + Key {time !== null ? `at ${(time / 1000).toFixed(2)} s` : "at end"}
        </button>
        <button type="button" className={cn(btn, el.kfLoop && "mk-lit-amber")} onClick={() => onChange({ kfLoop: !el.kfLoop })}>
          {el.kfLoop ? "Looping" : "Plays once"}
        </button>
        {el.keys.length > 0 && (
          <button type="button" className={btn} onClick={() => { setKeys([]); setSelKey(null); }}>
            Clear keys
          </button>
        )}
      </div>
      {key ? (
        <>
          <Num label="Time (ms)" value={key.t} min={0} max={60000} step={50} onChange={(t) => editKey({ t })} />
          <Row label="Then moves with">
            <select className={field} value={key.ease} onChange={(e) => editKey({ ease: e.target.value as CustomKey["ease"] })}>
              {CUSTOM_EASES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </Row>
          <Num label="Move X (px)" value={key.dx} onChange={(dx) => editKey({ dx })} />
          <Num label="Move Y (px)" value={key.dy} onChange={(dy) => editKey({ dy })} />
          <Slide label="Scale" value={key.scale} min={0} max={300} unit="%" onChange={(scale) => editKey({ scale })} />
          <Slide label="Rotate" value={key.rot} min={-360} max={360} unit="°" onChange={(rot) => editKey({ rot })} />
          <Slide label="Opacity" value={key.opacity} min={0} max={100} unit="%" onChange={(opacity) => editKey({ opacity })} />
          <div className="col-span-2">
            <button
              type="button"
              className={btn}
              onClick={() => {
                setKeys(el.keys.filter((k) => k.id !== key.id));
                setSelKey(null);
              }}
            >
              Delete this keyframe
            </button>
          </div>
        </>
      ) : (
        <span className="col-span-2 text-[10px] text-muted-foreground">
          {el.keys.length ? "Click a diamond on the timeline to edit it." : "No keyframes. Park the playhead, then + Key. Each key is a pose; the graphic glides between them."}
        </span>
      )}
    </>
  );
}

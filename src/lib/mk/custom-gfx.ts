// Custom graphic editor: element factory + sanitizer (imported designs are untrusted).
import { safeImage } from "./graphics";
import { CUSTOM_ANIMS, CUSTOM_EASES, CUSTOM_LOOPS, GFX_FONTS, type CustomEl, type CustomElType, type CustomKey } from "./types";

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);
const str = (v: unknown, d: string, max: number) => (typeof v === "string" ? v.slice(0, max) : d);
const num = (v: unknown, d: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d;
};
const oneOf = <T extends string>(v: unknown, list: readonly { id: T }[], d: T): T => (list.some((l) => l.id === v) ? (v as T) : d);

export const newElId = () => Math.random().toString(36).slice(2, 10);

const NAMES: Record<CustomElType, string> = { rect: "Rectangle", ellipse: "Ellipse", text: "Text", image: "Image" };

export function makeEl(type: CustomElType, over: Partial<CustomEl> = {}): CustomEl {
  const text = type === "text";
  return {
    id: newElId(),
    name: NAMES[type],
    type,
    visible: true,
    locked: false,
    x: 760,
    y: 440,
    w: text ? 600 : type === "image" ? 300 : 400,
    h: text ? 90 : type === "image" ? 300 : type === "ellipse" ? 400 : 160,
    rot: 0,
    opacity: 100,
    fill: "#e5322d",
    fill2: null,
    angle: 90,
    radius: 0,
    slant: 0,
    stroke: "#ffffff",
    strokeW: 0,
    shadow: 0,
    text: "Your text here",
    font: "condensed",
    fontSize: 64,
    weight: 700,
    color: "#ffffff",
    align: "left",
    spacing: 0,
    upper: false,
    image: null,
    anim: "fade",
    animMs: 600,
    delay: 0,
    out: "fade",
    outMs: 400,
    outDelay: 0,
    loop: "none",
    loopMs: 1200,
    keys: [],
    kfLoop: false,
    field: "",
    group: "",
    ...over,
  };
}

export function cleanKeys(v: unknown): CustomKey[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 16)
    .map((raw) => {
      const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      return {
        id: str(r["id"], newElId(), 24).replace(/[^a-zA-Z0-9_-]/g, "") || newElId(),
        t: num(r["t"], 0, 0, 60000),
        dx: num(r["dx"], 0, -3000, 3000),
        dy: num(r["dy"], 0, -3000, 3000),
        scale: num(r["scale"], 100, 0, 500),
        rot: num(r["rot"], 0, -720, 720),
        opacity: num(r["opacity"], 100, 0, 100),
        ease: oneOf(r["ease"], CUSTOM_EASES, "inout"),
      };
    })
    .sort((a, b) => a.t - b.t);
}

export function cleanCustomEls(v: unknown): CustomEl[] {
  if (!Array.isArray(v)) return [];
  const d = makeEl("rect");
  return v.slice(0, 60).map((raw) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const type: CustomElType = r["type"] === "ellipse" || r["type"] === "text" || r["type"] === "image" ? r["type"] : "rect";
    return {
      id: str(r["id"], newElId(), 24) || newElId(),
      name: str(r["name"], NAMES[type], 40),
      type,
      visible: r["visible"] !== false,
      locked: r["locked"] === true,
      x: num(r["x"], d.x, -3000, 5000),
      y: num(r["y"], d.y, -3000, 4000),
      w: num(r["w"], d.w, 1, 6000),
      h: num(r["h"], d.h, 1, 4000),
      rot: num(r["rot"], 0, -360, 360),
      opacity: num(r["opacity"], 100, 0, 100),
      fill: hex(r["fill"], d.fill),
      fill2: typeof r["fill2"] === "string" && HEX.test(r["fill2"]) ? r["fill2"] : null,
      angle: num(r["angle"], 90, 0, 360),
      radius: num(r["radius"], 0, 0, 2000),
      slant: num(r["slant"], 0, -600, 600),
      stroke: hex(r["stroke"], d.stroke),
      strokeW: num(r["strokeW"], 0, 0, 200),
      shadow: num(r["shadow"], 0, 0, 120),
      text: str(r["text"], d.text, 500),
      font: oneOf(r["font"], GFX_FONTS, d.font),
      fontSize: num(r["fontSize"], d.fontSize, 6, 800),
      weight: num(r["weight"], 700, 100, 900),
      color: hex(r["color"], d.color),
      align: r["align"] === "center" || r["align"] === "right" ? r["align"] : "left",
      spacing: num(r["spacing"], 0, -20, 100),
      upper: r["upper"] === true,
      image: safeImage(r["image"]),
      anim: oneOf(r["anim"], CUSTOM_ANIMS, "fade"),
      animMs: num(r["animMs"], 600, 50, 5000),
      delay: num(r["delay"], 0, 0, 10000),
      out: oneOf(r["out"], CUSTOM_ANIMS, "none"),
      outMs: num(r["outMs"], 400, 50, 5000),
      outDelay: num(r["outDelay"], 0, 0, 10000),
      loop: oneOf(r["loop"], CUSTOM_LOOPS, "none"),
      loopMs: num(r["loopMs"], 1200, 200, 10000),
      keys: cleanKeys(r["keys"]),
      kfLoop: r["kfLoop"] === true,
      field: str(r["field"], "", 30),
      group: str(r["group"], "", 24).replace(/[^a-zA-Z0-9_-]/g, ""),
    };
  });
}

// ---- Starter templates. Elements with a `field` can be filled in by the crew from the live panel.
const RED = "#a00714";
const NAVY = "#112b43";
const BLUE = "#164a70";
const SLANT = 54;

function strapTemplate(): CustomEl[] {
  const side = (name: string, x: number, w: number, fill: string, delay: number, over: Partial<CustomEl> = {}) =>
    makeEl("rect", { name, x, y: 850, w, h: 136, fill, slant: SLANT, anim: "left", animMs: 450, delay, ...over });
  return [
    makeEl("rect", { name: "Frame", x: 115, y: 850, w: 1498, h: 150, fill: NAVY, anim: "wipe", animMs: 500 }),
    makeEl("rect", { name: "Bar", x: 288, y: 850, w: 1256, h: 136, fill: "#ffffff", slant: SLANT, anim: "wipe", animMs: 500, delay: 150 }),
    side("Stripe white (left)", 184, 63, "#ffffff", 100),
    side("Stripe red (left)", 198, 67, RED, 150),
    side("Logo panel", 211, 234, BLUE, 200),
    makeEl("image", { name: "Logo", field: "Logo", x: 245, y: 860, w: 150, h: 116, anim: "fade", delay: 450 }),
    side("Stripe red (right)", 1490, 67, RED, 150, { anim: "right" }),
    side("Stripe white (right)", 1503, 63, "#ffffff", 100, { anim: "right" }),
    makeEl("text", { name: "Title", field: "Title", x: 480, y: 856, w: 1000, h: 64, text: "Inclusive and Sustainable Community Development", fontSize: 52, weight: 700, color: "#0b0b0b", anim: "up", animMs: 450, delay: 400 }),
    makeEl("text", { name: "Subtitle", field: "Subtitle", x: 480, y: 918, w: 1000, h: 50, text: "Inclusive and Sustainable Community Development", fontSize: 40, weight: 400, color: "#0b0b0b", anim: "up", animMs: 450, delay: 480 }),
    makeEl("rect", { name: "Tag shape", x: 198, y: 798, w: 269, h: 48, fill: RED, slant: 17, anim: "down", animMs: 400, delay: 500 }),
    makeEl("text", { name: "Tag", field: "Tag", x: 198, y: 798, w: 269, h: 48, text: "BARAZA LA MTAA", fontSize: 30, weight: 600, align: "center", upper: true, anim: "fade", delay: 700 }),
  ];
}

function nameBarTemplate(): CustomEl[] {
  return [
    makeEl("rect", { name: "Accent", x: 140, y: 860, w: 14, h: 120, fill: "#e5322d", anim: "left", animMs: 400 }),
    makeEl("rect", { name: "Panel", x: 154, y: 860, w: 900, h: 120, fill: "#0b1220", fill2: "#1a2744", angle: 90, anim: "wipe", animMs: 500, delay: 100 }),
    makeEl("text", { name: "Name", field: "Name", x: 190, y: 868, w: 840, h: 64, text: "Guest Name", fontSize: 52, weight: 700, anim: "up", animMs: 450, delay: 350 }),
    makeEl("text", { name: "Title / role", field: "Title / role", x: 190, y: 928, w: 840, h: 44, text: "Title / Role", fontSize: 32, weight: 400, color: "#c9d3e6", anim: "up", animMs: 450, delay: 430 }),
  ];
}

function liveTemplate(): CustomEl[] {
  return [
    makeEl("rect", { name: "Badge", x: 1560, y: 60, w: 250, h: 76, fill: "#e5322d", radius: 10, anim: "down", animMs: 400 }),
    makeEl("ellipse", { name: "Dot", x: 1582, y: 86, w: 24, h: 24, fill: "#ffffff", anim: "scale", delay: 300, loop: "blink", loopMs: 1000 }),
    makeEl("text", { name: "Label", field: "Label", x: 1622, y: 60, w: 170, h: 76, text: "LIVE", fontSize: 44, weight: 700, upper: true, anim: "fade", delay: 300 }),
  ];
}

export const CUSTOM_TEMPLATES: { id: string; label: string; build: () => CustomEl[] }[] = [
  { id: "strap", label: "Channel strap (logo + tag)", build: strapTemplate },
  { id: "namebar", label: "Name bar", build: nameBarTemplate },
  { id: "live", label: "LIVE badge", build: liveTemplate },
];

// ---- Editing helpers (pure): clipboard, align, distribute, groups.
const clip: { els: CustomEl[]; n: number } = { els: [], n: 0 };

export function copyEls(all: CustomEl[], ids: string[]): number {
  clip.els = all.filter((e) => ids.includes(e.id)).map((e) => ({ ...e, keys: e.keys.map((k) => ({ ...k })) }));
  clip.n = 0;
  return clip.els.length;
}

/** Pastes the copied elements (offset a little each time) on top; null when empty or over the 60 limit. */
export function pasteEls(all: CustomEl[]): { els: CustomEl[]; ids: string[] } | null {
  if (!clip.els.length || all.length + clip.els.length > 60) return null;
  clip.n++;
  const groups = new Map<string, string>();
  const made = clip.els.map((e) => {
    let group = e.group;
    if (group) {
      if (!groups.has(group)) groups.set(group, newElId());
      group = groups.get(group)!;
    }
    return { ...e, id: newElId(), group, x: e.x + 30 * clip.n, y: e.y + 30 * clip.n, keys: e.keys.map((k) => ({ ...k, id: newElId() })) };
  });
  return { els: [...all, ...made], ids: made.map((m) => m.id) };
}

export type AlignHow = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/** One element aligns to the canvas; several align to their own bounds. */
export function alignEls(all: CustomEl[], ids: string[], how: AlignHow): CustomEl[] {
  const sel = all.filter((e) => ids.includes(e.id) && !e.locked);
  if (!sel.length) return all;
  const box =
    ids.length === 1
      ? { x0: 0, y0: 0, x1: 1920, y1: 1080 }
      : { x0: Math.min(...sel.map((e) => e.x)), y0: Math.min(...sel.map((e) => e.y)), x1: Math.max(...sel.map((e) => e.x + e.w)), y1: Math.max(...sel.map((e) => e.y + e.h)) };
  return all.map((e) => {
    if (!ids.includes(e.id) || e.locked) return e;
    switch (how) {
      case "left":
        return { ...e, x: Math.round(box.x0) };
      case "hcenter":
        return { ...e, x: Math.round((box.x0 + box.x1 - e.w) / 2) };
      case "right":
        return { ...e, x: Math.round(box.x1 - e.w) };
      case "top":
        return { ...e, y: Math.round(box.y0) };
      case "vcenter":
        return { ...e, y: Math.round((box.y0 + box.y1 - e.h) / 2) };
      default:
        return { ...e, y: Math.round(box.y1 - e.h) };
    }
  });
}

/** Equal gaps between three or more elements, keeping the outer two where they are. */
export function distributeEls(all: CustomEl[], ids: string[], axis: "h" | "v"): CustomEl[] {
  const sel = all.filter((e) => ids.includes(e.id) && !e.locked);
  if (sel.length < 3) return all;
  const pos = (e: CustomEl) => (axis === "h" ? e.x : e.y);
  const size = (e: CustomEl) => (axis === "h" ? e.w : e.h);
  const sorted = [...sel].sort((a, b) => pos(a) - pos(b));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const span = pos(last) + size(last) - pos(first);
  const gap = (span - sorted.reduce((s, e) => s + size(e), 0)) / (sorted.length - 1);
  const at = new Map<string, number>();
  let cur = pos(first);
  for (const e of sorted) {
    at.set(e.id, Math.round(cur));
    cur += size(e) + gap;
  }
  return all.map((e) => (at.has(e.id) ? (axis === "h" ? { ...e, x: at.get(e.id)! } : { ...e, y: at.get(e.id)! }) : e));
}

/** Everything in the same group as the given elements. */
export function withGroups(all: CustomEl[], ids: string[]): string[] {
  const groups = new Set(all.filter((e) => ids.includes(e.id) && e.group).map((e) => e.group));
  return all.filter((e) => ids.includes(e.id) || (e.group && groups.has(e.group))).map((e) => e.id);
}

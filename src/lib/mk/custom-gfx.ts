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

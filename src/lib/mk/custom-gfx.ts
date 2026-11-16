// Custom graphic editor: element factory + sanitizer (imported designs are untrusted).
import { safeImage } from "./graphics";
import { CUSTOM_ANIMS, GFX_FONTS, type CustomEl, type CustomElType } from "./types";

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
    ...over,
  };
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
    };
  });
}

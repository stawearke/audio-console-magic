export type Layer = "logo" | "bug" | "lower" | "ticker" | "full" | "breaking";
export const LAYERS: Layer[] = ["logo", "bug", "lower", "ticker", "full", "breaking"]; // z-order, last = highest priority
export type Transition = "slide" | "fade" | "wipe" | "scale" | "reveal";
export const TRANSITIONS: Transition[] = ["slide", "fade", "wipe", "scale", "reveal"];

export interface Theme {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  font: string;
}

export type FieldType = "text" | "textarea" | "number" | "url";
export interface Field { key: string; label: string; type: FieldType }

export interface Item {
  id: string;
  templateId: string;
  name: string;
  data: Record<string, string>;
  transition: Transition;
  animMs: number;
  durationSec: number; // 0 = hold until cleared
  packageId?: string;
  packageName?: string;
}

export interface PackageItem {
  templateId: string;
  name: string;
  data?: Record<string, string>;
  transition?: Transition;
  animMs?: number;
  durationSec?: number;
}

export interface GraphicPackage {
  id: string;
  name: string;
  shortName: string;
  description: string;
  theme: Theme;
  items: PackageItem[];
}

export interface Show { id: string; name: string; theme: Theme; items: Item[] }

export interface LiveGraphic { item: Item; theme: Theme; take: number }
export type Program = Partial<Record<Layer, LiveGraphic>>;

export type BusMessage =
  | { type: "state"; program: Program; preview: Program }
  | { type: "hello"; mode: string }
  | { type: "request" };

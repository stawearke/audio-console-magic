export type Point = { x: number; y: number };
export type SpeakerKind = "wide" | "narrow" | "column" | "sub";
export const SPEAKER_TYPES: Record<SpeakerKind, { name: string; beam: number; reach: number }> = {
  wide: { name: "Full-range · wide", beam: 90, reach: 15 },
  narrow: { name: "Full-range · narrow", beam: 60, reach: 22 },
  column: { name: "Column speaker", beam: 120, reach: 12 },
  sub: { name: "Subwoofer · omni", beam: 360, reach: 15 },
};
export type Speaker = Point & { id: string; name: string; kind: SpeakerKind; aim: number; beam: number; reach: number; gain: number; delay: number };
export type SpeakerPlan = { version: 1; width: number; depth: number; polygon: Point[]; speakers: Speaker[]; reference: number; height: number };
export const defaultPlan = (): SpeakerPlan => ({ version: 1, width: 12, depth: 18, polygon: [{ x: 0.5, y: 1 }, { x: 11.5, y: 1 }, { x: 11.5, y: 17.5 }, { x: 0.5, y: 17.5 }], speakers: [], reference: 90, height: 2.5 });
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const angleTo = (a: Point, b: Point) => Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI;
export function inside(p: Point, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a && b && (a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}
export function area(poly: Point[]): number {
  return Math.abs(poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]; return sum + (q ? p.x * q.y - q.x * p.y : 0); }, 0)) / 2;
}
export function validArea(poly: Point[]): boolean {
  if (poly.length < 3 || area(poly) < 1) return false;
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < poly.length; i++) for (let j = i + 1; j < poly.length; j++) {
    if (j === i + 1 || (i === 0 && j === poly.length - 1)) continue;
    const a = poly[i], b = poly[(i + 1) % poly.length], c = poly[j], d = poly[(j + 1) % poly.length];
    if (a && b && c && d && cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0) return false;
  }
  return true;
}
export function samples(poly: Point[], width: number, depth: number, columns = 32): Point[] {
  const step = Math.max(width, depth) / columns;
  const result: Point[] = [];
  for (let y = step / 2; y < depth; y += step) for (let x = step / 2; x < width; x += step) if (inside({ x, y }, poly)) result.push({ x, y });
  return result;
}
export function offAxis(s: Speaker, p: Point): number { return Math.abs(((angleTo(s, p) - s.aim + 540) % 360) - 180); }
export function levelAt(s: Speaker, p: Point, reference: number, height: number): number {
  const d = Math.max(1, Math.hypot(distance(s, p), height - 1.2));
  const loss = s.beam === 360 ? 0 : Math.min(48, 6 * (offAxis(s, p) / (s.beam / 2)) ** 2);
  return reference + s.gain - 20 * Math.log10(d) - loss;
}
export function combinedLevel(speakers: Speaker[], p: Point, reference: number, height: number): number {
  const energy = speakers.reduce((sum, s) => sum + 10 ** (levelAt(s, p, reference, height) / 10), 0);
  return energy > 0 ? 10 * Math.log10(energy) : 0;
}
export function recommend(plan: SpeakerPlan, kind: SpeakerKind, count: number): Speaker[] {
  const points = samples(plan.polygon, plan.width, plan.depth, 60);
  if (!points.length) return [];
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const rows = Math.ceil(count / 2), config = SPEAKER_TYPES[kind];
  const nearest = (target: Point) => points.reduce((best, p) => distance(p, target) < distance(best, target) ? p : best, points[0] ?? target);
  const result: Speaker[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 2), left = i % 2 === 0;
    const startY = minY + (maxY - minY) * row / rows;
    const pos = nearest({ x: left ? minX + (maxX - minX) * 0.12 : maxX - (maxX - minX) * 0.12, y: startY + 0.3 });
    const target = nearest({ x: minX + (maxX - minX) * (left ? 0.32 : 0.68), y: minY + (maxY - minY) * (row + 0.8) / rows });
    const main = result[i % 2];
    const delay = row && main ? distance(main, pos) / 343 * 1000 : 0;
    result.push({ ...pos, id: `sp${i + 1}`, name: `${row ? `Fill ${row}` : "Main"} ${left ? "L" : "R"}`, kind, aim: angleTo(pos, target), beam: config.beam, reach: config.reach, gain: row ? -3 : 0, delay: Math.round(delay * 10) / 10 });
  }
  return result;
}
export function coverage(plan: SpeakerPlan) {
  const points = samples(plan.polygon, plan.width, plan.depth);
  const levels = points.map(p => combinedLevel(plan.speakers, p, plan.reference, plan.height));
  const covered = points.filter(p => plan.speakers.some(s => distance(s, p) <= s.reach && (s.beam === 360 || offAxis(s, p) <= s.beam / 2))).length;
  const sorted = [...levels].sort((a, b) => a - b);
  return { points, levels, percent: points.length ? Math.round(covered / points.length * 100) : 0, spread: sorted.length && plan.speakers.length ? (sorted[Math.floor((sorted.length - 1) * 0.9)] ?? 0) - (sorted[Math.floor((sorted.length - 1) * 0.1)] ?? 0) : 0 };
}
export function balanceAt(plan: SpeakerPlan, point: Point): Speaker[] {
  if (!plan.speakers.length) return [];
  const levels = plan.speakers.map(s => levelAt({ ...s, gain: 0 }, point, plan.reference, plan.height));
  const lowest = Math.min(...levels);
  const distances = plan.speakers.map(s => Math.hypot(distance(s, point), plan.height - 1.2));
  const farthest = Math.max(...distances);
  return plan.speakers.map((s, i) => ({ ...s, gain: Math.round(Math.max(-24, lowest - (levels[i] ?? lowest)) * 10) / 10, delay: Math.round((farthest - (distances[i] ?? farthest)) / 343 * 10000) / 10 }));
}
export function readPlan(raw: unknown): SpeakerPlan {
  if (!raw || typeof raw !== "object") throw new Error("Choose a VOXONE speaker plan JSON file.");
  const p = raw as SpeakerPlan;
  const number = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  if (p.version !== 1 || !number(p.width, 2, 100) || !number(p.depth, 2, 100) || !number(p.reference, 40, 130) || !number(p.height, 1.2, 10) || !Array.isArray(p.polygon) || p.polygon.length > 60 || !p.polygon.every(v => v && number(v.x, 0, p.width) && number(v.y, 0, p.depth)) || !validArea(p.polygon) || !Array.isArray(p.speakers) || p.speakers.length > 16) throw new Error("This plan has invalid dimensions or an invalid audience area.");
  if (!p.speakers.every(s => s && typeof s.id === "string" && typeof s.name === "string" && Object.hasOwn(SPEAKER_TYPES, s.kind) && number(s.x, 0, p.width) && number(s.y, 0, p.depth) && number(s.aim, -180, 180) && number(s.beam, 10, 360) && number(s.reach, 1, 100) && number(s.gain, -24, 12) && number(s.delay, 0, 500))) throw new Error("This plan contains invalid speaker settings.");
  if (new Set(p.speakers.map(s => s.id)).size !== p.speakers.length) throw new Error("Speaker IDs must be unique.");
  return { version: 1, width: p.width, depth: p.depth, reference: p.reference, height: p.height, polygon: p.polygon.map(({ x, y }) => ({ x, y })), speakers: p.speakers.map(s => ({ ...s, name: s.name.slice(0, 40) })) };
}
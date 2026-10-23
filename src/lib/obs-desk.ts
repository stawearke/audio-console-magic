// Pure logic for the OBS desk: groups (DCA-style) and mix snapshots. No UI, no OBS calls.
import type { AudioChannel, EqValues } from "@/lib/mk/types";
import { FLAT_EQ } from "@/lib/mk/types";
import { normalizeVoice, type ObsVoice } from "@/lib/mk/obs-voice";

export const GROUP_COUNT = 4;
export const SNAPSHOT_SLOTS = 8;
export const GROUPS_KEY = "voxone-obs-groups";
export const SNAPSHOTS_KEY = "voxone-obs-snapshots";

/** A group moves several OBS inputs together with one fader and one mute (OBS itself has no groups). */
export interface ObsGroup {
  id: string;
  name: string;
  members: string[];
  /** Fader position in dB relative to where the members were when the group fader left 0. */
  offset: number;
}

export const defaultGroups = (): ObsGroup[] =>
  Array.from({ length: GROUP_COUNT }, (_, i) => ({ id: `g${i + 1}`, name: `GROUP ${i + 1}`, members: [], offset: 0 }));

const isStr = (v: unknown): v is string => typeof v === "string";

/** Accepts anything from storage or a file; always returns exactly GROUP_COUNT valid groups. */
export function sanitizeGroups(raw: unknown): ObsGroup[] {
  const base = defaultGroups();
  if (!Array.isArray(raw)) return base;
  return base.map((g, i) => {
    const r = raw[i] as Partial<ObsGroup> | undefined;
    if (!r || typeof r !== "object") return g;
    return {
      id: g.id,
      name: isStr(r.name) && r.name.trim() ? r.name.trim().slice(0, 24) : g.name,
      members: Array.isArray(r.members) ? [...new Set(r.members.filter(isStr))] : [],
      offset: typeof r.offset === "number" && Number.isFinite(r.offset) ? Math.min(12, Math.max(-60, r.offset)) : 0,
    };
  });
}

/** True when the group has members in OBS and every one of them is muted. */
export function groupMuted(group: ObsGroup, channels: AudioChannel[]): boolean {
  const live = group.members.map((n) => channels.find((c) => c.name === n)).filter((c): c is AudioChannel => !!c);
  return live.length > 0 && live.every((c) => c.muted);
}

/** Target level of a member for a group fader position, from the level it had when the fader left 0. */
export const memberTarget = (base: number, offset: number) => base + offset;

export interface SnapInput {
  db: number;
  muted: boolean;
  stream: boolean;
  tracks?: boolean[];
  eq: EqValues;
  voice?: ObsVoice;
}

export interface Snapshot {
  name: string;
  savedAt: string;
  inputs: Record<string, SnapInput>;
}

export function snapshotOf(name: string, channels: AudioChannel[], voices: Record<string, ObsVoice> = {}): Snapshot {
  const inputs: Record<string, SnapInput> = {};
  for (const c of channels) {
    inputs[c.name] = {
      db: c.db,
      muted: c.muted,
      stream: c.stream,
      ...(c.tracks ? { tracks: [...c.tracks] } : {}),
      eq: { ...(c.eq ?? FLAT_EQ) },
      ...(voices[c.name] ? { voice: voices[c.name]! } : {}),
    };
  }
  return { name: name.trim().slice(0, 24) || "SNAPSHOT", savedAt: new Date().toISOString(), inputs };
}

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

function sanitizeInput(raw: unknown): SnapInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const eq = (r["eq"] ?? {}) as Record<string, unknown>;
  const out: SnapInput = {
    db: num(r["db"], 0),
    muted: r["muted"] === true,
    stream: r["stream"] !== false,
    eq: { gain: num(eq["gain"], 0), hi: num(eq["hi"], 0), mid: num(eq["mid"], 0), lo: num(eq["lo"], 0) } as EqValues,
  };
  if (r["voice"] && typeof r["voice"] === "object") out.voice = normalizeVoice(r["voice"]);
  return out;
}

/** Exactly SNAPSHOT_SLOTS entries, each a valid snapshot or null. Junk from storage or a file is dropped. */
export function sanitizeSnapshots(raw: unknown): (Snapshot | null)[] {
  const slots: (Snapshot | null)[] = Array.from({ length: SNAPSHOT_SLOTS }, () => null);
  if (!Array.isArray(raw)) return slots;
  raw.slice(0, SNAPSHOT_SLOTS).forEach((s, i) => {
    if (!s || typeof s !== "object") return;
    const r = s as Record<string, unknown>;
    if (!r["inputs"] || typeof r["inputs"] !== "object") return;
    const inputs: Record<string, SnapInput> = {};
    for (const [name, v] of Object.entries(r["inputs"] as Record<string, unknown>)) {
      const clean = sanitizeInput(v);
      if (clean) inputs[name] = clean;
    }
    slots[i] = { name: isStr(r["name"]) && r["name"].trim() ? r["name"].trim().slice(0, 24) : `SNAPSHOT ${i + 1}`, savedAt: isStr(r["savedAt"]) ? r["savedAt"] : "", inputs };
  });
  return slots;
}

/** What recalling a snapshot can and cannot do right now. */
export function recallPlan(snap: Snapshot, channels: AudioChannel[]) {
  const have = new Set(channels.map((c) => c.name));
  const names = Object.keys(snap.inputs);
  return { apply: names.filter((n) => have.has(n)), missing: names.filter((n) => !have.has(n)) };
}

export const SCENE_LINKS_KEY = "voxone-obs-scene-links";

/** Which OBS scene each snapshot slot belongs to, and whether switching scenes recalls it automatically. */
export interface SceneLinks {
  auto: boolean;
  scenes: (string | null)[];
}

export const defaultLinks = (): SceneLinks => ({ auto: false, scenes: Array.from({ length: SNAPSHOT_SLOTS }, () => null) });

export function sanitizeLinks(raw: unknown): SceneLinks {
  const out = defaultLinks();
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  out.auto = r["auto"] === true;
  if (Array.isArray(r["scenes"])) out.scenes = out.scenes.map((_, i) => (isStr((r["scenes"] as unknown[])[i]) && (r["scenes"] as string[])[i] ? (r["scenes"] as string[])[i]! : null));
  return out;
}

/** First slot that has a snapshot and is linked to this scene, or -1. */
export function slotForScene(links: SceneLinks, slots: (Snapshot | null)[], scene: string): number {
  return links.scenes.findIndex((s, i) => s === scene && !!slots[i]);
}

const readJson = (key: string): unknown => {
  try {
    return typeof window === "undefined" ? null : JSON.parse(window.localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
};
export const loadSlots = () => sanitizeSnapshots(readJson(SNAPSHOTS_KEY));
export const loadLinks = () => sanitizeLinks(readJson(SCENE_LINKS_KEY));

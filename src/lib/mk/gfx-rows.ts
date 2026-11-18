// Design + Rows: save a Custom design once, then keep a list of rows for it. A row is one set of
// fill-in values (Show A, Show B, a guest name, a story headline). Taking a row puts the design on air
// with those values; editing the design changes every row. Stored in this browser, like the library.
//
// Every saved Custom design also shows up as a rundown template with id `custom:<designId>`, so it can be
// queued in the Graphics Rundown (and in packages) with the same transitions and timers as built-ins.
import { useSyncExternalStore } from "react";

import { gfxLibrary } from "./gfx-library";
import type { Template } from "./gfx-rundown";
import type { CustomEl } from "./types";

const KEY = "mkvision.gfx.rows.v1";
const STAMPS = "mkvision.gfx.rows.stamps.v1";
const MAX_ROWS = 200;
export const CUSTOM_PREFIX = "custom:";

export interface DesignRow {
  id: string;
  name: string;
  values: Record<string, string>;
}

type RowMap = Record<string, DesignRow[]>;

// ------------------------------------------------------------------ pure helpers

/** Distinct fill-in field names of a design (text elements only; logos stay as designed). */
export function fieldsOf(elements: CustomEl[]): string[] {
  const seen: string[] = [];
  for (const e of elements) {
    const f = e.field.trim();
    if (e.type === "text" && f && !seen.includes(f)) seen.push(f);
  }
  return seen;
}

/** The design's own text for each field (first element wins). */
export function defaultsOf(elements: CustomEl[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of elements) {
    const f = e.field.trim();
    if (e.type === "text" && f && !(f in out)) out[f] = e.text;
  }
  return out;
}

/** The design with a row's values written into the matching text elements. */
export function applyRow(elements: CustomEl[], values: Record<string, string>): CustomEl[] {
  return elements.map((e) => {
    const f = e.field.trim();
    return e.type === "text" && f && values[f] !== undefined ? { ...e, text: values[f]!.slice(0, 500) } : e;
  });
}

const rid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function cleanRow(raw: unknown): DesignRow | null {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!r) return null;
  const values: Record<string, string> = {};
  if (r["values"] && typeof r["values"] === "object") {
    for (const [k, v] of Object.entries(r["values"] as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number") values[k.slice(0, 30)] = String(v).slice(0, 500);
    }
  }
  const name = typeof r["name"] === "string" ? r["name"].slice(0, 80) : "";
  return { id: typeof r["id"] === "string" && r["id"] ? r["id"].slice(0, 40) : rid(), name: name || "Row", values };
}

/**
 * Turn pasted spreadsheet text (tab- or comma-separated, one row per line) into rows.
 * A first line made of field names is treated as a header; otherwise columns follow the field order.
 */
export function parseRows(text: string, fields: string[]): DesignRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
  if (!lines.length || !fields.length) return [];
  const split = (l: string) => (l.includes("\t") ? l.split("\t") : l.split(",")).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
  let cols = fields;
  let body = lines;
  const head = split(lines[0]!);
  const lower = fields.map((f) => f.toLowerCase());
  if (head.every((h) => lower.includes(h.toLowerCase())) && head.some(Boolean)) {
    cols = head.map((h) => fields[lower.indexOf(h.toLowerCase())]!);
    body = lines.slice(1);
  }
  return body.slice(0, MAX_ROWS).map((l) => {
    const cells = split(l);
    const values: Record<string, string> = {};
    cols.forEach((c, i) => {
      if (cells[i] !== undefined) values[c] = cells[i]!.slice(0, 500);
    });
    const first = cells.find((c) => c) ?? "Row";
    return { id: rid(), name: first.slice(0, 80), values };
  });
}

// ------------------------------------------------------------------ store

class RowStore {
  private map: RowMap = {};
  private stamps: Record<string, number> = {};
  private loaded = false;
  private listeners = new Set<() => void>();

  private load() {
    if (this.loaded || typeof window === "undefined") return;
    this.loaded = true;
    try {
      const raw = window.localStorage.getItem(KEY);
      const st = window.localStorage.getItem(STAMPS);
      const sp = st ? (JSON.parse(st) as unknown) : {};
      if (sp && typeof sp === "object") {
        for (const [k, v] of Object.entries(sp as Record<string, unknown>)) if (Number.isFinite(Number(v))) this.stamps[k] = Number(v);
      }
      const parsed = raw ? (JSON.parse(raw) as unknown) : {};
      if (parsed && typeof parsed === "object") {
        for (const [id, list] of Object.entries(parsed as Record<string, unknown>)) {
          if (Array.isArray(list)) this.map[id] = list.slice(0, MAX_ROWS).map(cleanRow).filter((r): r is DesignRow => !!r);
        }
      }
    } catch {
      this.map = {};
    }
  }

  private commit(next: RowMap, stamp = true) {
    if (stamp) {
      const now = Date.now();
      for (const id of new Set([...Object.keys(next), ...Object.keys(this.map)])) {
        if (JSON.stringify(next[id]) !== JSON.stringify(this.map[id])) this.stamps[id] = now;
      }
    }
    this.map = next;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.map));
      window.localStorage.setItem(STAMPS, JSON.stringify(this.stamps));
    } catch {
      /* storage full — keep running in memory */
    }
    this.listeners.forEach((l) => l());
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = (): RowMap => {
    this.load();
    return this.map;
  };

  rows(designId: string): DesignRow[] {
    this.load();
    return this.map[designId] ?? [];
  }

  add(designId: string, name: string, values: Record<string, string>): DesignRow {
    this.load();
    const row = cleanRow({ id: rid(), name, values })!;
    this.commit({ ...this.map, [designId]: [...this.rows(designId), row].slice(0, MAX_ROWS) });
    return row;
  }

  addMany(designId: string, list: DesignRow[]): number {
    this.load();
    const clean = list.map((r) => cleanRow({ ...r, id: rid() })).filter((r): r is DesignRow => !!r);
    this.commit({ ...this.map, [designId]: [...this.rows(designId), ...clean].slice(0, MAX_ROWS) });
    return clean.length;
  }

  patch(designId: string, rowId: string, p: { name?: string; values?: Record<string, string> }) {
    this.load();
    this.commit({
      ...this.map,
      [designId]: this.rows(designId).map((r) =>
        r.id === rowId ? { ...r, name: p.name !== undefined ? p.name.slice(0, 80) : r.name, values: p.values ?? r.values } : r,
      ),
    });
  }

  remove(designId: string, rowId: string) {
    this.load();
    this.commit({ ...this.map, [designId]: this.rows(designId).filter((r) => r.id !== rowId) });
  }

  move(designId: string, rowId: string, d: -1 | 1) {
    const list = [...this.rows(designId)];
    const i = list.findIndex((r) => r.id === rowId);
    const j = i + d;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    this.commit({ ...this.map, [designId]: list });
  }

  stamp(designId: string): number {
    this.load();
    return this.stamps[designId] ?? 0;
  }

  /** Merge rows from the cloud: per design, the newer list wins. */
  mergeRemote(list: { id: string; rows: unknown; updated: number }[]) {
    this.load();
    const next = { ...this.map };
    for (const r of list) {
      if (!Array.isArray(r.rows) || r.updated <= (this.stamps[r.id] ?? 0)) continue;
      next[r.id] = r.rows.slice(0, MAX_ROWS).map(cleanRow).filter((x): x is DesignRow => !!x);
      this.stamps[r.id] = r.updated;
    }
    this.commit(next, false);
  }

  /** A deleted design takes its rows with it. */
  dropDesign(designId: string) {
    this.load();
    if (!(designId in this.map)) return;
    const { [designId]: _gone, ...rest } = this.map;
    void _gone;
    this.commit(rest);
  }
}

export const rowStore = new RowStore();

const EMPTY: RowMap = {};

export function useDesignRows(designId: string): DesignRow[] {
  const map = useSyncExternalStore(rowStore.subscribe, rowStore.getSnapshot, () => EMPTY);
  return map[designId] ?? [];
}

// ------------------------------------------------------------------ rundown templates

/** A saved Custom design as a rundown template. Content is read from the library at take time. */
export function customTemplate(id: string): Template | undefined {
  if (!id.startsWith(CUSTOM_PREFIX)) return undefined;
  const designId = id.slice(CUSTOM_PREFIX.length);
  const design = gfxLibrary.getSnapshot().find((d) => d.id === designId && d.layer === "custom");
  if (!design) return undefined;
  const els = (design.data as { elements: CustomEl[] }).elements;
  return {
    id,
    name: design.name,
    category: "Custom",
    layer: "custom",
    durationSec: 0,
    fields: fieldsOf(els).map((f) => ({ key: f, label: f, type: "text" as const })),
    defaults: defaultsOf(els),
    patch: (d) => ({ elements: applyRow(els, d) }),
  };
}

export function customTemplates(): Template[] {
  return gfxLibrary
    .getSnapshot()
    .filter((d) => d.layer === "custom")
    .map((d) => customTemplate(`${CUSTOM_PREFIX}${d.id}`))
    .filter((t): t is Template => !!t);
}

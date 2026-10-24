// Prompter script library: named scripts kept on this device, each with its last few versions.
// The pure functions work on a plain `Lib` value so they are easy to test; the store at the bottom
// keeps it in localStorage.
import { useSyncExternalStore } from "react";

export interface ScriptVersion {
  at: number;
  text: string;
}
export interface Script {
  id: string;
  name: string;
  text: string;
  updated: number;
  /** Older texts, newest first. */
  versions: ScriptVersion[];
}
export interface Lib {
  items: Script[];
  active: string | null;
}

export const MAX_VERSIONS = 10;
export const MAX_SCRIPTS = 100;
const MAX_TEXT = 200_000;
export const EMPTY_LIB: Lib = { items: [], active: null };

const cleanName = (n: string) => n.trim().replace(/\s+/g, " ").slice(0, 60) || "Untitled";

export function cleanLib(raw: unknown): Lib {
  const r = (raw && typeof raw === "object" ? raw : {}) as { items?: unknown; active?: unknown };
  const items: Script[] = [];
  if (Array.isArray(r.items)) {
    for (const it of r.items.slice(0, MAX_SCRIPTS)) {
      const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
      if (typeof o["id"] !== "string" || typeof o["text"] !== "string") continue;
      const versions = Array.isArray(o["versions"])
        ? (o["versions"] as unknown[])
            .flatMap((v) => {
              const x = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
              return typeof x["text"] === "string" && typeof x["at"] === "number"
                ? [{ at: x["at"], text: x["text"].slice(0, MAX_TEXT) }]
                : [];
            })
            .slice(0, MAX_VERSIONS)
        : [];
      items.push({
        id: o["id"],
        name: cleanName(typeof o["name"] === "string" ? o["name"] : ""),
        text: o["text"].slice(0, MAX_TEXT),
        updated: typeof o["updated"] === "number" ? o["updated"] : 0,
        versions,
      });
    }
  }
  const active =
    typeof r.active === "string" && items.some((s) => s.id === r.active) ? r.active : null;
  return { items, active };
}

/** Keep the old text as a version, unless nothing changed. */
function withVersion(s: Script, text: string, now: number): Script {
  if (text === s.text) return s;
  const versions =
    s.text.trim() === ""
      ? s.versions
      : [{ at: s.updated || now, text: s.text }, ...s.versions].slice(0, MAX_VERSIONS);
  return { ...s, text: text.slice(0, MAX_TEXT), updated: now, versions };
}

export function addScript(lib: Lib, id: string, name: string, text: string, now: number): Lib {
  if (lib.items.length >= MAX_SCRIPTS) return lib;
  const s: Script = {
    id,
    name: cleanName(name),
    text: text.slice(0, MAX_TEXT),
    updated: now,
    versions: [],
  };
  return { items: [...lib.items, s], active: id };
}

export function saveScript(lib: Lib, id: string, text: string, now: number): Lib {
  return { ...lib, items: lib.items.map((s) => (s.id === id ? withVersion(s, text, now) : s)) };
}

export function renameScript(lib: Lib, id: string, name: string): Lib {
  return {
    ...lib,
    items: lib.items.map((s) => (s.id === id ? { ...s, name: cleanName(name) } : s)),
  };
}

export function removeScript(lib: Lib, id: string): Lib {
  return {
    items: lib.items.filter((s) => s.id !== id),
    active: lib.active === id ? null : lib.active,
  };
}

export function setActive(lib: Lib, id: string | null): Lib {
  return { ...lib, active: id !== null && lib.items.some((s) => s.id === id) ? id : null };
}

// ------------------------------------------------------------------ store (this device)

const KEY = "mkvision.scripts.v1";
let lib: Lib = EMPTY_LIB;
let loaded = false;
const subs = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    lib = cleanLib(JSON.parse(window.localStorage.getItem(KEY) ?? "null"));
  } catch {
    lib = EMPTY_LIB;
  }
}

function commit(next: Lib) {
  lib = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lib));
  } catch {
    /* storage full or blocked: kept for this session */
  }
  subs.forEach((f) => f());
}

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const scripts = {
  get: (): Lib => {
    load();
    return lib;
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  },
  add: (name: string, text: string) => {
    load();
    const id = newId();
    commit(addScript(lib, id, name, text, Date.now()));
    return id;
  },
  save: (id: string, text: string) => {
    load();
    commit(saveScript(lib, id, text, Date.now()));
  },
  rename: (id: string, name: string) => {
    load();
    commit(renameScript(lib, id, name));
  },
  remove: (id: string) => {
    load();
    commit(removeScript(lib, id));
  },
  setActive: (id: string | null) => {
    load();
    commit(setActive(lib, id));
  },
};

export const useScripts = (): Lib =>
  useSyncExternalStore(scripts.subscribe, scripts.get, () => EMPTY_LIB);

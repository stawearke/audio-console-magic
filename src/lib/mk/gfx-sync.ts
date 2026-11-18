// Cloud copy of the graphics library: saved designs, My packages and design rows live in Supabase
// (table mk_gfx) so every desk and PC sees the same set. The browser keeps working offline from
// localStorage; this module merges on sign-in, pushes changes shortly after they happen, and pulls
// when another desk changes something. Newer copy wins per item. The Rundown itself already syncs
// through the shared setup, so it is not repeated here.
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { gfxLibrary } from "./gfx-library";
import { packageStore } from "./gfx-packages";
import { rowStore } from "./gfx-rows";

type Kind = "design" | "package" | "rows";
interface Entry {
  kind: Kind;
  id: string;
  data: unknown;
}

const PUSH_DELAY = 1500;
const kk = (kind: string, id: string) => `${kind}:${id}`;

/** Everything this browser holds, as cloud entries. */
function localEntries(): Entry[] {
  const out: Entry[] = [];
  for (const d of gfxLibrary.getSnapshot()) out.push({ kind: "design", id: d.id, data: d });
  for (const p of packageStore.getSnapshot()) out.push({ kind: "package", id: p.id, data: p });
  const map = rowStore.getSnapshot();
  for (const [id, rows] of Object.entries(map)) {
    if (rows.length) out.push({ kind: "rows", id, data: { rows, updated: rowStore.stamp(id) } });
  }
  return out;
}

/** What to merge into the local stores from what the cloud sent. Pure, so it can be tested. */
export function splitRemote(rows: { kind: string; id: string; data: unknown }[]) {
  const designs: unknown[] = [];
  const packages: unknown[] = [];
  const rowSets: { id: string; rows: unknown; updated: number }[] = [];
  for (const r of rows) {
    if (r.kind === "design") designs.push(r.data);
    else if (r.kind === "package") packages.push(r.data);
    else if (r.kind === "rows" && r.data && typeof r.data === "object") {
      const d = r.data as { rows?: unknown; updated?: unknown };
      rowSets.push({ id: r.id, rows: d.rows, updated: Number(d.updated) || 0 });
    }
  }
  return { designs, packages, rowSets };
}

export type SyncStatus = "off" | "syncing" | "synced" | "error" | "read-only";

class GfxSync {
  private c: SupabaseClient | null = null;
  private uid: string | null = null;
  private canWrite = false;
  private last = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private channel: RealtimeChannel | null = null;
  private unsubs: (() => void)[] = [];
  private onFocus = () => void this.pull();
  status: SyncStatus = "off";
  private listeners = new Set<() => void>();

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getStatus = () => this.status;
  private setStatus(s: SyncStatus) {
    this.status = s;
    this.listeners.forEach((l) => l());
  }

  async attach(c: SupabaseClient, uid: string, canWrite: boolean) {
    this.detach();
    this.c = c;
    this.uid = uid;
    this.canWrite = canWrite;
    await this.pull();
    this.unsubs = [
      gfxLibrary.subscribe(() => this.schedule()),
      packageStore.subscribe(() => this.schedule()),
      rowStore.subscribe(() => this.schedule()),
    ];
    this.channel = c
      .channel("mk-gfx")
      .on("postgres_changes", { event: "*", schema: "public", table: "mk_gfx" }, () => void this.pull())
      .subscribe();
    if (typeof window !== "undefined") window.addEventListener("focus", this.onFocus);
  }

  detach() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    if (this.channel && this.c) void this.c.removeChannel(this.channel);
    this.channel = null;
    if (typeof window !== "undefined") window.removeEventListener("focus", this.onFocus);
    this.c = null;
    this.uid = null;
    this.last.clear();
    this.setStatus("off");
  }

  /** Fetch everything, merge it into this browser, and queue whatever the cloud lacks or has older. */
  async pull() {
    const c = this.c;
    if (!c) return;
    this.setStatus("syncing");
    const { data, error } = await c.from("mk_gfx").select("kind,id,data");
    if (error) {
      this.setStatus("error");
      return;
    }
    const { designs, packages, rowSets } = splitRemote(data ?? []);
    gfxLibrary.mergeRemote(designs);
    packageStore.mergeRemote(packages);
    rowStore.mergeRemote(rowSets);
    // Entries that now equal the cloud's copy need no push; the rest (newer or local-only) will be pushed.
    const remote = new Map((data ?? []).map((r) => [kk(r.kind, r.id), r]));
    this.last.clear();
    for (const e of localEntries()) {
      const r = remote.get(kk(e.kind, e.id));
      if (r && JSON.stringify(r.data) === JSON.stringify(e.data)) this.last.set(kk(e.kind, e.id), JSON.stringify(e.data));
    }
    this.setStatus(this.canWrite ? "synced" : "read-only");
    this.schedule(0);
  }

  private schedule(delay = PUSH_DELAY) {
    if (!this.c || !this.canWrite) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.push(), delay);
  }

  private async push() {
    const c = this.c;
    if (!c || !this.canWrite) return;
    const local = new Map(localEntries().map((e) => [kk(e.kind, e.id), e]));
    const up: Entry[] = [];
    for (const [k, e] of local) if (this.last.get(k) !== JSON.stringify(e.data)) up.push(e);
    const gone = [...this.last.keys()].filter((k) => !local.has(k));
    if (!up.length && !gone.length) return;
    this.setStatus("syncing");
    const now = new Date().toISOString();
    if (up.length) {
      const { error } = await c
        .from("mk_gfx")
        .upsert(up.map((e) => ({ kind: e.kind, id: e.id, data: e.data as never, updated_by: this.uid, updated_at: now })));
      if (error) return this.setStatus("error");
      for (const e of up) this.last.set(kk(e.kind, e.id), JSON.stringify(e.data));
    }
    for (const k of gone) {
      const [kind, ...rest] = k.split(":");
      const { error } = await c.from("mk_gfx").delete().eq("kind", kind!).eq("id", rest.join(":"));
      if (error) return this.setStatus("error");
      this.last.delete(k);
    }
    this.setStatus("synced");
  }
}

export const gfxSync = new GfxSync();

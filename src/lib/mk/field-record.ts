/**
 * Backup recording on the reporter's phone: a full-quality copy of what the phone is sending, kept ON the phone,
 * so a dropped or squeezed uplink never costs the good picture.
 *
 *   - Records the same camera + mic stream that goes to the studio, at the director's top bitrate (never lowered by Auto quality).
 *   - Stored on the phone in small pieces as it goes (IndexedDB), so a closed tab or a dead battery loses seconds, not the show.
 *   - One GO LIVE = one recording made of PARTS. The page opens a brand-new camera stream whenever the camera, mic, size,
 *     frame rate or front/back changes, and a recorder cannot follow that, so each new stream starts a new part
 *     (a short gap at the switch). Every part plays on its own.
 *   - The reporter saves or shares the files afterwards (share sheet on phones, download elsewhere).
 */

// ------------------------------------------------------------------------------------------------- what is kept

export interface RecMeta {
  id: string;
  /** What the reporter sees in the list, e.g. "FIELD 1 Ryan". */
  name: string;
  startedAt: number;
  /** Missing while recording, and on a recording that was cut short (closed tab, flat battery): it is still there to save. */
  endedAt?: number | undefined;
  /** The file type the phone's recorder produced. */
  mime: string;
  parts: number;
  bytes: number;
}

/** Where the pieces go. The real one is IndexedDB; tests use memory. */
export interface RecStore {
  begin(meta: RecMeta): Promise<void>;
  update(id: string, patch: Partial<RecMeta>): Promise<void>;
  append(id: string, part: number, seq: number, chunk: Blob): Promise<void>;
  /** Newest first. */
  list(): Promise<RecMeta[]>;
  /** One part, put back together as a file. */
  read(id: string, part: number): Promise<Blob>;
  remove(id: string): Promise<void>;
}

export function memoryStore(): RecStore {
  const metas = new Map<string, RecMeta>();
  const chunks = new Map<string, { part: number; seq: number; blob: Blob }[]>();
  return {
    async begin(m) {
      metas.set(m.id, { ...m });
      chunks.set(m.id, []);
    },
    async update(id, patch) {
      const m = metas.get(id);
      if (m) metas.set(id, { ...m, ...patch });
    },
    async append(id, part, seq, blob) {
      chunks.get(id)?.push({ part, seq, blob });
    },
    async list() {
      return [...metas.values()].sort((a, b) => b.startedAt - a.startedAt);
    },
    async read(id, part) {
      const c = (chunks.get(id) ?? []).filter((x) => x.part === part).sort((a, b) => a.seq - b.seq);
      return new Blob(
        c.map((x) => x.blob),
        { type: metas.get(id)?.mime ?? "" },
      );
    },
    async remove(id) {
      metas.delete(id);
      chunks.delete(id);
    },
  };
}

const DB = "mk-field-rec";
const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error ?? new Error("Storage error"));
  });
const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error ?? new Error("Storage error"));
    tx.onabort = () => rej(tx.error ?? new Error("Storage aborted"));
  });
const all = (id: string, part?: number) =>
  part === undefined
    ? IDBKeyRange.bound([id, 0, 0], [id, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER])
    : IDBKeyRange.bound([id, part, 0], [id, part, Number.MAX_SAFE_INTEGER]);

/** The real store, in the phone's IndexedDB. Null where the browser has none (then there is no backup recording). */
export function idbStore(
  factory: IDBFactory | undefined = typeof indexedDB === "undefined" ? undefined : indexedDB,
): RecStore | null {
  if (!factory) return null;
  let opened: Promise<IDBDatabase> | null = null;
  const db = () =>
    (opened ??= new Promise<IDBDatabase>((res, rej) => {
      const o = factory.open(DB, 1);
      o.onupgradeneeded = () => {
        o.result.createObjectStore("meta", { keyPath: "id" });
        o.result.createObjectStore("chunks"); // key = [id, part, seq]
      };
      o.onsuccess = () => res(o.result);
      o.onerror = () => rej(o.error ?? new Error("Cannot open storage"));
    }));
  return {
    async begin(meta) {
      const d = await db();
      const tx = d.transaction("meta", "readwrite");
      tx.objectStore("meta").put(meta);
      await done(tx);
    },
    async update(id, patch) {
      const d = await db();
      const tx = d.transaction("meta", "readwrite");
      const s = tx.objectStore("meta");
      const cur = (await req(s.get(id))) as RecMeta | undefined;
      if (cur) s.put({ ...cur, ...patch });
      await done(tx);
    },
    async append(id, part, seq, chunk) {
      const d = await db();
      const tx = d.transaction("chunks", "readwrite");
      tx.objectStore("chunks").put(chunk, [id, part, seq]);
      await done(tx);
    },
    async list() {
      const d = await db();
      const rows = (await req(d.transaction("meta").objectStore("meta").getAll())) as RecMeta[];
      return rows.sort((a, b) => b.startedAt - a.startedAt);
    },
    async read(id, part) {
      const d = await db();
      const mime =
        ((await req(d.transaction("meta").objectStore("meta").get(id))) as RecMeta | undefined)
          ?.mime ?? "";
      const blobs = (await req(
        d.transaction("chunks").objectStore("chunks").getAll(all(id, part)),
      )) as Blob[];
      return new Blob(blobs, { type: mime });
    },
    async remove(id) {
      const d = await db();
      const tx = d.transaction(["meta", "chunks"], "readwrite");
      tx.objectStore("chunks").delete(all(id));
      tx.objectStore("meta").delete(id);
      await done(tx);
    },
  };
}

// ------------------------------------------------------------------------------------------------- helpers

/** Best format first: MP4 plays everywhere (editors, WhatsApp, iPhones); WebM is what some Android browsers give. */
export const REC_MIMES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function pickMime(isSupported: (t: string) => boolean): string {
  return REC_MIMES.find((m) => isSupported(m)) ?? "";
}

export const extOf = (mime: string) => (mime.includes("mp4") ? "mp4" : "webm");

export function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`;
  return `${Math.max(0, Math.round(n / 1e3))} KB`;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const two = (v: number) => String(v).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

/** "FIELD-1-Ryan_2026-11-18_1432.mp4", or "..._part2.mp4" when the recording has several parts. */
export function fileName(
  meta: Pick<RecMeta, "name" | "startedAt" | "mime" | "parts">,
  part: number,
): string {
  const d = new Date(meta.startedAt);
  const two = (v: number) => String(v).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}_${two(d.getHours())}${two(d.getMinutes())}`;
  const slug = meta.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "field";
  return `${slug}_${stamp}${meta.parts > 1 ? `_part${part + 1}` : ""}.${extOf(meta.mime)}`;
}

// ------------------------------------------------------------------------------------------------- the recorder

export interface RecStatus {
  /** A recording is running (also while waiting for the camera to come back after a switch). */
  on: boolean;
  bytes: number;
  ms: number;
  parts: number;
  /** Why it stopped by itself, in words for the reporter. Empty = fine. */
  error: string;
}

export const REC_IDLE: RecStatus = { on: false, bytes: 0, ms: 0, parts: 0, error: "" };

/** Stop before the phone has less free space than this: the show matters more than the backup. */
export const LOW_SPACE_BYTES = 300 * 1e6;
/** Roughly how many minutes of backup fit in the phone's free space at this video bitrate (the sound adds about 128 kbps). Keeps the low-space reserve free. */
export function minutesOfSpace(freeBytes: number, kbps: number): number {
  const perSecond = (Math.max(1, kbps) * 1000 + 128_000) / 8;
  return Math.max(0, Math.floor((freeBytes - LOW_SPACE_BYTES) / perSecond / 60));
}

export function spaceLeftText(minutes: number): string {
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

const SLICE_MS = 1000;
const SAVE_META_EVERY = 10;
const CHECK_SPACE_EVERY = 15;

interface RecorderCtor {
  new (s: MediaStream, o?: MediaRecorderOptions): MediaRecorder;
  isTypeSupported(t: string): boolean;
}

export interface RecDeps {
  Recorder: RecorderCtor | undefined;
  now: () => number;
  newId: () => string;
  /** Free space on the phone in bytes, or null if the browser will not say. */
  freeBytes: () => Promise<number | null>;
}

const realDeps = (): RecDeps => ({
  Recorder:
    typeof MediaRecorder === "undefined" ? undefined : (MediaRecorder as unknown as RecorderCtor),
  now: () => Date.now(),
  newId: () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
  freeBytes: async () => {
    try {
      const e = await navigator.storage?.estimate?.();
      return e?.quota !== undefined && e.usage !== undefined ? e.quota - e.usage : null;
    } catch {
      return null;
    }
  },
});

export class FieldRecorder {
  /** Called whenever something changes (about once a second while recording). */
  onChange: (s: RecStatus) => void = () => {};

  private deps: RecDeps;
  private id = "";
  private name = "";
  private mime = "";
  private kbps = 0;
  private startedAt = 0;
  private active = false;
  private starting = false;
  private bytes = 0;
  private parts = 0;
  private seq = 0;
  private chunks = 0;
  private error = "";
  private cur: MediaRecorder | null = null;
  private curStream: MediaStream | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private partEnded: (() => void) | null = null;

  constructor(
    private store: RecStore,
    deps: Partial<RecDeps> = {},
  ) {
    this.deps = { ...realDeps(), ...deps };
  }

  get status(): RecStatus {
    return {
      on: this.active,
      bytes: this.bytes,
      ms: this.startedAt ? this.deps.now() - this.startedAt : 0,
      parts: this.parts,
      error: this.error,
    };
  }

  private emit() {
    this.onChange(this.status);
  }

  /** The recording being made right now ("" when none). The page remembers it so a refresh can carry on in it. */
  get recordingId(): string {
    return this.active ? this.id : "";
  }

  /**
   * Starts a recording of `stream`. Returns false (and says why in `status.error`) if the phone cannot.
   * With `resume` (the id of a recording left cut short by a refresh or a crash) it carries on in THAT recording, as a new part.
   */
  async start(
    stream: MediaStream,
    opts: { name: string; kbps: number; resume?: string },
  ): Promise<boolean> {
    if (this.active || this.starting) return true;
    const { Recorder } = this.deps;
    this.error = "";
    if (!Recorder) return this.refuse("This browser cannot record a backup.");
    this.starting = true;
    try {
      this.mime = pickMime((t) => Recorder.isTypeSupported(t));
      this.kbps = opts.kbps;
      this.seq = 0;
      this.chunks = 0;
      const before = opts.resume
        ? await this.store.list().then(
            (l) => l.find((m) => m.id === opts.resume),
            () => undefined,
          )
        : undefined;
      if (before) {
        this.id = before.id;
        this.name = before.name;
        this.mime = before.mime || this.mime;
        this.startedAt = before.startedAt;
        this.bytes = before.bytes;
        this.parts = before.parts;
        // The saved count can be a few seconds old: never write over a part that is already there.
        while ((await this.store.read(this.id, this.parts).catch(() => new Blob())).size > 0)
          this.parts++;
        try {
          await this.store.update(this.id, { endedAt: undefined });
        } catch {
          return this.refuse("The phone has nowhere to keep a backup recording.");
        }
      } else {
        this.id = this.deps.newId();
        this.name = opts.name;
        this.startedAt = this.deps.now();
        this.bytes = 0;
        this.parts = 0;
        try {
          await this.store.begin({
            id: this.id,
            name: this.name,
            startedAt: this.startedAt,
            mime: this.mime,
            parts: 0,
            bytes: 0,
          });
        } catch {
          this.startedAt = 0;
          return this.refuse("The phone has nowhere to keep a backup recording.");
        }
      }
      this.active = true;
      if (!this.startPart(stream)) {
        this.active = false;
        return this.refuse("The backup recording could not start.");
      }
      void navigator.storage?.persist?.().catch(() => {}); // ask the browser not to clear it when space is short
      this.emit();
      return true;
    } finally {
      this.starting = false;
    }
  }

  private refuse(why: string): false {
    this.error = why;
    this.emit();
    return false;
  }

  private startPart(stream: MediaStream): boolean {
    const { Recorder } = this.deps;
    if (!Recorder) return false;
    const part = this.parts;
    let rec: MediaRecorder;
    try {
      rec = new Recorder(stream, {
        ...(this.mime ? { mimeType: this.mime } : {}),
        videoBitsPerSecond: this.kbps * 1000,
        audioBitsPerSecond: 128_000,
      });
      rec.ondataavailable = (e) => this.onData(part, e.data);
      rec.onstop = () => this.onPartEnd(rec);
      rec.onerror = () => this.fail("The backup recording hit an error and stopped.");
      rec.start(SLICE_MS);
    } catch {
      return false;
    }
    this.parts++;
    this.cur = rec;
    this.curStream = stream;
    // Written at once, so a refresh right now still knows this part exists.
    this.chain = this.chain
      .then(() => this.store.update(this.id, { parts: this.parts }))
      .catch(() => {});
    return true;
  }

  private onData(part: number, blob: Blob) {
    if (!blob || blob.size === 0) return;
    const seq = this.seq++;
    this.bytes += blob.size;
    this.chunks++;
    this.chain = this.chain
      .then(() => this.store.append(this.id, part, seq, blob))
      .then(async () => {
        if (this.chunks % SAVE_META_EVERY === 0)
          await this.store.update(this.id, { bytes: this.bytes, parts: this.parts });
      })
      .catch(() => this.fail("The phone's storage is full. Recording stopped."));
    if (this.chunks % CHECK_SPACE_EVERY === 0)
      void this.deps.freeBytes().then((free) => {
        if (free !== null && free < LOW_SPACE_BYTES)
          this.fail("The phone is almost out of space. Recording stopped.");
      });
    this.emit();
  }

  /** A part ended on its own (the camera was switched and its tracks stopped) or because we stopped it. */
  private onPartEnd(rec: MediaRecorder) {
    if (rec === this.cur) {
      this.cur = null;
      this.curStream = null;
    }
    this.partEnded?.();
  }

  /** The page opened a new camera stream: carry on in a new part. Does nothing if not recording, or if it is the stream already recorded. */
  retarget(stream: MediaStream) {
    if (!this.active || stream === this.curStream) return;
    const old = this.cur;
    this.cur = null;
    this.curStream = null;
    try {
      if (old && old.state !== "inactive") old.stop(); // its last piece still arrives and is filed under its own part
    } catch {
      /* already stopped */
    }
    if (!this.startPart(stream))
      this.fail("The backup could not follow the camera switch and stopped.");
    else this.emit();
  }

  private fail(why: string) {
    if (!this.active) return;
    this.error = why;
    void this.stop();
  }

  /** Ends the recording and files it. Safe to call twice. Returns the finished recording, or null if none was running. */
  async stop(): Promise<RecMeta | null> {
    if (!this.active) return null;
    this.active = false;
    const rec = this.cur;
    if (rec && rec.state !== "inactive") {
      const ended = new Promise<void>((res) => (this.partEnded = res));
      try {
        rec.stop();
        await Promise.race([ended, new Promise<void>((res) => setTimeout(res, 3000))]);
      } catch {
        /* already stopped */
      }
    }
    this.partEnded = null;
    this.cur = null;
    this.curStream = null;
    await this.chain.catch(() => {});
    const endedAt = this.deps.now();
    await this.store
      .update(this.id, { endedAt, bytes: this.bytes, parts: this.parts })
      .catch(() => {});
    this.emit();
    return {
      id: this.id,
      name: this.name,
      startedAt: this.startedAt,
      endedAt,
      mime: this.mime,
      parts: this.parts,
      bytes: this.bytes,
    };
  }
}

// ------------------------------------------------------------------------------------------------- save / share

type Nav = Pick<Navigator, "share" | "canShare">;

/**
 * Gets a recording off the phone: the share sheet where there is one (WhatsApp, Drive, AirDrop ...), a download otherwise.
 * Returns what happened. All parts go together.
 */
export async function saveRecording(
  store: RecStore,
  meta: RecMeta,
  nav: Partial<Nav> = typeof navigator === "undefined" ? {} : navigator,
): Promise<"shared" | "cancelled" | "downloaded"> {
  const files: File[] = [];
  for (let p = 0; p < Math.max(1, meta.parts); p++) {
    const blob = await store.read(meta.id, p);
    if (blob.size > 0)
      files.push(new File([blob], fileName(meta, p), { type: meta.mime || blob.type }));
  }
  if (files.length === 0) throw new Error("Nothing was recorded.");
  if (nav.canShare?.({ files }) && nav.share) {
    try {
      await nav.share({ files, title: meta.name });
      return "shared";
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return "cancelled"; // the reporter closed the share sheet
      /* the share sheet failed: fall through to a download */
    }
  }
  for (const f of files) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  }
  return "downloaded";
}

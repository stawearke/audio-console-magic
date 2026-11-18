import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  extOf,
  fileName,
  FieldRecorder,
  formatBytes,
  formatDuration,
  LOW_SPACE_BYTES,
  memoryStore,
  pickMime,
  saveRecording,
  type RecStatus,
  type RecStore,
} from "@/lib/mk/field-record";

/** A pretend MediaRecorder the test drives by hand. */
class FakeRec {
  static all: FakeRec[] = [];
  static supported = new Set<string>(["video/webm"]);
  static isTypeSupported(t: string) {
    return FakeRec.supported.has(t);
  }
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    public stream: unknown,
    public opts: {
      mimeType?: string;
      videoBitsPerSecond?: number;
      audioBitsPerSecond?: number;
    } = {},
  ) {
    FakeRec.all.push(this);
  }
  start() {
    this.state = "recording";
  }
  /** One second of video arrives. */
  emit(bytes: number) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) });
  }
  /** We asked it to stop: the last piece, then "stop". */
  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.emit(5);
    this.onstop?.();
  }
  /** The camera was switched: its tracks ended, so it stops by itself. */
  endByTracks() {
    this.state = "inactive";
    this.emit(7);
    this.onstop?.();
  }
}

let t = 1_000_000;
let free: number | null = null;
let store: RecStore;
const stream = () => ({ id: Math.random() }) as unknown as MediaStream;
const make = (over: Partial<ConstructorParameters<typeof FieldRecorder>[1]> = {}) =>
  new FieldRecorder(store, {
    Recorder: FakeRec as never,
    now: () => t,
    newId: () => "rec1",
    freeBytes: async () => free,
    ...over,
  });
const flush = () => new Promise((r) => setTimeout(r, 0));
const sizeOf = async (part: number) => (await store.read("rec1", part)).size;

beforeEach(() => {
  FakeRec.all = [];
  FakeRec.supported = new Set(["video/webm"]);
  t = 1_000_000;
  free = null;
  store = memoryStore();
});

describe("file helpers", () => {
  it("picks the best format the phone can make", () => {
    expect(pickMime(() => true)).toMatch(/^video\/mp4;codecs/);
    expect(pickMime((m) => m.startsWith("video/webm"))).toBe("video/webm;codecs=vp9,opus");
    expect(pickMime((m) => m === "video/webm")).toBe("video/webm");
    expect(pickMime(() => false)).toBe("");
    expect(extOf("video/mp4;codecs=avc1")).toBe("mp4");
    expect(extOf("video/webm")).toBe("webm");
    expect(extOf("")).toBe("webm");
  });
  it("writes sizes and times for people", () => {
    expect(formatBytes(512)).toBe("1 KB");
    expect(formatBytes(48_000_000)).toBe("48 MB");
    expect(formatBytes(2_700_000_000)).toBe("2.7 GB");
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
    expect(formatDuration(-5)).toBe("0:00");
  });
  it("names files so they sort and say what they are", () => {
    const base = {
      name: "FIELD 1 Ryan (Kisumu)",
      startedAt: new Date(2026, 10, 18, 14, 32).getTime(),
      mime: "video/mp4",
    };
    expect(fileName({ ...base, parts: 1 }, 0)).toBe("FIELD-1-Ryan-Kisumu_2026-11-18_1432.mp4");
    expect(fileName({ ...base, parts: 3 }, 1)).toBe(
      "FIELD-1-Ryan-Kisumu_2026-11-18_1432_part2.mp4",
    );
    expect(fileName({ ...base, name: "###", mime: "video/webm", parts: 1 }, 0)).toBe(
      "field_2026-11-18_1432.webm",
    );
  });
});

describe("recording", () => {
  it("records at the director's top bitrate and says what it is doing", async () => {
    FakeRec.supported = new Set(["video/mp4"]);
    const seen: RecStatus[] = [];
    const r = make();
    r.onChange = (s) => seen.push(s);
    expect(await r.start(stream(), { name: "FIELD 1 Ryan", kbps: 8000 })).toBe(true);
    expect(FakeRec.all).toHaveLength(1);
    expect(FakeRec.all[0]!.opts).toMatchObject({
      mimeType: "video/mp4",
      videoBitsPerSecond: 8_000_000,
    });
    expect(r.status).toMatchObject({ on: true, parts: 1, bytes: 0, error: "" });
    FakeRec.all[0]!.emit(1000);
    t += 1000;
    expect(r.status).toMatchObject({ bytes: 1000, ms: 1000 });
    expect(seen.at(-1)).toMatchObject({ on: true, bytes: 1000 });
  });

  it("keeps the pieces in order and files the finished recording", async () => {
    const r = make();
    await r.start(stream(), { name: "FIELD 1 Ryan", kbps: 4000 });
    for (const n of [100, 200, 300]) FakeRec.all[0]!.emit(n);
    t += 30_000;
    const meta = await r.stop();
    expect(meta).toMatchObject({
      id: "rec1",
      name: "FIELD 1 Ryan",
      parts: 1,
      bytes: 605,
      endedAt: t,
    });
    expect(r.status.on).toBe(false);
    const [saved] = await store.list();
    expect(saved).toMatchObject({
      id: "rec1",
      name: "FIELD 1 Ryan",
      endedAt: t,
      parts: 1,
      bytes: 605,
    });
    expect(await sizeOf(0)).toBe(605); // 100 + 200 + 300 + the last piece when it was stopped
  });

  it("stopping twice is harmless, and starting twice does not start a second recording", async () => {
    const r = make();
    const s = stream();
    await r.start(s, { name: "x", kbps: 1 });
    expect(await r.start(s, { name: "x", kbps: 1 })).toBe(true);
    expect(FakeRec.all).toHaveLength(1);
    expect(await r.stop()).not.toBeNull();
    expect(await r.stop()).toBeNull();
  });

  it("saves progress as it goes, so a cut-short recording still lists what it has", async () => {
    const r = make();
    await r.start(stream(), { name: "x", kbps: 1 });
    for (let i = 0; i < 10; i++) FakeRec.all[0]!.emit(100);
    await flush();
    const [m] = await store.list();
    expect(m).toMatchObject({ bytes: 1000, parts: 1 });
    expect(m!.endedAt).toBeUndefined(); // never stopped: closed tab / flat battery
  });
});

describe("resuming after a refresh", () => {
  const opts = { name: "FIELD 1", kbps: 8000 };

  it("carries on in the same recording, as a new part", async () => {
    const a = make();
    await a.start(stream(), opts);
    FakeRec.all[0]!.emit(100);
    await flush();
    // The page is refreshed: no stop, no goodbye. A new page, a new recorder.
    t += 20_000;
    const b = make({ newId: () => "other" });
    await b.start(stream(), { ...opts, resume: "rec1" });
    FakeRec.all[1]!.emit(50);
    await flush();
    expect(b.recordingId).toBe("rec1");
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "rec1", startedAt: 1_000_000, parts: 2 });
    expect(list[0]!.endedAt).toBeUndefined();
    expect(await sizeOf(0)).toBe(100);
    expect(await sizeOf(1)).toBe(50);
    await b.stop();
    expect((await store.list())[0]!.endedAt).toBe(t);
  });

  it("never writes over a part that is already there, even if the saved count is behind", async () => {
    const a = make();
    await a.start(stream(), opts);
    FakeRec.all[0]!.emit(100);
    await flush();
    await store.update("rec1", { parts: 0 }); // the count was not saved yet when the page went
    const b = make();
    await b.start(stream(), { ...opts, resume: "rec1" });
    FakeRec.all[1]!.emit(50);
    await flush();
    expect(await sizeOf(0)).toBe(100);
    expect(await sizeOf(1)).toBe(50);
  });

  it("opens a recording that had been finished again", async () => {
    const a = make();
    await a.start(stream(), opts);
    await a.stop();
    expect((await store.list())[0]!.endedAt).toBeDefined();
    const b = make();
    await b.start(stream(), { ...opts, resume: "rec1" });
    expect((await store.list())[0]!.endedAt).toBeUndefined();
  });

  it("starts a new recording when the one to resume is gone", async () => {
    const b = make({ newId: () => "fresh" });
    expect(await b.start(stream(), { ...opts, resume: "deleted" })).toBe(true);
    expect(b.recordingId).toBe("fresh");
    expect((await store.list()).map((m) => m.id)).toEqual(["fresh"]);
  });

  it("does not start twice when asked twice at once", async () => {
    const a = make();
    await Promise.all([a.start(stream(), opts), a.start(stream(), opts)]);
    expect(FakeRec.all).toHaveLength(1);
  });
});

describe("camera switches", () => {
  it("carries on in a new part when the page opens a new camera stream", async () => {
    const r = make();
    await r.start(stream(), { name: "x", kbps: 1 });
    FakeRec.all[0]!.emit(100);
    FakeRec.all[0]!.endByTracks(); // the old tracks stopped: it ends by itself, its last piece (7) is kept
    expect(r.status.on).toBe(true); // still recording: waiting for the new camera
    r.retarget(stream());
    expect(FakeRec.all).toHaveLength(2);
    expect(FakeRec.all[1]!.opts.videoBitsPerSecond).toBe(1000);
    FakeRec.all[1]!.emit(50);
    await r.stop();
    expect(r.status.parts).toBe(2);
    expect(await sizeOf(0)).toBe(107);
    expect(await sizeOf(1)).toBe(55);
    expect((await store.list())[0]).toMatchObject({ parts: 2, bytes: 162 });
  });

  it("stops the old recorder itself if the old stream is somehow still running", async () => {
    const r = make();
    await r.start(stream(), { name: "x", kbps: 1 });
    r.retarget(stream());
    expect(FakeRec.all[0]!.state).toBe("inactive");
    expect(FakeRec.all[1]!.state).toBe("recording");
    await r.stop();
  });

  it("ignores the stream it is already recording, and ignores everything when not recording", async () => {
    const r = make();
    const s = stream();
    r.retarget(s); // not recording
    expect(FakeRec.all).toHaveLength(0);
    await r.start(s, { name: "x", kbps: 1 });
    r.retarget(s);
    expect(FakeRec.all).toHaveLength(1);
    await r.stop();
    r.retarget(stream());
    expect(FakeRec.all).toHaveLength(1);
  });

  it("can be stopped while waiting for the camera to come back", async () => {
    const r = make();
    await r.start(stream(), { name: "x", kbps: 1 });
    FakeRec.all[0]!.endByTracks();
    const meta = await r.stop();
    expect(meta).toMatchObject({ parts: 1 });
  });
});

describe("when it cannot or must not record", () => {
  it("says so on a browser with no recorder", async () => {
    const r = make({ Recorder: undefined });
    expect(await r.start(stream(), { name: "x", kbps: 1 })).toBe(false);
    expect(r.status).toMatchObject({ on: false });
    expect(r.status.error).toMatch(/cannot record/);
  });
  it("says so when there is nowhere to keep it", async () => {
    store.begin = async () => {
      throw new Error("denied");
    };
    const r = make();
    expect(await r.start(stream(), { name: "x", kbps: 1 })).toBe(false);
    expect(r.status.error).toMatch(/nowhere to keep/);
    expect(FakeRec.all).toHaveLength(0);
  });
  it("says so when the recorder will not start", async () => {
    FakeRec.prototype.start = () => {
      throw new Error("no");
    };
    const r = make();
    expect(await r.start(stream(), { name: "x", kbps: 1 })).toBe(false);
    expect(r.status.error).toMatch(/could not start/);
    FakeRec.prototype.start = function (this: FakeRec) {
      this.state = "recording";
    };
  });
  it("stops, keeping what it has, when the phone's storage is full", async () => {
    const real = store.append;
    let n = 0;
    store.append = async (...a) => {
      if (++n > 2) throw new Error("QuotaExceededError");
      return real(...a);
    };
    const r = make();
    await r.start(stream(), { name: "x", kbps: 1 });
    for (let i = 0; i < 4; i++) FakeRec.all[0]!.emit(100);
    await flush();
    await flush();
    expect(r.status.on).toBe(false);
    expect(r.status.error).toMatch(/storage is full/);
    expect((await store.list())[0]!.endedAt).toBeDefined();
    expect(await sizeOf(0)).toBe(200); // the first two pieces are safe
  });
  it("stops before the phone runs out of space, so the show is never squeezed", async () => {
    free = LOW_SPACE_BYTES - 1;
    const r = make();
    await r.start(stream(), { name: "x", kbps: 1 });
    for (let i = 0; i < 15; i++) FakeRec.all[0]!.emit(10);
    await flush();
    await flush();
    expect(r.status.on).toBe(false);
    expect(r.status.error).toMatch(/almost out of space/);
  });
  it("keeps going when the browser will not say how much space is left", async () => {
    free = null;
    const r = make();
    await r.start(stream(), { name: "x", kbps: 1 });
    for (let i = 0; i < 30; i++) FakeRec.all[0]!.emit(10);
    await flush();
    expect(r.status.on).toBe(true);
    await r.stop();
  });
  it("stops when the recorder itself reports an error", async () => {
    const r = make();
    await r.start(stream(), { name: "x", kbps: 1 });
    FakeRec.all[0]!.onerror?.();
    await flush();
    expect(r.status.on).toBe(false);
    expect(r.status.error).toMatch(/hit an error/);
  });
  it("forgets the old reason when a new recording starts", async () => {
    const r = make({ Recorder: undefined });
    await r.start(stream(), { name: "x", kbps: 1 });
    expect(r.status.error).not.toBe("");
    const ok = make();
    await ok.start(stream(), { name: "x", kbps: 1 });
    expect(ok.status.error).toBe("");
  });
});

describe("saving and sharing", () => {
  const meta = {
    id: "rec1",
    name: "FIELD 1 Ryan",
    startedAt: new Date(2026, 10, 18, 14, 32).getTime(),
    endedAt: 1,
    mime: "video/mp4",
    parts: 2,
    bytes: 6,
  };
  beforeEach(async () => {
    await store.begin(meta);
    await store.append("rec1", 0, 0, new Blob(["abc"]));
    await store.append("rec1", 1, 0, new Blob(["def"]));
  });
  afterEach(() => vi.restoreAllMocks());

  it("shares every part together through the phone's share sheet", async () => {
    const share = vi.fn(async (_d: ShareData) => {});
    const r = await saveRecording(store, meta, { canShare: () => true, share });
    expect(r).toBe("shared");
    const arg = share.mock.calls[0]![0] as unknown as { files: File[]; title: string };
    expect(arg.files.map((f) => f.name)).toEqual([
      "FIELD-1-Ryan_2026-11-18_1432_part1.mp4",
      "FIELD-1-Ryan_2026-11-18_1432_part2.mp4",
    ]);
    expect(arg.files.map((f) => f.size)).toEqual([3, 3]);
    expect(arg.title).toBe("FIELD 1 Ryan");
  });
  it("does not download after the reporter closes the share sheet", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const share = vi.fn(async () => {
      throw Object.assign(new Error("closed"), { name: "AbortError" });
    });
    expect(await saveRecording(store, meta, { canShare: () => true, share })).toBe("cancelled");
    expect(click).not.toHaveBeenCalled();
  });
  it("downloads each part when there is no share sheet, or it fails", async () => {
    const names: string[] = [];
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    expect(await saveRecording(store, meta, {})).toBe("downloaded");
    expect(names).toHaveLength(2);
    names.length = 0;
    const share = vi.fn(async () => {
      throw new Error("sheet failed");
    });
    expect(await saveRecording(store, meta, { canShare: () => true, share })).toBe("downloaded");
    expect(names).toHaveLength(2);
  });
  it("says so when there is nothing to save", async () => {
    await expect(saveRecording(store, { ...meta, id: "nope" }, {})).rejects.toThrow(
      /Nothing was recorded/,
    );
  });
});

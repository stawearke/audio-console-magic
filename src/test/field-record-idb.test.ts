import { Blob as NodeBlob } from "node:buffer";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { idbStore, type RecMeta } from "@/lib/mk/field-record";

/**
 * The real phone store, run against an in-memory IndexedDB.
 * Needs the `fake-indexeddb` dev dependency (`npm i -D fake-indexeddb`); without it these are skipped, not failed.
 */
// A name held in a variable, so neither TypeScript nor Vite looks for the package until the test actually runs.
const load = (name: string): Promise<unknown> => import(/* @vite-ignore */ name);
const fake = await load("fake-indexeddb/auto")
  .then(() => load("fake-indexeddb"))
  .catch(() => null);

const meta = (o: Partial<RecMeta> = {}): RecMeta => ({
  id: "a",
  name: "FIELD 1",
  startedAt: 1000,
  mime: "video/webm",
  parts: 0,
  bytes: 0,
  ...o,
});
const text = (b: Blob) => b.text();
const fresh = () =>
  idbStore(new (fake as unknown as { IDBFactory: new () => IDBFactory }).IDBFactory())!;

describe.skipIf(!fake)("phone storage (IndexedDB)", () => {
  // jsdom's pretend Blob cannot be stored by the test database (a real browser keeps real Blobs), so use Node's real one here.
  beforeAll(() => void vi.stubGlobal("Blob", NodeBlob));
  afterAll(() => void vi.unstubAllGlobals());

  it("is not available where the browser has no IndexedDB", () => {
    expect(idbStore(null as unknown as undefined)).toBeNull();
  });

  it("lists recordings newest first", async () => {
    const s = fresh();
    await s.begin(meta({ id: "old", startedAt: 1 }));
    await s.begin(meta({ id: "new", startedAt: 9 }));
    expect((await s.list()).map((m) => m.id)).toEqual(["new", "old"]);
  });

  it("puts a part back together in the order it was recorded, even past ten pieces", async () => {
    const s = fresh();
    await s.begin(meta());
    // Written out of order on purpose: pieces 0..11 must read back 0,1,2 ... 10,11 (numbers, not text order).
    for (const i of [5, 11, 0, 2, 10, 1, 3, 4, 6, 7, 8, 9])
      await s.append("a", 0, i, new Blob([`<${i}>`]));
    const blob = await s.read("a", 0);
    expect(await text(blob)).toBe(Array.from({ length: 12 }, (_, i) => `<${i}>`).join(""));
    expect(blob.type).toBe("video/webm");
  });

  it("keeps parts, and recordings, apart", async () => {
    const s = fresh();
    await s.begin(meta({ id: "a" }));
    await s.begin(meta({ id: "ab" })); // an id that starts like another one
    await s.append("a", 0, 0, new Blob(["a0"]));
    await s.append("a", 1, 0, new Blob(["a1"]));
    await s.append("ab", 0, 0, new Blob(["ab0"]));
    expect(await text(await s.read("a", 0))).toBe("a0");
    expect(await text(await s.read("a", 1))).toBe("a1");
    expect(await text(await s.read("ab", 0))).toBe("ab0");
  });

  it("updates what it knows about a recording, and ignores one it does not have", async () => {
    const s = fresh();
    await s.begin(meta());
    await s.update("a", { bytes: 500, parts: 2, endedAt: 7 });
    await s.update("missing", { bytes: 1 });
    const list = await s.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "a", name: "FIELD 1", bytes: 500, parts: 2, endedAt: 7 });
  });

  it("deletes a recording and all its pieces, and only that one", async () => {
    const s = fresh();
    await s.begin(meta({ id: "a" }));
    await s.begin(meta({ id: "ab" }));
    await s.append("a", 0, 0, new Blob(["x"]));
    await s.append("a", 1, 0, new Blob(["y"]));
    await s.append("ab", 0, 0, new Blob(["keep"]));
    await s.remove("a");
    expect((await s.list()).map((m) => m.id)).toEqual(["ab"]);
    expect((await s.read("a", 0)).size).toBe(0);
    expect((await s.read("a", 1)).size).toBe(0);
    expect(await text(await s.read("ab", 0))).toBe("keep");
  });

  it("reads nothing, without failing, for a recording that does not exist", async () => {
    const s = fresh();
    expect((await s.read("nope", 0)).size).toBe(0);
  });
});

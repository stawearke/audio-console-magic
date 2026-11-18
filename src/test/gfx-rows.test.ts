import { beforeEach, describe, expect, it } from "vitest";

import { gfxLibrary } from "@/lib/mk/gfx-library";
import { applyRow, defaultsOf, fieldsOf, parseRows, rowStore } from "@/lib/mk/gfx-rows";
import { getTemplate, itemLayer, makeItem, TEMPLATES } from "@/lib/mk/gfx-rundown";
import { GFX_THEMES } from "@/lib/mk/gfx-themes";
import { makeEl } from "@/lib/mk/custom-gfx";
import { DEFAULT_GRAPHICS } from "@/lib/mk/types";

const els = [
  makeEl("rect", { name: "Bar" }),
  makeEl("text", { field: "Title", text: "Show A" }),
  makeEl("text", { field: "Tag", text: "LIVE" }),
  makeEl("image", { field: "Logo" }),
];

describe("design rows", () => {
  beforeEach(() => window.localStorage.clear());

  it("finds text fields only and their defaults", () => {
    expect(fieldsOf(els)).toEqual(["Title", "Tag"]);
    expect(defaultsOf(els)).toEqual({ Title: "Show A", Tag: "LIVE" });
  });

  it("writes row values into matching text elements and leaves the rest", () => {
    const out = applyRow(els, { Title: "Show B" });
    expect(out.find((e) => e.field === "Title")!.text).toBe("Show B");
    expect(out.find((e) => e.field === "Tag")!.text).toBe("LIVE");
    expect(out.length).toBe(els.length);
  });

  it("parses pasted rows with and without a header", () => {
    const f = ["Title", "Tag"];
    expect(parseRows("Show A\tLIVE\nShow B\tREPLAY", f).map((r) => r.values)).toEqual([
      { Title: "Show A", Tag: "LIVE" },
      { Title: "Show B", Tag: "REPLAY" },
    ]);
    const withHead = parseRows("Tag,Title\nREPLAY,Show C", f);
    expect(withHead).toHaveLength(1);
    expect(withHead[0]!.values).toEqual({ Tag: "REPLAY", Title: "Show C" });
  });

  it("stores rows per design and drops them with the design", () => {
    rowStore.add("d1", "A", { Title: "A" });
    rowStore.add("d1", "B", { Title: "B" });
    expect(rowStore.rows("d1").map((r) => r.name)).toEqual(["A", "B"]);
    const id = rowStore.rows("d1")[1]!.id;
    rowStore.move("d1", id, -1);
    expect(rowStore.rows("d1").map((r) => r.name)).toEqual(["B", "A"]);
    rowStore.dropDesign("d1");
    expect(rowStore.rows("d1")).toEqual([]);
  });

  it("a saved Custom design is a rundown template that fills its fields from the item", () => {
    const d = gfxLibrary.save("Show strap", "custom", { elements: els });
    const tid = `custom:${d.id}`;
    const t = getTemplate(tid);
    expect(t?.layer).toBe("custom");
    expect(t?.fields.map((f) => f.key)).toEqual(["Title", "Tag"]);
    expect(TEMPLATES.some((x) => x.id === tid)).toBe(false);

    const item = makeItem(tid, "i1", { Title: "Show B" }, "Show B");
    const r = itemLayer(item, GFX_THEMES[0]!, DEFAULT_GRAPHICS)!;
    expect(r.layer).toBe("custom");
    expect(Object.keys(r.patch)).toEqual(["elements"]);
    const out = r.patch["elements"] as typeof els;
    expect(out.find((e) => e.field === "Title")!.text).toBe("Show B");
    expect(out.find((e) => e.field === "Tag")!.text).toBe("LIVE");
  });

  it("editing the design's look changes every item built from it, words stay per item", () => {
    const d = gfxLibrary.save("Strap 2", "custom", { elements: els });
    const item = makeItem(`custom:${d.id}`, "i2", { Title: "Show B" });
    gfxLibrary.update(d.id, { elements: els.map((e) => (e.name === "Bar" ? { ...e, fill: "#00ff00" } : e)) });
    const out = itemLayer(item, GFX_THEMES[0]!, DEFAULT_GRAPHICS)!.patch["elements"] as typeof els;
    expect(out.find((e) => e.name === "Bar")!.fill).toBe("#00ff00");
    expect(out.find((e) => e.field === "Title")!.text).toBe("Show B");
  });
});

import { splitRemote } from "@/lib/mk/gfx-sync";
import { packageStore } from "@/lib/mk/gfx-packages";

describe("cloud merge", () => {
  beforeEach(() => window.localStorage.clear());

  it("splits cloud rows by kind", () => {
    const s = splitRemote([
      { kind: "design", id: "a", data: { x: 1 } },
      { kind: "package", id: "b", data: { y: 1 } },
      { kind: "rows", id: "a", data: { rows: [], updated: 5 } },
    ]);
    expect(s.designs).toHaveLength(1);
    expect(s.packages).toHaveLength(1);
    expect(s.rowSets).toEqual([{ id: "a", rows: [], updated: 5 }]);
  });

  it("newer copy wins, unknown items are added, local-only items stay", () => {
    const mine = gfxLibrary.save("Mine", "custom", { elements: els });
    const before = gfxLibrary.getSnapshot().find((d) => d.id === mine.id)!;
    gfxLibrary.mergeRemote([
      { ...before, name: "Older", created: before.created - 1000 },
      { id: "remote1", name: "From cloud", layer: "custom", data: { elements: els }, created: Date.now() },
    ]);
    const names = gfxLibrary.getSnapshot().map((d) => d.name);
    expect(names).toContain("Mine");
    expect(names).toContain("From cloud");
    expect(names).not.toContain("Older");
    gfxLibrary.mergeRemote([{ ...before, name: "Newer", created: before.created + 1000 }]);
    expect(gfxLibrary.getSnapshot().find((d) => d.id === mine.id)!.name).toBe("Newer");
  });

  it("rows merge per design by stamp, packages by updated", () => {
    rowStore.add("d9", "Local", { Title: "L" });
    rowStore.mergeRemote([{ id: "d9", rows: [{ id: "r", name: "Old", values: {} }], updated: 1 }]);
    expect(rowStore.rows("d9")[0]!.name).toBe("Local");
    rowStore.mergeRemote([{ id: "d9", rows: [{ id: "r", name: "Cloud", values: {} }], updated: Date.now() + 5000 }]);
    expect(rowStore.rows("d9")[0]!.name).toBe("Cloud");
    packageStore.mergeRemote([{ id: "my-x", name: "Pack", items: [{ templateId: "clock", name: "Clock" }], updated: 10 }]);
    expect(packageStore.get("my-x")?.name).toBe("Pack");
  });
});

import { layerUrl, gfxName } from "@/lib/mk/graphics";
import { isCustomLayer } from "@/lib/mk/types";

describe("multi custom layers", () => {
  it("has four independent custom layers with their own OBS sources", () => {
    expect(["custom", "custom2", "custom3", "custom4"].every(isCustomLayer)).toBe(true);
    expect(isCustomLayer("lower")).toBe(false);
    expect(new Set(["custom", "custom2", "custom3", "custom4"].map((i) => gfxName(i as never))).size).toBe(4);
  });

  it("each layer renders only its own elements", () => {
    const g = {
      ...DEFAULT_GRAPHICS,
      custom: { elements: [makeEl("text", { text: "ONE-STRAP" })] },
      custom2: { elements: [makeEl("text", { text: "TWO-BADGE" })] },
    };
    expect(decodeURIComponent(layerUrl("custom", g))).toContain("ONE-STRAP");
    expect(decodeURIComponent(layerUrl("custom", g))).not.toContain("TWO-BADGE");
    expect(decodeURIComponent(layerUrl("custom2", g))).toContain("TWO-BADGE");
    expect(decodeURIComponent(layerUrl("custom2", g))).not.toContain("ONE-STRAP");
  });

  it("a design saved on Custom 2 queues in the rundown on Custom 2", () => {
    const d = gfxLibrary.save("Badge", "custom2", { elements: els });
    const t = getTemplate(`custom:${d.id}`);
    expect(t?.layer).toBe("custom2");
    const r = itemLayer(makeItem(`custom:${d.id}`, "x", { Title: "Z" }), GFX_THEMES[0]!, DEFAULT_GRAPHICS)!;
    expect(r.layer).toBe("custom2");
  });
});

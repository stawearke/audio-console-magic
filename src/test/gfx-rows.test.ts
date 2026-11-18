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

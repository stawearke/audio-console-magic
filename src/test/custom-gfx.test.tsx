import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { useCustomHistory } from "@/components/mk/custom-gfx-editor";
import { alignEls, cleanCustomEls, copyEls, distributeEls, makeEl, pasteEls, withGroups } from "@/lib/mk/custom-gfx";
import type { CustomEl } from "@/lib/mk/types";

const box = (id: string, x: number, y: number, w = 100, h = 100, over: Partial<CustomEl> = {}) => makeEl("rect", { id, x, y, w, h, ...over });

function useDesign(start: CustomEl[]) {
  const [els, set] = useState(start);
  return { els, set, ...useCustomHistory(els, set) };
}

describe("custom graphic history", () => {
  it("undoes and redoes, merging quick edits and keeping adds separate", () => {
    const { result } = renderHook(() => useDesign([box("a", 0, 0)]));
    act(() => result.current.change([{ ...result.current.els[0]!, x: 10 }]));
    act(() => result.current.change([{ ...result.current.els[0]!, x: 20 }])); // within 600 ms: same step
    expect(result.current.els[0]!.x).toBe(20);
    act(() => result.current.change([...result.current.els, box("b", 5, 5)])); // add = its own step
    expect(result.current.els).toHaveLength(2);
    act(() => result.current.undo());
    expect(result.current.els).toHaveLength(1);
    expect(result.current.els[0]!.x).toBe(20);
    act(() => result.current.undo());
    expect(result.current.els[0]!.x).toBe(0);
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.redo());
    expect(result.current.els[0]!.x).toBe(20);
    expect(result.current.canRedo).toBe(true);
  });

  it("starts fresh when the design is replaced from outside (library load, template)", () => {
    const { result } = renderHook(() => useDesign([box("a", 0, 0)]));
    act(() => result.current.change([box("a", 50, 0)]));
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.set([box("z", 1, 1)]));
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.undo());
    expect(result.current.els[0]!.id).toBe("z");
  });
});

describe("align, distribute, groups, clipboard", () => {
  it("aligns one element to the canvas and several to each other", () => {
    const one = alignEls([box("a", 10, 10, 200, 100)], ["a"], "hcenter");
    expect(one[0]!.x).toBe(860);
    const many = alignEls([box("a", 100, 0), box("b", 500, 50, 200, 100)], ["a", "b"], "right");
    expect(many.map((e) => e.x + e.w)).toEqual([700, 700]);
  });

  it("spaces three elements evenly and leaves locked ones alone", () => {
    const out = distributeEls([box("a", 0, 0), box("b", 150, 0), box("c", 700, 0)], ["a", "b", "c"], "h");
    expect(out.map((e) => e.x)).toEqual([0, 350, 700]);
    const locked = alignEls([box("a", 0, 0, 100, 100, { locked: true }), box("b", 300, 0)], ["a", "b"], "left");
    expect(locked[0]!.x).toBe(0);
  });

  it("selects a whole group", () => {
    const all = [box("a", 0, 0, 10, 10, { group: "g1" }), box("b", 0, 0, 10, 10, { group: "g1" }), box("c", 0, 0)];
    expect(withGroups(all, ["a"]).sort()).toEqual(["a", "b"]);
    expect(withGroups(all, ["c"])).toEqual(["c"]);
  });

  it("pastes copies with new ids, regrouped, offset, within the 60 limit", () => {
    const all = [box("a", 0, 0, 10, 10, { group: "g1" }), box("b", 20, 0, 10, 10, { group: "g1" })];
    expect(copyEls(all, ["a", "b"])).toBe(2);
    const r = pasteEls(all)!;
    expect(r.els).toHaveLength(4);
    const [n1, n2] = r.els.slice(2) as [CustomEl, CustomEl];
    expect(n1.id).not.toBe("a");
    expect(n1.group).toBe(n2.group);
    expect(n1.group).not.toBe("g1");
    expect(n1.x).toBe(30);
    expect(pasteEls(Array.from({ length: 59 }, (_, i) => box(`x${i}`, 0, 0)))).toBeNull();
  });

  it("keeps groups through the sanitizer", () => {
    const [e] = cleanCustomEls([{ ...box("a", 0, 0), group: "g 1!" }]);
    expect(e!.group).toBe("g1");
  });
});

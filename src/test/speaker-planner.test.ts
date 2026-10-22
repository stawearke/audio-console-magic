import { describe, expect, it } from "vitest";
import { area, balanceAt, defaultPlan, inside, levelAt, readPlan, recommend, validArea, type Speaker } from "@/lib/speaker-planner";

describe("speaker area and placement", () => {
  it("measures a user-drawn area and keeps placements in the audience polygon", () => {
    const p = defaultPlan(); p.polygon = [{ x: 1, y: 1 }, { x: 11, y: 1 }, { x: 8, y: 16 }, { x: 2, y: 16 }];
    expect(area(p.polygon)).toBe(120);
    const speakers = recommend(p, "wide", 4);
    expect(speakers).toHaveLength(4);
    expect(speakers.every(s => inside(s, p.polygon))).toBe(true);
    expect(speakers[0]?.beam).toBe(90);
    expect(speakers[2]?.delay).toBeGreaterThan(0);
  });
  it("rejects crossing floor plans", () => {
    expect(validArea([{ x: 0, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }, { x: 8, y: 0 }])).toBe(false);
  });
  it("changes placement dispersion with the selected speaker type", () => {
    expect(recommend(defaultPlan(), "narrow", 2)[0]?.beam).toBe(60);
    expect(recommend(defaultPlan(), "column", 2)[0]?.beam).toBe(120);
  });
});
describe("sound balancing estimates", () => {
  const s: Speaker = { id: "s", name: "Main", x: 0, y: 0, aim: 0, kind: "sub", beam: 360, reach: 15, gain: 0, delay: 0 };
  it("models six decibels of loss per doubling of distance", () => {
    expect(levelAt(s, { x: 0, y: 2 }, 90, 1.2) - levelAt(s, { x: 0, y: 4 }, 90, 1.2)).toBeCloseTo(6.0206, 3);
  });
  it("aligns arrival time and trims closer speakers at the chosen balance point", () => {
    const p = { ...defaultPlan(), height: 1.2, speakers: [s, { ...s, id: "fill", y: 6 }] };
    const [main, fill] = balanceAt(p, { x: 0, y: 10 });
    expect(main?.gain).toBe(0); expect(main?.delay).toBe(0);
    expect(fill?.gain).toBeCloseTo(-8, 1); expect(fill?.delay).toBeCloseTo(17.5, 1);
  });
  it("round-trips a file plan and rejects invalid speaker data", () => {
    const p = { ...defaultPlan(), speakers: recommend(defaultPlan(), "wide", 2) };
    expect(readPlan(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(() => readPlan({ ...p, speakers: [{ ...p.speakers[0], delay: -1 }] })).toThrow();
  });
});
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => { HTMLCanvasElement.prototype.getContext = (() => null) as never; });
import { eqCurve } from "@/lib/dsp-math";
import { OBS_EQ_NODES, gainFromY, nearestNode, obsEqCurve } from "@/lib/obs-eq";
import { FLAT_EQ } from "@/lib/mk/types";
import { ObsEqGraph } from "@/components/console/ObsEqGraph";

const at = (eq: { lo: number; mid: number; hi: number }, f: number) => eqCurve(obsEqCurve(eq), [f])[0]!;

describe("OBS 3-band EQ curve", () => {
  it("is flat when every gain is 0", () => {
    for (const f of [60, 300, 2000, 8000, 12000]) expect(Math.abs(at({ lo: 0, mid: 0, hi: 0 }, f))).toBeLessThan(0.05);
  });
  it("low lifts the bottom and leaves the top alone", () => {
    expect(at({ lo: 6, mid: 0, hi: 0 }, 100)).toBeGreaterThan(5.5);
    expect(at({ lo: 6, mid: 0, hi: 0 }, 8000)).toBeLessThan(0.3);
  });
  it("mid peaks in the middle", () => {
    expect(at({ lo: 0, mid: 6, hi: 0 }, 2000)).toBeGreaterThan(5.5);
    expect(at({ lo: 0, mid: 6, hi: 0 }, 60)).toBeLessThan(0.5);
  });
  it("high lifts the top and leaves the bottom alone", () => {
    expect(at({ lo: 0, mid: 0, hi: 6 }, 12000)).toBeGreaterThan(5.5);
    expect(at({ lo: 0, mid: 0, hi: 6 }, 100)).toBeLessThan(0.3);
  });
  it("cuts go below the line", () => {
    expect(at({ lo: -9, mid: 0, hi: 0 }, 100)).toBeLessThan(-8);
  });
});

describe("EQ graph dragging maths", () => {
  it("turns height into gain: top = +, bottom = -, middle = 0", () => {
    expect(gainFromY(50, 100, "mid")).toBe(0);
    expect(gainFromY(25, 100, "mid")).toBe(9); // halfway up the 18 dB span
    expect(gainFromY(75, 100, "mid")).toBe(-9);
  });
  it("never goes outside what the OBS filter accepts", () => {
    expect(gainFromY(-500, 100, "lo")).toBe(15);
    expect(gainFromY(900, 100, "hi")).toBe(-15);
  });
  it("rounds to half a dB and never returns -0", () => {
    expect(gainFromY(49.3, 100, "mid")).toBe(0.5);
    expect(Object.is(gainFromY(50.1, 100, "mid"), -0)).toBe(false);
  });
  it("ignores a graph with no size", () => {
    expect(gainFromY(10, 0, "lo")).toBe(0);
    expect(nearestNode(10, 0)).toBe(0);
  });
  it("picks the point nearest along the frequency axis", () => {
    const fx = (f: number) => (Math.log10(f / 20) / 3) * 300;
    expect(nearestNode(fx(OBS_EQ_NODES[0]!.f), 300)).toBe(0);
    expect(nearestNode(fx(OBS_EQ_NODES[1]!.f) + 3, 300)).toBe(1);
    expect(nearestNode(fx(OBS_EQ_NODES[2]!.f), 300)).toBe(2);
    expect(nearestNode(0, 300)).toBe(0);
    expect(nearestNode(300, 300)).toBe(2);
  });
});

// jsdom has no PointerEvent and drops coordinates from pointer events, so send mouse events named like pointer events.
const ptr = (el: Element, type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number) => {
  const ev = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(ev, "pointerId", { value: 1 });
  fireEvent(el, ev);
};

describe("EQ graph component", () => {
  afterEach(cleanup);
  const setup = () => {
    const onChange = vi.fn();
    render(<ObsEqGraph eq={FLAT_EQ} onChange={onChange} />);
    const cv = screen.getByLabelText(/EQ graph/) as HTMLCanvasElement;
    cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 100, right: 300, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    return { cv, onChange };
  };

  it("dragging the M point up raises the mid gain, and only the mid gain", () => {
    const { cv, onChange } = setup();
    const midX = (Math.log10(2000 / 20) / 3) * 300;
    ptr(cv, "pointerdown", midX, 50);
    ptr(cv, "pointermove", midX, 25);
    expect(onChange).toHaveBeenLastCalledWith({ mid: 9 });
    for (const call of onChange.mock.calls) expect(Object.keys(call[0])).toEqual(["mid"]);
  });

  it("stops changing the EQ after release", () => {
    const { cv, onChange } = setup();
    const loX = (Math.log10(300 / 20) / 3) * 300;
    ptr(cv, "pointerdown", loX, 50);
    expect(onChange).toHaveBeenLastCalledWith({ lo: 0 });
    ptr(cv, "pointerup", loX, 50);
    onChange.mockClear();
    ptr(cv, "pointermove", loX, 10);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("is view-only without a change handler", () => {
    render(<ObsEqGraph eq={FLAT_EQ} />);
    const cv = screen.getAllByLabelText(/EQ graph/).at(-1)!;
    expect(() => ptr(cv, "pointerdown", 10, 10)).not.toThrow();
    // A press with no usable position (as jsdom itself sends) must not crash either.
    expect(() => fireEvent.pointerDown(cv)).not.toThrow();
  });
});

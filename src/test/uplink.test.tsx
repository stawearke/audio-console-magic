import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReporterSignal, SignalBars, SignalChip, UplinkLine } from "@/components/mk/uplink";
import { DEFAULT_FIELD_ORIENT, type FieldState } from "@/lib/mk/field-link";
import { autoNote, formatNet, type FieldNet } from "@/lib/mk/field-health";

const net = (o: Partial<FieldNet> = {}): FieldNet => ({
  kbps: 7800,
  rtt: 90,
  loss: 0.012,
  cap: 8000,
  ...o,
});
const filled = () => document.querySelectorAll('[data-on="true"]').length;

// The unit card reads a live viewer; here the viewer is pretend and says what the test needs.
let viewerState: Partial<FieldState> = {};
vi.mock("@/lib/mk/field-units", async (orig) => ({
  ...(await orig<typeof import("@/lib/mk/field-units")>()),
  useFieldViewer: () => ({
    state: {
      link: "live",
      quality: "1080hi",
      name: "",
      loc: "",
      orient: DEFAULT_FIELD_ORIENT,
      fps: 30,
      kbps: 8000,
      held: "",
      error: null,
      caps: null,
      ctl: {},
      battery: null,
      level: 0,
      ack: 0,
      talking: false,
      auto: true,
      net: null,
      ...viewerState,
    } satisfies FieldState,
    stream: null,
    setSetup() {},
    setQuality() {},
    setCtl() {},
    setTally() {},
    cue: () => 0,
    talk: async () => null,
  }),
}));

import { UnitsDesk } from "@/components/mk/units-desk";
import { fieldUnits } from "@/lib/mk/field-units";

describe("signal bars", () => {
  afterEach(cleanup);
  it("fill one to four bars by level, and say it in words for screen readers", () => {
    const cases: [Partial<FieldNet>, number, string][] = [
      [{}, 4, "Signal good"],
      [{ loss: 0.03 }, 3, "Signal fair"],
      [{ rtt: 400 }, 2, "Signal poor"],
      [{ loss: 0.2 }, 1, "Signal bad"],
    ];
    for (const [o, bars, label] of cases) {
      const { unmount } = render(<SignalBars net={net(o)} />);
      expect(screen.getByRole("img").getAttribute("aria-label")).toBe(label);
      expect(filled()).toBe(bars);
      unmount();
    }
  });
  it("is empty and unknown with no measurement", () => {
    render(<SignalBars net={null} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Signal unknown");
    expect(filled()).toBe(0);
  });
});

describe("wording", () => {
  it("formats the numbers", () => {
    expect(formatNet(net())).toBe("7.8 Mbps · 90 ms · 1.2 % loss");
    expect(formatNet(net({ kbps: 450, rtt: 612, loss: 0.1 }))).toBe(
      "0.5 Mbps · 612 ms · 10.0 % loss",
    );
  });
  it("says what Auto is doing", () => {
    expect(autoNote(net({ cap: 8000 }), true, 8000)).toEqual({ text: "AUTO", lowered: false });
    expect(autoNote(net({ cap: 4000 }), true, 8000)).toEqual({
      text: "AUTO · lowered to 4.0 of 8.0 Mbps",
      lowered: true,
    });
    expect(autoNote(net({ cap: 3000 }), false, 3000)).toBeNull();
  });
});

describe("unit card pieces", () => {
  afterEach(cleanup);
  it("shows nothing until live, then waits, then shows the numbers", () => {
    const { rerender } = render(<UplinkLine net={null} auto topKbps={8000} live={false} />);
    expect(screen.queryByTestId("uplink")).toBeNull();
    rerender(<UplinkLine net={null} auto topKbps={8000} live />);
    expect(screen.getByTestId("uplink").textContent).toMatch(/waiting for numbers/);
    rerender(
      <UplinkLine net={net({ loss: 0.2, cap: 4000, kbps: 3900 })} auto topKbps={8000} live />,
    );
    const t = screen.getByTestId("uplink").textContent!;
    expect(t).toContain("BAD");
    expect(t).toContain("3.9 Mbps · 90 ms · 20.0 % loss");
    expect(t).toContain("AUTO · lowered to 4.0 of 8.0 Mbps");
  });
  it("chip appears only with a measurement", () => {
    const { container, rerender } = render(<SignalChip net={null} />);
    expect(container.textContent).toBe("");
    rerender(<SignalChip net={net()} />);
    expect(container.textContent).toBe("GOOD");
  });
});

describe("reporter's phone", () => {
  afterEach(cleanup);
  it("says it is checking before the first measurement", () => {
    render(<ReporterSignal net={null} auto topKbps={8000} />);
    expect(screen.getByTestId("reporter-signal").textContent).toMatch(/Checking your signal/);
  });
  it("shows the word and numbers, and only nags when the signal is weak", () => {
    const { rerender } = render(<ReporterSignal net={net()} auto topKbps={8000} />);
    let t = screen.getByTestId("reporter-signal").textContent!;
    expect(t).toContain("GOOD");
    expect(t).toContain("7.8 Mbps · 90 ms");
    expect(t).not.toMatch(/Move to open ground/);
    rerender(<ReporterSignal net={net({ loss: 0.07 })} auto topKbps={8000} />);
    expect(screen.getByTestId("reporter-signal").textContent).toMatch(/Weak signal/);
    rerender(<ReporterSignal net={net({ loss: 0.2, cap: 2000 })} auto topKbps={8000} />);
    t = screen.getByTestId("reporter-signal").textContent!;
    expect(t).toMatch(/Very weak signal/);
    expect(t).toContain("lowered to 2.0 of 8.0 Mbps");
  });
});

describe("director's unit card", () => {
  beforeEach(() => {
    localStorage.clear();
    // The store lives in memory between tests: start with exactly one unit.
    fieldUnits.snapshot().units.forEach((u) => fieldUnits.remove(u.n));
    fieldUnits.add("Ryan", "Kisumu");
  });
  afterEach(cleanup);

  it("shows the signal chip and the uplink line for a live unit", async () => {
    viewerState = {
      link: "live",
      auto: true,
      kbps: 4000,
      net: net({ loss: 0.2, cap: 4000, kbps: 3900 }),
    };
    render(<UnitsDesk />);
    expect(screen.getByTestId("uplink").textContent).toContain("AUTO · lowered to 4.0 of 8.0 Mbps");
    expect(screen.getAllByRole("img", { name: "Signal bad" }).length).toBeGreaterThan(0);
  });

  it("says it is waiting when the phone sends no numbers yet (or is an older version)", () => {
    viewerState = { link: "live", net: null };
    render(<UnitsDesk />);
    expect(screen.getByTestId("uplink").textContent).toMatch(/waiting for numbers/);
  });

  it("shows no uplink line when the unit is on standby", () => {
    viewerState = { link: "standby", net: null };
    render(<UnitsDesk />);
    expect(screen.queryByTestId("uplink")).toBeNull();
  });
});

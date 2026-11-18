import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_FIELD_ORIENT, type FieldState } from "@/lib/mk/field-link";
import {
  AlertGate,
  ALERT_CLEAR_MS,
  ALERT_RAISE_MS,
  airAlertOf,
  airAlertText,
  alertRank,
  type FieldNet,
} from "@/lib/mk/field-health";

const net = (o: Partial<FieldNet> = {}): FieldNet => ({
  kbps: 7800,
  rtt: 60,
  loss: 0,
  cap: 8000,
  ...o,
});

// One pretend audio device for the whole file: the beep module keeps a single AudioContext for the page, like the real thing.
let made = 0;
class FakeAudio {
  currentTime = 0;
  destination = {};
  resume() {
    return Promise.resolve();
  }
  createOscillator() {
    made++;
    return { type: "", frequency: { value: 0 }, connect() {}, start() {}, stop() {} };
  }
  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() {},
    };
  }
}

// ---- the card: a pretend live viewer, and FIELD 1 put on air (or not) by the test
let viewerState: Partial<FieldState> = {};
let onAir = true;
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
      rec: false,
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
vi.mock("@/lib/mk/use-switcher", async (orig) => {
  const real = await orig<typeof import("@/lib/mk/use-switcher")>();
  return {
    ...real,
    useSwitcher: () => {
      const sw = real.useSwitcher();
      const camScenes = [...sw.config.camScenes];
      camScenes[8] = "FIELD 1"; // the unit's own camera slot
      return { ...sw, program: onAir ? 8 : null, config: { ...sw.config, camScenes } };
    },
  };
});

import { UnitsDesk } from "@/components/mk/units-desk";
import { loadAlertSound, playAlertBeep, saveAlertSound } from "@/lib/mk/air-alert";
import { fieldUnits } from "@/lib/mk/field-units";

describe("what counts as trouble on air", () => {
  it("is never trouble when the unit is not on air", () => {
    expect(airAlertOf(false, "offline", null)).toBeNull();
    expect(airAlertOf(false, "live", net({ loss: 0.3 }))).toBeNull();
  });
  it("is 'not sending' when on air but the phone is offline or not live", () => {
    for (const link of ["offline", "connecting", "standby"])
      expect(airAlertOf(true, link, null)).toBe("down");
  });
  it("grades a live signal, and says nothing for good, fair or no numbers yet", () => {
    expect(airAlertOf(true, "live", net())).toBeNull();
    expect(airAlertOf(true, "live", net({ loss: 0.03 }))).toBeNull();
    expect(airAlertOf(true, "live", null)).toBeNull();
    expect(airAlertOf(true, "live", net({ loss: 0.07 }))).toBe("poor");
    expect(airAlertOf(true, "live", net({ rtt: 700 }))).toBe("bad");
  });
  it("words it, and ranks it so a beep sounds only when things get worse", () => {
    expect(airAlertText("poor")).toBe("ON AIR · WEAK SIGNAL");
    expect(airAlertText("bad")).toMatch(/SIGNAL BAD/);
    expect(airAlertText("down")).toMatch(/NOT SENDING/);
    expect(
      alertRank(null) < alertRank("poor") &&
        alertRank("poor") < alertRank("bad") &&
        alertRank("bad") < alertRank("down"),
    ).toBe(true);
  });
});

describe("the alert gate", () => {
  it("ignores a short blip and raises only after sustained trouble", () => {
    const g = new AlertGate();
    expect(g.feed("poor", 0)).toBeNull();
    expect(g.feed("poor", ALERT_RAISE_MS.poor - 1)).toBeNull();
    expect(g.feed("poor", ALERT_RAISE_MS.poor)).toBe("poor");
    const h = new AlertGate();
    h.feed("poor", 0);
    h.feed(null, 1000); // the blip ends
    expect(h.feed("poor", 5000)).toBeNull(); // a new blip starts counting from zero
  });
  it("raises bad sooner than poor", () => {
    const g = new AlertGate();
    g.feed("bad", 0);
    expect(g.feed("bad", ALERT_RAISE_MS.bad)).toBe("bad");
    expect(ALERT_RAISE_MS.bad).toBeLessThan(ALERT_RAISE_MS.poor);
  });
  it("holds the alert through a short calm and clears only after a sustained one", () => {
    const g = new AlertGate();
    g.feed("bad", 0);
    g.feed("bad", 3000);
    expect(g.feed(null, 4000)).toBe("bad");
    expect(g.feed(null, 4000 + ALERT_CLEAR_MS - 1)).toBe("bad");
    expect(g.feed(null, 4000 + ALERT_CLEAR_MS)).toBeNull();
  });
  it("a calm blip does not clear it", () => {
    const g = new AlertGate();
    g.feed("bad", 0);
    g.feed("bad", 3000);
    g.feed(null, 4000);
    g.feed("bad", 8000); // trouble again before the calm was long enough
    expect(g.feed(null, 9000)).toBe("bad");
    expect(g.feed(null, 9000 + ALERT_CLEAR_MS - 1)).toBe("bad");
  });
  it("follows the real severity while shown", () => {
    const g = new AlertGate();
    g.feed("poor", 0);
    g.feed("poor", 4000);
    expect(g.feed("bad", 5000)).toBe("bad");
    expect(g.feed("poor", 6000)).toBe("poor");
  });
});

describe("the beep", () => {
  beforeEach(() => {
    made = 0;
  });
  it("is silent when the browser has no audio", () => {
    expect(() => playAlertBeep("bad")).not.toThrow();
  });
  it("is one tone for weak and three for bad or not sending", () => {
    window.AudioContext = FakeAudio as unknown as typeof AudioContext;
    playAlertBeep("poor");
    expect(made).toBe(1);
    playAlertBeep("bad");
    expect(made).toBe(4);
    playAlertBeep("down");
    expect(made).toBe(7);
  });
  it("remembers whether the director switched it off", () => {
    localStorage.clear();
    expect(loadAlertSound()).toBe(true);
    saveAlertSound(false);
    expect(loadAlertSound()).toBe(false);
    saveAlertSound(true);
    expect(loadAlertSound()).toBe(true);
  });
});

describe("director's unit card", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"],
    });
    localStorage.clear();
    fieldUnits.snapshot().units.forEach((u) => fieldUnits.remove(u.n));
    fieldUnits.add("Ryan", "Kisumu");
    onAir = true;
    made = 0;
    window.AudioContext = FakeAudio as unknown as typeof AudioContext;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

  it("shows a red banner and ring once an on-air unit's signal has been bad for a few seconds, and beeps once", () => {
    viewerState = { link: "live", net: net({ loss: 0.2 }) };
    const { container } = render(<UnitsDesk />);
    expect(screen.queryByRole("alert")).toBeNull(); // not yet: a blip is not worth a beep
    wait(3500);
    const banner = screen.getByRole("alert");
    expect(banner.textContent).toContain("FIELD 1 Ryan");
    expect(banner.textContent).toContain("SIGNAL BAD");
    expect(banner.getAttribute("data-alert")).toBe("bad");
    expect(container.querySelector(".ring-red-500")).not.toBeNull();
    expect(made).toBe(3);
    wait(10_000);
    expect(made).toBe(3); // no repeat while it stays bad
  });

  it("says 'not sending' when the unit on air is offline", () => {
    viewerState = { link: "offline", net: null };
    render(<UnitsDesk />);
    wait(4500);
    expect(screen.getByRole("alert").textContent).toContain("NOT SENDING");
  });

  it("stays quiet for a unit that is not on air, even with a terrible signal", () => {
    onAir = false;
    viewerState = { link: "live", net: net({ loss: 0.3 }) };
    render(<UnitsDesk />);
    wait(10_000);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(made).toBe(0);
  });

  it("shows the banner but stays silent when the beep is switched off", () => {
    viewerState = { link: "live", net: net({ loss: 0.2 }) };
    render(<UnitsDesk />);
    const toggle = screen.getByRole("button", { name: /ON-AIR ALERT BEEP: ON/ });
    act(() => toggle.click());
    expect(
      screen.getByRole("button", { name: /ON-AIR ALERT BEEP: OFF/ }).getAttribute("aria-pressed"),
    ).toBe("false");
    wait(3500);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(made).toBe(0);
  });
});

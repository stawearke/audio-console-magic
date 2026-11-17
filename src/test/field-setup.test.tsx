import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A pretend connection server: tests drive the reporter's connection by hand.
type Handler = (...a: unknown[]) => void;
const peerHandlers: Record<string, Handler> = {};
vi.mock("peerjs", () => ({
  Peer: class {
    destroyed = false;
    disconnected = false;
    open = true;
    on(ev: string, cb: Handler) {
      peerHandlers[ev] = cb;
    }
    connect() {
      return { on() {}, close() {}, open: false };
    }
    destroy() {
      this.destroyed = true;
    }
  },
}));

import { UnitsDesk } from "@/components/mk/units-desk";
import {
  captureSize,
  cleanFieldSetup,
  DEFAULT_FIELD_SETUP,
  FIELD_QUALITY,
  FieldReporter,
  fieldKbps,
} from "@/lib/mk/field-link";
import { fieldUnits, setupOf } from "@/lib/mk/field-units";

describe("field picture setup", () => {
  it("defaults to portrait, 1080p HQ, 30 fps, automatic bitrate", () => {
    expect(DEFAULT_FIELD_SETUP).toEqual({ res: "1080hi", fps: 30, orient: "portrait", kbps: 0 });
  });

  it("stands the picture up for portrait and lays it down for landscape", () => {
    expect(captureSize("1080hi", "portrait")).toEqual({ w: 1080, h: 1920 });
    expect(captureSize("1080hi", "landscape")).toEqual({ w: 1920, h: 1080 });
    expect(captureSize("2160", "portrait")).toEqual({ w: 2160, h: 3840 });
    expect(captureSize("nonsense", "landscape")).toEqual({ w: 1920, h: 1080 });
  });

  it("offers a wide range of resolutions", () => {
    expect(FIELD_QUALITY.map((q) => q.id)).toEqual(["2160", "1440", "1080hi", "1080", "720", "540", "480", "360"]);
  });

  it("scales the automatic bitrate with frame rate and obeys a forced one", () => {
    expect(fieldKbps("1080hi", 30)).toBe(8000);
    expect(fieldKbps("1080hi", 60)).toBeGreaterThan(8000);
    expect(fieldKbps("1080hi", 24)).toBeLessThan(8000);
    expect(fieldKbps("1080hi", 60, 3000)).toBe(3000);
  });

  it("keeps only valid parts of a setup that came over the network", () => {
    expect(cleanFieldSetup({ res: "720", fps: 60, orient: "landscape", kbps: 4500 })).toEqual({ res: "720", fps: 60, orient: "landscape", kbps: 4500 });
    expect(cleanFieldSetup({ res: "8K", fps: 144, orient: "sideways", kbps: -5, evil: "x" })).toEqual({});
    expect(cleanFieldSetup(null)).toEqual({});
  });

  it("turns a unit's saved choices into what the phone is told", () => {
    expect(setupOf({})).toEqual({});
    expect(setupOf({ quality: "720", fps: 25, orient: "landscape", kbps: 0 })).toEqual({ res: "720", fps: 25, orient: "landscape", kbps: 0 });
  });
});

describe("director to phone", () => {
  it("applies a setup message, ignores junk, and still understands the older quality message", async () => {
    const seen: unknown[] = [];
    const sent: unknown[] = [];
    const r = new FieldReporter(
      "room",
      1,
      () => ({ name: "Ryan", loc: "Kisumu", orient: "portrait", fps: 30, kbps: 8000, held: "portrait" }),
      () => null,
      () => {},
      (s) => seen.push(s),
      () => "1080hi",
    );
    await r.start();
    const handlers: Record<string, Handler> = {};
    const conn = { open: true, on: (ev: string, cb: Handler) => (handlers[ev] = cb), send: (m: unknown) => sent.push(m), close() {} };
    peerHandlers["connection"]!(conn);
    handlers["open"]!();
    // the director is told how the phone is set and held
    expect(sent[0]).toMatchObject({ t: "state", orient: "portrait", fps: 30, kbps: 8000, held: "portrait", quality: "1080hi" });

    handlers["data"]!({ t: "setup", orient: "landscape", res: "720", fps: 60, kbps: 4500, junk: 1 });
    handlers["data"]!({ t: "setup", orient: "sideways", fps: 144 });
    handlers["data"]!({ t: "quality", id: "480" });
    handlers["data"]!({ t: "quality", id: "9999" });
    expect(seen).toEqual([{ res: "720", fps: 60, orient: "landscape", kbps: 4500 }, { res: "480" }]);
    r.stop();
  });
});

describe("Field units page: picture controls", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("shows portrait as the default and saves the director's choices for the unit", async () => {
    render(<UnitsDesk />);
    fireEvent.change(screen.getByPlaceholderText(/^Name/), { target: { value: "Ryan" } });
    await act(async () => {
      fireEvent.click(screen.getByText("ADD"));
    });
    const portrait = screen.getByText("PORTRAIT 9:16").closest("button")!;
    const landscape = screen.getByText("LANDSCAPE 16:9").closest("button")!;
    expect(portrait.getAttribute("aria-pressed")).toBe("true");
    expect(landscape.getAttribute("aria-pressed")).toBe("false");
    // nothing is stored until the director changes something
    expect(fieldUnits.snapshot().units).toEqual([{ n: 1, name: "Ryan", loc: "" }]);

    fireEvent.click(landscape);
    expect(fieldUnits.snapshot().units[0]!.orient).toBe("landscape");
    expect(screen.getByText("LANDSCAPE 16:9").closest("button")!.getAttribute("aria-pressed")).toBe("true");

    const [res, fps, rate] = screen.getAllByRole("combobox") as HTMLSelectElement[];
    fireEvent.change(res!, { target: { value: "2160" } });
    fireEvent.change(fps!, { target: { value: "60" } });
    fireEvent.change(rate!, { target: { value: "12000" } });
    expect(fieldUnits.snapshot().units[0]).toMatchObject({ orient: "landscape", quality: "2160", fps: 60, kbps: 12000 });
  });
});

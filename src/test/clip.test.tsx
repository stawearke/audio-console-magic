import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIP_DB, CLIP_HOLD_MS, nextClipUntil } from "@/lib/clip";
import { MainOut, ObsStrip } from "@/components/console/ObsDesk";
import type { AudioChannel } from "@/lib/mk/types";

const ch = (o: Partial<AudioChannel> = {}): AudioChannel => ({ name: "Mic", db: 0, muted: false, monitor: "none", stream: true, pre: false, ...o });
const lamp = () => screen.getByRole("button", { name: "Mic clip" });
const lit = () => lamp().getAttribute("aria-pressed") === "true";

describe("clip rules", () => {
  it("lights within 1 dB of full scale and not below", () => {
    expect(CLIP_DB).toBe(-1);
    expect(nextClipUntil(-1.01, 1000, 0)).toBe(0);
    expect(nextClipUntil(-1, 1000, 0)).toBe(1000 + CLIP_HOLD_MS);
    expect(nextClipUntil(3, 1000, 0)).toBe(1000 + CLIP_HOLD_MS);
  });
  it("a quiet reading never shortens the hold, a new peak extends it", () => {
    expect(nextClipUntil(-30, 2000, 4000)).toBe(4000);
    expect(nextClipUntil(0, 3000, 4000)).toBe(3000 + CLIP_HOLD_MS);
  });
  it("ignores bad readings", () => {
    expect(nextClipUntil(Number.NaN, 1000, 0)).toBe(0);
    expect(nextClipUntil(Number.POSITIVE_INFINITY, 1000, 0)).toBe(0);
  });
});

describe("clip lamp on a strip", () => {
  beforeEach(() => { vi.useFakeTimers(); window.requestAnimationFrame = () => 0; HTMLCanvasElement.prototype.getContext = (() => null) as never; });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("stays dark for a healthy level", () => {
    render(<ObsStrip c={ch()} level={-12} focused={false} />);
    expect(lit()).toBe(false);
  });

  it("lights on a hot peak and stays lit after the peak is gone", () => {
    const { rerender } = render(<ObsStrip c={ch()} level={-12} focused={false} />);
    rerender(<ObsStrip c={ch()} level={-0.4} focused={false} />);
    expect(lit()).toBe(true);
    rerender(<ObsStrip c={ch()} level={-30} focused={false} />);
    expect(lit()).toBe(true);
  });

  it("goes out by itself after the hold time", () => {
    const { rerender } = render(<ObsStrip c={ch()} level={-12} focused={false} />);
    rerender(<ObsStrip c={ch()} level={0} focused={false} />);
    rerender(<ObsStrip c={ch()} level={-30} focused={false} />);
    act(() => { vi.advanceTimersByTime(CLIP_HOLD_MS - 500); });
    expect(lit()).toBe(true);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(lit()).toBe(false);
  });

  it("a new peak while lit extends the hold", () => {
    const { rerender } = render(<ObsStrip c={ch()} level={-12} focused={false} />);
    rerender(<ObsStrip c={ch()} level={0} focused={false} />);
    act(() => { vi.advanceTimersByTime(2500); });
    rerender(<ObsStrip c={ch()} level={-20} focused={false} />);
    rerender(<ObsStrip c={ch()} level={-0.5} focused={false} />);
    act(() => { vi.advanceTimersByTime(2500); });
    expect(lit()).toBe(true);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(lit()).toBe(false);
  });

  it("clicking the lamp clears it", () => {
    const { rerender } = render(<ObsStrip c={ch()} level={-12} focused={false} />);
    rerender(<ObsStrip c={ch()} level={0} focused={false} />);
    expect(lit()).toBe(true);
    fireEvent.click(lamp());
    expect(lit()).toBe(false);
  });

  it("a muted input never clips (it is silent in the mix)", () => {
    render(<ObsStrip c={ch({ muted: true })} level={0} focused={false} />);
    expect(lit()).toBe(false);
  });
});

describe("clip lamp on MAIN OUT", () => {
  beforeEach(() => { window.requestAnimationFrame = () => 0; HTMLCanvasElement.prototype.getContext = (() => null) as never; });
  afterEach(cleanup);
  const lim = { on: true, threshold: -6 };

  it("lights when the final mix is hot, not when it is quiet or muted out", () => {
    const quiet = render(<MainOut inputs={[ch()]} levels={{ Mic: -18 }} limiter={lim} gr={null} muted={false} />);
    expect(screen.getByRole("button", { name: "Main out clip" }).getAttribute("aria-pressed")).toBe("false");
    quiet.unmount();
    const hot = render(<MainOut inputs={[ch()]} levels={{ Mic: -0.3 }} limiter={lim} gr={null} muted={false} />);
    expect(screen.getByRole("button", { name: "Main out clip" }).getAttribute("aria-pressed")).toBe("true");
    hot.unmount();
    render(<MainOut inputs={[ch()]} levels={{ Mic: -0.3 }} limiter={lim} gr={null} muted />);
    expect(screen.getByRole("button", { name: "Main out clip" }).getAttribute("aria-pressed")).toBe("false");
  });
});

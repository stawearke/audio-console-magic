import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => { localStorage.clear(); });
import { Console } from "@/components/console/Console";
import { MainOut } from "@/components/console/ObsDesk";
import { defaultMixer, migrateV1, sanitizeMixer } from "@/lib/mixer-state";

// The built-in desk has no button any more; a saved flag still opens it (used to keep testing its tabs).
const enableBuiltin = () => localStorage.setItem("voxone-builtin-channels", "1");

describe("OBS-only console", () => {
  it("opens on the OBS tab with no built-in VOICE / MUSIC / DESKTOP / SOUNDPAD channels", () => {
    window.requestAnimationFrame = () => 0;
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    render(<Console />);
    // The OBS desk keeps the familiar tab names, but they work on OBS inputs. There is no FX rack in OBS.
    expect(screen.getByRole("button", { name: /^Mixer$/ }).getAttribute("aria-pressed")).toBe("true");
    for (const t of [/^Channel$/, /^Mixer 2$/, /^Patch$/, /^Show$/, /^Speakers$/]) expect(screen.getByRole("button", { name: t })).toBeTruthy();
    for (const t of [/^FX$/, /^Setup$/, /^OBS$/]) expect(screen.queryByRole("button", { name: t })).toBeNull();
    for (const n of ["VOICE", "MUSIC", "DESKTOP", "SOUNDPAD"]) expect(screen.queryByText(n)).toBeNull();
    expect(screen.getByLabelText("OBS inputs")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Built-in channels$/i })).toBeNull();
  });

  it("MAIN OUT shows the final mix with limiter and mute out", () => {
    window.requestAnimationFrame = () => 0;
    const lim = { on: true, threshold: -6 };
    const ch = (name: string, stream: boolean, muted = false) => ({ name, db: 0, muted, monitor: "none" as const, stream, pre: false });
    const { rerender } = render(<MainOut inputs={[ch("Mic", true), ch("Music", false), ch("Muted", true, true)]} levels={{ Mic: -12 }} limiter={lim} gr={null} muted={false} />);
    expect(screen.getByText("1 on air")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Mute out$/i }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /^Limiter$/i }).getAttribute("aria-pressed")).toBe("true");
    rerender(<MainOut inputs={[ch("Mic", true)]} levels={{ Mic: -12 }} limiter={lim} gr={null} muted />);
    expect(screen.getByRole("button", { name: /^Mute out$/i }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("console smoke", () => {
  it("renders every tab and the compact and fader-mode switches", () => {
    window.requestAnimationFrame = () => 0;
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    enableBuiltin();
    render(<Console />);
    for (const t of ["Mixer 2", "Channel", "FX", "Show", "Patch", "Setup", "Mixer"]) fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${t}$`, "i") }));
    fireEvent.click(screen.getByRole("button", { name: /compact view/i }));
    fireEvent.click(screen.getByRole("button", { name: "REVERB" }));
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    expect(screen.getAllByText("VOICE").length).toBeGreaterThan(0);
  }, 30000); // visits every built-in tab in jsdom: slow on a busy machine
});

describe("undo", () => {
  it("restores a muted channel", () => {
    window.requestAnimationFrame = () => 0;
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    enableBuiltin();
    render(<Console />);
    fireEvent.click(screen.getByRole("button", { name: /^Mixer$/i }));
    const mute = () => screen.getAllByRole("button", { name: /^Mute$/ })[0] as HTMLElement;
    fireEvent.click(mute());
    expect(mute().getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(mute().getAttribute("aria-pressed")).toBe("false");
  });
});

describe("scene state", () => {
  it("round-trips and fills new fields on older saves", () => {
    const m = defaultMixer();
    expect(sanitizeMixer(JSON.parse(JSON.stringify(m))).dcas).toHaveLength(4);
    const old = JSON.parse(JSON.stringify(m)) as Record<string, unknown>;
    delete old["dcas"]; delete old["muteGroups"];
    expect(sanitizeMixer(old).muteGroups).toHaveLength(4);
    expect(migrateV1({ channels: [{ id: "voice", gain: 3, pan: 10, mute: true, solo: false }] }).channels[0]?.mute).toBe(true);
  });
  it("adds master EQ and compressor to older saves", () => {
    const old = JSON.parse(JSON.stringify(defaultMixer())) as { master: Record<string, unknown> };
    delete old.master["eq"]; delete old.master["comp"];
    const m = sanitizeMixer(old);
    expect(m.master.eq.on).toBe(false);
    expect(m.master.comp.ratio).toBe(2);
  });
  it("rejects junk", () => { expect(() => sanitizeMixer({ channels: [] })).toThrow(); });
});

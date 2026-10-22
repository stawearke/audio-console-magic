import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => { localStorage.clear(); });
import { Console } from "@/components/console/Console";
import { defaultMixer, migrateV1, sanitizeMixer } from "@/lib/mixer-state";

const enableBuiltin = () => fireEvent.click(screen.getByRole("button", { name: /^Built-in channels$/i }));

describe("OBS-only console", () => {
  it("opens on the OBS tab with no built-in VOICE / MUSIC / DESKTOP / SOUNDPAD channels", () => {
    window.requestAnimationFrame = () => 0;
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    render(<Console />);
    expect(screen.getByRole("button", { name: /^OBS$/ }).getAttribute("aria-pressed")).toBe("true");
    for (const t of [/^Mixer$/, /^Mixer 2$/, /^Channel$/, /^FX$/, /^Patch$/, /^Setup$/]) expect(screen.queryByRole("button", { name: t })).toBeNull();
    for (const n of ["VOICE", "MUSIC", "DESKTOP", "SOUNDPAD"]) expect(screen.queryByText(n)).toBeNull();
    expect(screen.getByLabelText("OBS inputs")).toBeTruthy();
  });
});

describe("console smoke", () => {
  it("renders every tab and the compact and fader-mode switches", () => {
    window.requestAnimationFrame = () => 0;
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    render(<Console />);
    enableBuiltin();
    for (const t of ["Mixer 2", "Channel", "FX", "Show", "Patch", "Setup", "Mixer"]) fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${t}$`, "i") }));
    fireEvent.click(screen.getByRole("button", { name: /compact view/i }));
    fireEvent.click(screen.getByRole("button", { name: "REVERB" }));
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    expect(screen.getAllByText("VOICE").length).toBeGreaterThan(0);
  });
});

describe("undo", () => {
  it("restores a muted channel", () => {
    window.requestAnimationFrame = () => 0;
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    render(<Console />);
    enableBuiltin();
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

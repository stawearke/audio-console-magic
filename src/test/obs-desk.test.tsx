import { act, render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ObsTransport } from "@/lib/mk/obs-transport";
import { engine } from "@/lib/mk/use-switcher";
import { FLAT_EQ, type AudioChannel } from "@/lib/mk/types";
import { GROUPS_KEY, SCENE_LINKS_KEY, SNAPSHOTS_KEY, SNAPSHOT_SLOTS, defaultGroups, defaultLinks, groupMuted, recallPlan, sanitizeGroups, sanitizeLinks, sanitizeSnapshots, slotForScene, snapshotOf } from "@/lib/obs-desk";
import { SceneMixRunner } from "@/components/console/ObsSceneMix";
import { ObsPatch } from "@/components/console/ObsPatch";
import { ObsGroups } from "@/components/console/ObsGroups";
import { ObsShow } from "@/components/console/ObsShow";
import { VoicePanel } from "@/components/console/ObsDesk";
import { OBS_VOICE_PRESET_NAMES, obsVoicePreset } from "@/lib/obs-voice-presets";
import { VOICE_RANGE as R } from "@/lib/mk/obs-voice";

const ch = (name: string, o: Partial<AudioChannel> = {}): AudioChannel => ({ name, db: -6, muted: false, monitor: "none", stream: true, pre: false, ...o });

describe("groups and snapshots logic", () => {
  it("always gives four valid groups, whatever is in storage", () => {
    expect(sanitizeGroups(null)).toEqual(defaultGroups());
    const g = sanitizeGroups([{ name: "  Panel  ", members: ["A", "A", 3, "B"], offset: 99 }, "junk", { offset: "x" }]);
    expect(g).toHaveLength(4);
    expect(g[0]).toMatchObject({ name: "Panel", members: ["A", "B"], offset: 12 });
    expect(g[1]).toEqual(defaultGroups()[1]);
    expect(g[2]!.offset).toBe(0);
  });

  it("a group counts as muted only when it has live members and all are muted", () => {
    const g = { id: "g1", name: "G", members: ["A", "B", "Gone"], offset: 0 };
    expect(groupMuted(g, [ch("A", { muted: true }), ch("B", { muted: true })])).toBe(true);
    expect(groupMuted(g, [ch("A", { muted: true }), ch("B")])).toBe(false);
    expect(groupMuted({ ...g, members: ["Gone"] }, [ch("A")])).toBe(false);
  });

  it("snapshots round-trip and junk is dropped", () => {
    const snap = snapshotOf("  Show open  ", [ch("A", { db: -3, muted: true, eq: { ...FLAT_EQ, hi: 2 } }), ch("B", { stream: false })]);
    expect(snap.name).toBe("Show open");
    const slots = sanitizeSnapshots(JSON.parse(JSON.stringify([snap, 5, { inputs: 7 }, null])));
    expect(slots).toHaveLength(SNAPSHOT_SLOTS);
    expect(slots[0]!.inputs["A"]).toMatchObject({ db: -3, muted: true });
    expect(slots[0]!.inputs["A"]!.eq.hi).toBe(2);
    expect(slots[0]!.inputs["B"]!.stream).toBe(false);
    // A snapshot saved before ducking existed still loads, with the duck off.
    const old = sanitizeSnapshots([{ name: "Old", inputs: { A: { db: 0, muted: false, stream: true, eq: {}, voice: { denoise: { on: true }, gate: { on: false }, comp: { on: false } } } } }]);
    expect(old[0]!.inputs["A"]!.voice!.duck).toMatchObject({ on: false, source: "" });
    expect(slots.slice(1).every((s) => s === null)).toBe(true);
  });

  it("recall applies what exists in OBS and reports what does not", () => {
    const snap = snapshotOf("S", [ch("A"), ch("Old mic")]);
    expect(recallPlan(snap, [ch("A"), ch("New")])).toEqual({ apply: ["A"], missing: ["Old mic"] });
  });
});

describe("scene links", () => {
  it("always gives one scene per slot and a safe Auto-recall switch", () => {
    expect(sanitizeLinks(null)).toEqual(defaultLinks());
    const l = sanitizeLinks({ auto: "yes", scenes: ["Interview", 4, "", "Wide", ...Array(20).fill("x")] });
    expect(l.auto).toBe(false);
    expect(l.scenes).toHaveLength(SNAPSHOT_SLOTS);
    expect(l.scenes.slice(0, 4)).toEqual(["Interview", null, null, "Wide"]);
    expect(sanitizeLinks({ auto: true }).auto).toBe(true);
  });
  it("finds the first filled slot linked to a scene", () => {
    const snap = snapshotOf("S", [ch("A")]);
    const slots = [null, snap, snap, ...Array(SNAPSHOT_SLOTS - 3).fill(null)];
    const links = { auto: true, scenes: ["Wide", "Wide", "Close", ...Array(SNAPSHOT_SLOTS - 3).fill(null)] };
    expect(slotForScene(links, slots, "Wide")).toBe(1); // slot 0 is linked but empty
    expect(slotForScene(links, slots, "Close")).toBe(2);
    expect(slotForScene(links, slots, "Nowhere")).toBe(-1);
  });
});

describe("OBS voice presets", () => {
  const inRange = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;
  it("offers VOXONE's voice presets that OBS can do, without Cave Echo (needs reverb)", () => {
    expect(OBS_VOICE_PRESET_NAMES).toEqual(["Broadcast Voice", "Noisy Room", "Radio DJ", "Flat"]);
    expect(obsVoicePreset("Cave Echo")).toBeNull();
  });
  it("every preset stays inside what the OBS filters accept", () => {
    for (const n of OBS_VOICE_PRESET_NAMES) {
      const v = obsVoicePreset(n)!;
      expect(inRange(v.gate.threshold, R.gateThreshold) && inRange(v.gate.attack, R.gateAttack) && inRange(v.gate.release, R.gateRelease), n).toBe(true);
      expect(inRange(v.comp.threshold, R.compThreshold) && inRange(v.comp.ratio, R.compRatio) && inRange(v.comp.attack, R.compAttack), n).toBe(true);
      expect(inRange(v.comp.release, R.compRelease) && inRange(v.comp.makeup, R.compMakeup), n).toBe(true);
    }
  });
  it("each preset does what its name says", () => {
    expect(obsVoicePreset("Flat")).toMatchObject({ denoise: { on: false }, gate: { on: false }, comp: { on: false } });
    expect(obsVoicePreset("Noisy Room")).toMatchObject({ denoise: { on: true }, gate: { on: true, threshold: -42 } });
    expect(obsVoicePreset("Radio DJ")!.comp).toMatchObject({ on: true, ratio: 6, threshold: -28, makeup: 8 });
    expect(obsVoicePreset("Broadcast Voice")!.denoise.on).toBe(true);
  });
  it("hands out copies, so changing one never changes the preset", () => {
    const a = obsVoicePreset("Radio DJ")!;
    a.comp.ratio = 1;
    expect(obsVoicePreset("Radio DJ")!.comp.ratio).toBe(6);
  });
});

describe("OBS tracks, delay and balance", () => {
  function fake(responses: Record<string, unknown> = {}) {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const t = new ObsTransport({} as never);
    (t as unknown as { obs: unknown }).obs = {
      async call(req: string, d: Record<string, unknown> = {}) {
        calls.push([req, d]);
        const r = responses[req];
        if (r instanceof Error) throw r;
        return r ?? {};
      },
    };
    return { t, calls };
  }

  it("sends one track at a time and nothing else", async () => {
    const { t, calls } = fake();
    await t.setInputTrack!("Mic", 4, true);
    expect(calls).toEqual([["SetInputAudioTracks", { inputName: "Mic", inputAudioTracks: { "4": true } }]]);
  });

  it("reads delay and balance, and survives an input that has neither", async () => {
    const ok = fake({ GetInputAudioSyncOffset: { inputAudioSyncOffset: 120 }, GetInputAudioBalance: { inputAudioBalance: 0.25 } });
    expect(await ok.t.getInputTiming!("Mic")).toEqual({ syncOffset: 120, balance: 0.25 });
    const bad = fake({ GetInputAudioSyncOffset: new Error("nope"), GetInputAudioBalance: new Error("nope") });
    expect(await bad.t.getInputTiming!("Cam")).toEqual({ syncOffset: 0, balance: 0.5 });
  });

  it("keeps balance inside 0..1 and rounds delay to whole milliseconds", async () => {
    const { t, calls } = fake();
    await t.setInputBalance!("Mic", 3);
    await t.setInputSyncOffset!("Mic", 12.6);
    expect(calls[0]![1]["inputAudioBalance"]).toBe(1);
    expect(calls[1]![1]["inputAudioSyncOffset"]).toBe(13);
  });
});

// The views, against the built-in demo OBS (no OBS needed).
describe("OBS desk views (demo OBS)", () => {
  beforeAll(() => { localStorage.setItem("mkvision.config.v1", JSON.stringify({ demoMode: true })); });
  afterEach(() => { cleanup(); localStorage.removeItem(GROUPS_KEY); localStorage.removeItem(SNAPSHOTS_KEY); localStorage.removeItem(SCENE_LINKS_KEY); });

  it("Patch: sends an input to track 3 and back", async () => {
    render(<ObsPatch />);
    const toggle = await screen.findByTitle("Send CAM 1 Mic to OBS track 3");
    expect(toggle.textContent).toBe("Off");
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByTitle("Send CAM 1 Mic to OBS track 3").textContent).toBe("On"));
    fireEvent.click(screen.getByTitle("Send CAM 1 Mic to OBS track 3"));
    await waitFor(() => expect(screen.getByTitle("Send CAM 1 Mic to OBS track 3").textContent).toBe("Off"));
  });

  it("Patch: Track 2 is shown but cannot be switched (the Monitor section owns it)", async () => {
    render(<ObsPatch />);
    await screen.findByTitle("Send CAM 1 Mic to OBS track 3");
    expect(screen.queryByTitle("Send CAM 1 Mic to OBS track 2")).toBeNull();
  });

  it("Groups: a ticked input follows the group mute, which is saved", async () => {
    render(<ObsGroups />);
    const group = within(await screen.findByLabelText("GROUP 1"));
    fireEvent.click(group.getByLabelText("CAM 1 Mic"));
    expect(JSON.parse(localStorage.getItem(GROUPS_KEY)!)[0].members).toEqual(["CAM 1 Mic"]);
    const mute = group.getByRole("button", { name: /^Mute$/ });
    expect(mute.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(mute);
    await waitFor(() => expect(within(screen.getByLabelText("GROUP 1")).getByRole("button", { name: /^Mute$/ }).getAttribute("aria-pressed")).toBe("true"));
  });

  it("Channel: a preset is written to the OBS input as filters", async () => {
    render(<VoicePanel name="CAM 2 Mic" />);
    fireEvent.change(await screen.findByLabelText("Voice preset"), { target: { value: "Radio DJ" } });
    await waitFor(async () => expect((await engine.readVoice("CAM 2 Mic")).comp).toMatchObject({ on: true, ratio: 6, threshold: -28 }));
    expect((await engine.readVoice("CAM 2 Mic")).denoise.on).toBe(true);
  });

  it("Channel: ducking picks another input as the source, never itself", async () => {
    render(<VoicePanel name="Music Bed" sources={["Music Bed", "CAM 1 Mic", "Presenter Lav"]} />);
    const pick = (await screen.findByLabelText("Duck under this input")) as HTMLSelectElement;
    expect([...pick.options].map((o) => o.textContent)).toEqual(["Pick an input…", "CAM 1 Mic", "Presenter Lav"]);
    fireEvent.change(pick, { target: { value: "Presenter Lav" } });
    await waitFor(async () => expect((await engine.readVoice("Music Bed")).duck).toMatchObject({ on: true, source: "Presenter Lav" }));
    // A voice preset must not wipe the duck the user set up.
    fireEvent.change(screen.getByLabelText("Voice preset"), { target: { value: "Flat" } });
    await waitFor(async () => expect((await engine.readVoice("Music Bed")).comp.on).toBe(false));
    expect((await engine.readVoice("Music Bed")).duck).toMatchObject({ on: true, source: "Presenter Lav" });
  });

  it("Show: going to a linked scene brings its mix back, but only with Auto-recall on", async () => {
    const goTo = (scene: string) => act(() => (engine as unknown as { onTransportEvent(e: unknown): void }).onTransportEvent({ type: "programScene", scene }));
    const mic = () => engine.getSnapshot().audio.find((c) => c.name === "CAM 1 Mic")!;
    render(<><SceneMixRunner /><ObsShow /></>);
    await waitFor(() => expect(mic()).toBeTruthy());
    await engine.setAudioVolume("CAM 1 Mic", -6);
    await waitFor(() => expect(mic().db).toBe(-6));
    fireEvent.click(await screen.findByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/^Saved/));
    await screen.findByRole("option", { name: "Camera 2 Close" });
    fireEvent.change(screen.getByLabelText("Scene for this slot"), { target: { value: "Camera 2 Close" } });
    expect(JSON.parse(localStorage.getItem(SCENE_LINKS_KEY)!).scenes[0]).toBe("Camera 2 Close");
    await engine.setAudioVolume("CAM 1 Mic", -20);
    await waitFor(() => expect(mic().db).toBe(-20));
    // Auto-recall is off: the scene changes, the mix does not.
    await goTo("Camera 3 Guest");
    await goTo("Camera 2 Close");
    await new Promise((r) => setTimeout(r, 60));
    expect(mic().db).toBe(-20);
    // Auto-recall on: the linked scene brings the saved mix back.
    fireEvent.click(screen.getByRole("button", { name: /^Auto-recall$/ }));
    await goTo("Camera 1 Wide");
    await new Promise((r) => setTimeout(r, 60));
    expect(mic().db).toBe(-20); // an unlinked scene changes nothing
    await goTo("Camera 2 Close");
    await waitFor(() => expect(mic().db).toBe(-6));
    expect(screen.getByRole("status").textContent).toMatch(/^Scene "Camera 2 Close" came on: recalled "SNAPSHOT 1"/);
  });

  it("Show: saves the mix, and recall puts back what was changed afterwards", async () => {
    render(<ObsShow />);
    const mic = () => engine.getSnapshot().audio.find((c) => c.name === "CAM 1 Mic")!;
    await screen.findByRole("button", { name: /^Save$/ });
    await waitFor(() => expect(mic()).toBeTruthy());
    const savedMuted = mic().muted;
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/^Saved \d+ inputs? into slot 1\.$/));
    const stored = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY)!);
    expect(stored[0].inputs["CAM 1 Mic"]).toMatchObject({ db: -6, muted: savedMuted });
    // Change the mix after saving...
    await engine.toggleAudioMute("CAM 1 Mic");
    await engine.setAudioVolume("CAM 1 Mic", -20);
    await waitFor(() => expect(mic().muted).toBe(!savedMuted));
    // ...then recall: it comes back.
    fireEvent.click(screen.getByRole("button", { name: /^Recall$/ }));
    expect(screen.getByRole("status").textContent).toMatch(/^Recalled "SNAPSHOT 1": \d+ inputs?\.$/);
    await waitFor(() => expect(mic().muted).toBe(savedMuted));
    await waitFor(() => expect(mic().db).toBe(-6));
  });
});

import { describe, expect, it } from "vitest";
import { ObsTransport } from "@/lib/mk/obs-transport";
import { DEFAULT_VOICE, FILTER_CHAIN, VOICE_FILTERS, normalizeVoice, voiceFromDsp, type ObsVoice } from "@/lib/mk/obs-voice";
import { voiceDsp } from "@/lib/mixer-state";

// A tiny fake OBS that keeps one input's filter list, like obs-websocket does.
function fakeObs(initial: string[] = []) {
  const filters = initial.map((filterName) => ({ filterName, filterKind: "x", filterEnabled: true, filterSettings: {} as Record<string, unknown> }));
  const calls: string[] = [];
  const obs = {
    async call(req: string, d: Record<string, unknown> = {}) {
      calls.push(req);
      if (req === "GetSourceFilterList") return { filters: filters.map((f) => ({ ...f })) };
      if (req === "CreateSourceFilter") {
        filters.unshift({ filterName: String(d["filterName"]), filterKind: String(d["filterKind"]), filterEnabled: true, filterSettings: (d["filterSettings"] ?? {}) as Record<string, unknown> });
      } else {
        const i = filters.findIndex((f) => f.filterName === d["filterName"]);
        if (i < 0) throw new Error("no filter");
        if (req === "SetSourceFilterSettings") Object.assign(filters[i]!.filterSettings, d["filterSettings"]);
        if (req === "SetSourceFilterEnabled") filters[i]!.filterEnabled = Boolean(d["filterEnabled"]);
        if (req === "SetSourceFilterIndex") filters.splice(Number(d["filterIndex"]), 0, filters.splice(i, 1)[0]!);
      }
      return {};
    },
  };
  const t = new ObsTransport({} as never);
  (t as unknown as { obs: unknown }).obs = obs;
  return { t, filters, calls };
}

const on = (v: ObsVoice): ObsVoice => ({ ...v, denoise: { on: true }, gate: { ...v.gate, on: true, threshold: -35 }, comp: { ...v.comp, on: true, ratio: 4 } });

describe("OBS voice filters", () => {
  it("creates the native filters with the right kinds and settings", async () => {
    const { t, filters } = fakeObs();
    await t.setInputVoice!("Mic", on(DEFAULT_VOICE));
    const by = (n: string) => filters.find((f) => f.filterName === n)!;
    expect(by("MK Denoise").filterKind).toBe("noise_suppress_filter_v2");
    expect(by("MK Gate").filterKind).toBe("noise_gate_filter");
    expect(by("MK Gate").filterSettings["open_threshold"]).toBe(-35);
    expect(by("MK Compressor").filterKind).toBe("compressor_filter");
    expect(by("MK Compressor").filterSettings["ratio"]).toBe(4);
  });

  it("puts our filters in signal-flow order and leaves the user's own after them", async () => {
    const { t, filters } = fakeObs(["My Reverb", "MK EQ", "MK Gain"]);
    await t.setInputVoice!("Mic", on(DEFAULT_VOICE));
    expect(filters.map((f) => f.filterName)).toEqual(["MK Denoise", "MK Gate", "MK EQ", "MK Compressor", "MK Gain", "My Reverb"]);
  });

  it("reads back what it wrote, and does not create filters for stages that are off", async () => {
    const { t, filters } = fakeObs();
    await t.setInputVoice!("Mic", DEFAULT_VOICE);
    expect(filters).toHaveLength(0);
    await t.setInputVoice!("Mic", on(DEFAULT_VOICE));
    const v = await t.getInputVoice!("Mic");
    expect(v.denoise.on && v.gate.on && v.comp.on).toBe(true);
    expect(v.gate.threshold).toBe(-35);
    expect(v.comp.ratio).toBe(4);
    await t.setInputVoice!("Mic", { ...v, gate: { ...v.gate, on: false } });
    expect((await t.getInputVoice!("Mic")).gate.on).toBe(false);
  });

  it("copies a VOXONE channel's settings and keeps them inside OBS's ranges", () => {
    const d = voiceDsp();
    d.gate = { on: true, threshold: -200, range: -60, attack: 2, release: 9999 };
    d.comp = { ...d.comp, on: true, ratio: 50, makeup: 99 };
    const v = voiceFromDsp(d);
    expect(v.gate).toMatchObject({ on: true, threshold: -60, release: 500 });
    expect(v.comp).toMatchObject({ on: true, ratio: 20, makeup: 24 });
  });

  it("chain lists every filter we create", () => {
    for (const f of Object.values(VOICE_FILTERS)) expect(FILTER_CHAIN).toContain(f.name);
  });

  it("ducking is an OBS compressor listening to another input", async () => {
    const { t, filters } = fakeObs();
    await t.setInputVoice!("Music", { ...DEFAULT_VOICE, duck: { on: true, source: "Mic", threshold: -30, ratio: 16, attack: 10, release: 500 } });
    const duck = filters.find((f) => f.filterName === "MK Duck")!;
    expect(duck.filterKind).toBe("compressor_filter");
    expect(duck.filterEnabled).toBe(true);
    expect(duck.filterSettings).toMatchObject({ sidechain_source: "Mic", threshold: -30, ratio: 16, attack_time: 10, release_time: 500, output_gain: 0 });
    const back = await t.getInputVoice!("Music");
    expect(back.duck).toEqual({ on: true, source: "Mic", threshold: -30, ratio: 16, attack: 10, release: 500 });
  });

  it("a duck with no source is never switched on (it would compress the input against itself)", async () => {
    const { t, filters } = fakeObs();
    await t.setInputVoice!("Music", { ...DEFAULT_VOICE, duck: { ...DEFAULT_VOICE.duck, on: true, source: "" } });
    expect(filters).toHaveLength(0);
    await t.setInputVoice!("Music", { ...DEFAULT_VOICE, duck: { ...DEFAULT_VOICE.duck, on: true, source: "Mic" } });
    await t.setInputVoice!("Music", { ...DEFAULT_VOICE, duck: { ...DEFAULT_VOICE.duck, on: true, source: "" } });
    expect(filters.find((f) => f.filterName === "MK Duck")!.filterEnabled).toBe(false);
  });

  it("the duck sits after the voice compressor and before gain", async () => {
    const { t, filters } = fakeObs(["MK Gain"]);
    await t.setInputVoice!("Music", { ...on(DEFAULT_VOICE), duck: { ...DEFAULT_VOICE.duck, on: true, source: "Mic" } });
    expect(filters.map((f) => f.filterName)).toEqual(["MK Denoise", "MK Gate", "MK Compressor", "MK Duck", "MK Gain"]);
  });

  it("older saves without a duck, and junk values, become a complete valid voice", () => {
    const old = { denoise: { on: true }, gate: { on: true, threshold: -33, attack: 2, release: 90 }, comp: { on: false, threshold: "loud", ratio: 4 } };
    const v = normalizeVoice(old);
    expect(v.duck).toEqual(DEFAULT_VOICE.duck);
    expect(v.denoise.on).toBe(true);
    expect(v.gate.threshold).toBe(-33);
    expect(v.comp.threshold).toBe(DEFAULT_VOICE.comp.threshold);
    expect(v.comp.ratio).toBe(4);
    expect(normalizeVoice(null)).toEqual(DEFAULT_VOICE);
  });
});

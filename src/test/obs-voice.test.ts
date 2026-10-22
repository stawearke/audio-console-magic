import { describe, expect, it } from "vitest";
import { ObsTransport } from "@/lib/mk/obs-transport";
import { DEFAULT_VOICE, FILTER_CHAIN, VOICE_FILTERS, voiceFromDsp, type ObsVoice } from "@/lib/mk/obs-voice";
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

const on = (v: ObsVoice): ObsVoice => ({ denoise: { on: true }, gate: { ...v.gate, on: true, threshold: -35 }, comp: { ...v.comp, on: true, ratio: 4 } });

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
});

// Mixer state model: everything a scene stores. The audio engine reads this; the UI edits it.

export type SourceKind = "mic" | "file" | "desktop" | "gen";
export type GenType = "white" | "pink" | "sine";
export type PanLaw = "0" | "-3" | "-4.5" | "-6";
export type MeterMode = "peak-post" | "peak-pre" | "rms-post";
export type Route = "master" | "g1" | "g2";

export const AUX_NAMES = ["REVERB", "DELAY", "MONITOR"] as const;
export const MAX_CHANNELS = 16;
export const FADER_MIN = -60;
export const FADER_MAX = 12;
export const HUES = [195, 80, 150, 345, 25, 285, 50, 230, 110, 5];

export type Dsp = {
  input: { gain: number; polarity: boolean; dcBlock: boolean; hpfOn: boolean; hpf: number; lpfOn: boolean; lpf: number; delaySamples: number; browserNS: boolean };
  gate: { on: boolean; threshold: number; range: number; attack: number; release: number };
  eq: {
    on: boolean;
    lowGain: number; lowFreq: number;
    lmGain: number; lmFreq: number; lmQ: number;
    hmGain: number; hmFreq: number; hmQ: number;
    highGain: number; highFreq: number;
  };
  deess: { on: boolean; freq: number; threshold: number; range: number };
  comp: { on: boolean; threshold: number; ratio: number; attack: number; release: number; makeup: number };
  warmth: { on: boolean; drive: number };
  // Sidechain ducker: this channel lowers itself while the trigger channel is loud (music under voice).
  duck: { on: boolean; source: string; threshold: number; amount: number; release: number };
};

export type GenSettings = { type: GenType; freq: number; level: number };

export type Channel = {
  id: string; name: string; kind: SourceKind; hue: number; stereo: boolean;
  fader: number; pan: number; mute: boolean; solo: boolean; pfl: boolean;
  sends: number[]; sendPre: boolean[]; route: Route;
  deviceId: string; loop: boolean; gen: GenSettings; dsp: Dsp;
  // 0 = none, 1-4 = DCA; muteGrp[i] = member of mute group i+1
  dca: number; muteGrp: boolean[];
};
export type Group = { id: "g1" | "g2"; name: string; fader: number; mute: boolean };
export type Master = { fader: number; mute: boolean; limiter: { on: boolean; ceiling: number }; eq: Dsp["eq"]; comp: Dsp["comp"] };
export type Fx = {
  reverb: { size: number; tone: number; predelay: number; level: number };
  delay: { time: number; feedback: number; tone: number; level: number };
  monitor: { level: number; pflLevel: number };
};
export type MidiMap = { fader: number; pan: number; solo: number; mute: number; pfl: number; sel: number; master: number; bankPrev: number; bankNext: number; chanPrev: number; chanNext: number; tap: number };
export type Desk = {
  panLaw: PanLaw; meterMode: MeterMode; multi: boolean; showLatency: boolean;
  compact: boolean; faderMode: number; // faderMode: 0 = level, 1-3 = aux send level
  midi: { on: boolean; inputId: string; map: MidiMap };
};
export type Dca = { name: string; fader: number; mute: boolean };
export type MuteGroup = { name: string; on: boolean };
export type Mixer = { channels: Channel[]; groups: Group[]; dcas: Dca[]; muteGroups: MuteGroup[]; master: Master; fx: Fx; desk: Desk };

export const defaultMidiMap: MidiMap = { fader: 81, pan: 57, solo: 65, mute: 73, pfl: 33, sel: 41, master: 9, bankPrev: 89, bankNext: 90, chanPrev: 91, chanNext: 92, tap: 127 };

const voiceDsp = (): Dsp => ({
  input: { gain: 0, polarity: false, dcBlock: true, hpfOn: true, hpf: 80, lpfOn: false, lpf: 16000, delaySamples: 0, browserNS: true },
  gate: { on: true, threshold: -50, range: -40, attack: 3, release: 150 },
  eq: { on: true, lowGain: 2, lowFreq: 120, lmGain: -2, lmFreq: 350, lmQ: 1, hmGain: 2, hmFreq: 3000, hmQ: 1, highGain: 2, highFreq: 10000 },
  deess: { on: true, freq: 6500, threshold: -30, range: 8 },
  comp: { on: true, threshold: -20, ratio: 4, attack: 10, release: 200, makeup: 4 },
  warmth: { on: false, drive: 20 },
  duck: { on: false, source: "", threshold: -40, amount: 12, release: 400 },
});

export const flatDsp = (): Dsp => ({
  input: { gain: 0, polarity: false, dcBlock: false, hpfOn: false, hpf: 80, lpfOn: false, lpf: 16000, delaySamples: 0, browserNS: false },
  gate: { on: false, threshold: -50, range: -40, attack: 3, release: 150 },
  eq: { on: false, lowGain: 0, lowFreq: 120, lmGain: 0, lmFreq: 350, lmQ: 1, hmGain: 0, hmFreq: 3000, hmQ: 1, highGain: 0, highFreq: 10000 },
  deess: { on: false, freq: 6500, threshold: -30, range: 8 },
  comp: { on: false, threshold: -20, ratio: 4, attack: 10, release: 200, makeup: 0 },
  warmth: { on: false, drive: 20 },
  duck: { on: false, source: "", threshold: -40, amount: 12, release: 400 },
});
export { voiceDsp };

let counter = 0;
export const uid = () => `ch${Date.now().toString(36)}${(counter++).toString(36)}`;

export function makeChannel(kind: SourceKind, id: string, name: string, hue: number, over: Partial<Channel> = {}): Channel {
  return {
    id, name, kind, hue, stereo: kind !== "mic", fader: kind === "mic" ? 0 : -6, pan: 0, mute: false, solo: false, pfl: false,
    sends: [-60, -60, -60], sendPre: [false, false, false], route: "master", deviceId: "", loop: kind === "file",
    gen: { type: "white", freq: 440, level: -12 }, dsp: kind === "mic" ? voiceDsp() : flatDsp(),
    dca: 0, muteGrp: [false, false, false, false], ...over,
  };
}

export function defaultMixer(): Mixer {
  return {
    channels: [
      makeChannel("mic", "voice", "VOICE", 195),
      makeChannel("file", "music", "MUSIC", 80, { fader: -12, loop: true, dsp: { ...flatDsp(), duck: { on: false, source: "voice", threshold: -40, amount: 12, release: 400 } } }),
      makeChannel("desktop", "desktop", "DESKTOP", 150),
      makeChannel("file", "sample", "SOUNDPAD", 345, { loop: false }),
    ],
    groups: [{ id: "g1", name: "GROUP 1", fader: 0, mute: false }, { id: "g2", name: "GROUP 2", fader: 0, mute: false }],
    dcas: [1, 2, 3, 4].map((n) => ({ name: `DCA ${n}`, fader: 0, mute: false })),
    muteGroups: [1, 2, 3, 4].map((n) => ({ name: `MUTE ${n}`, on: false })),
    master: { fader: 0, mute: false, limiter: { on: true, ceiling: -1 }, eq: flatDsp().eq, comp: { on: false, threshold: -18, ratio: 2, attack: 30, release: 250, makeup: 0 } },
    fx: {
      reverb: { size: 1.5, tone: 6000, predelay: 0, level: -6 },
      delay: { time: 280, feedback: 25, tone: 5000, level: -6 },
      monitor: { level: 0, pflLevel: 0 },
    },
    desk: { panLaw: "-3", meterMode: "peak-post", multi: false, showLatency: true, compact: false, faderMode: 0, midi: { on: false, inputId: "", map: { ...defaultMidiMap } } },
  };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Deep-merge `val` onto `def`: keeps default shape, accepts only same-typed finite values.
function merge<T>(def: T, val: unknown): T {
  if (Array.isArray(def)) {
    if (!Array.isArray(val)) return def;
    return def.map((d, i) => (i < val.length ? merge(d, val[i]) : d)) as T;
  }
  if (def && typeof def === "object") {
    const src = (val && typeof val === "object" ? val : {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, d] of Object.entries(def as Record<string, unknown>)) out[k] = merge(d, src[k]);
    return out as T;
  }
  if (typeof def === "number") return (typeof val === "number" && Number.isFinite(val) && Math.abs(val) <= 1e6 ? val : def) as T;
  if (typeof def === "string") return (typeof val === "string" ? val.slice(0, 80) : def) as T;
  if (typeof def === "boolean") return (typeof val === "boolean" ? val : def) as T;
  return def;
}

function cleanChannel(raw: unknown, i: number): Channel {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = (["mic", "file", "desktop", "gen"] as const).find(k => k === r["kind"]) ?? "file";
  const id = typeof r["id"] === "string" && r["id"] ? r["id"].slice(0, 40) : uid();
  const base = makeChannel(kind, id, `CH ${i + 1}`, HUES[i % HUES.length] ?? 195);
  const c = merge(base, r);
  c.fader = clamp(c.fader, FADER_MIN, FADER_MAX);
  c.pan = clamp(c.pan, -100, 100);
  c.sends = c.sends.map(s => clamp(s, FADER_MIN, 12));
  c.dsp.input.delaySamples = clamp(Math.round(c.dsp.input.delaySamples), 0, 4800);
  c.dca = clamp(Math.round(c.dca), 0, 4);
  if (!(["master", "g1", "g2"] as string[]).includes(c.route)) c.route = "master";
  if (!(["white", "pink", "sine"] as string[]).includes(c.gen.type)) c.gen.type = "white";
  return c;
}

export function sanitizeMixer(data: unknown): Mixer {
  const d = data as { channels?: unknown } | null;
  if (!d || typeof d !== "object" || !Array.isArray(d.channels) || d.channels.length < 1 || d.channels.length > MAX_CHANNELS) throw new Error("Choose a VOXONE scene file.");
  const def = defaultMixer();
  const m = merge({ ...def, channels: [] as Channel[] }, data);
  const ids = new Set<string>();
  const channels = d.channels.map(cleanChannel).map(c => { while (ids.has(c.id)) c.id = uid(); ids.add(c.id); return c; });
  m.groups = m.groups.map(g => ({ ...g, fader: clamp(g.fader, FADER_MIN, FADER_MAX) }));
  m.master.fader = clamp(m.master.fader, FADER_MIN, FADER_MAX);
  m.dcas = m.dcas.map((x) => ({ ...x, fader: clamp(x.fader, FADER_MIN, FADER_MAX) }));
  m.desk.faderMode = clamp(Math.round(m.desk.faderMode), 0, 3);
  if (!(["0", "-3", "-4.5", "-6"] as string[]).includes(m.desk.panLaw)) m.desk.panLaw = "-3";
  if (!(["peak-post", "peak-pre", "rms-post"] as string[]).includes(m.desk.meterMode)) m.desk.meterMode = "peak-post";
  return { ...m, channels };
}

// Version 1 scenes (4 fixed channels + one voice rack) still load.
export function migrateV1(data: { channels?: { id: string; gain: number; pan: number; mute: boolean; solo: boolean }[]; params?: Record<string, Record<string, unknown>> }): Mixer {
  const m = defaultMixer();
  for (const c of data.channels ?? []) {
    const t = m.channels.find(x => x.id === c.id);
    if (t) Object.assign(t, { fader: clamp(Number(c.gain) || 0, FADER_MIN, FADER_MAX), pan: clamp(Number(c.pan) || 0, -100, 100), mute: !!c.mute, solo: !!c.solo });
  }
  const p = data.params;
  const voice = m.channels[0];
  if (p && voice) {
    voice.dsp = merge(voice.dsp, { input: p["input"], gate: p["gate"], eq: p["eq"], deess: p["deess"], comp: p["comp"], warmth: p["warmth"] });
    m.master = merge(m.master, { fader: (p["output"] as { gain?: number } | undefined)?.gain, mute: (p["output"] as { mute?: boolean } | undefined)?.mute, limiter: p["limiter"] });
  }
  return m;
}

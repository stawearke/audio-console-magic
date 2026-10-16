import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Cable, Power, SlidersHorizontal, Sparkles, Wrench, Waves } from "lucide-react";
import { AudioEngine } from "@/lib/audio-engine";
import { useMidi } from "@/lib/midi";
import { useScenes } from "@/lib/scenes";
import {
  FADER_MAX, FADER_MIN, HUES, MAX_CHANNELS, clamp, defaultMixer, flatDsp, makeChannel, migrateV1, sanitizeMixer, uid, voiceDsp,
  type Channel, type Desk, type Dsp, type Fx, type Group, type Master, type MidiMap, type Mixer, type SourceKind,
} from "@/lib/mixer-state";
import { Button } from "@/components/ui/button";
import { DeskContext, type DeskApi, type View } from "./desk-context";
import { Toggle } from "./controls";
import { Mixer as MixerView } from "./Mixer";
import { ChannelEditor } from "./ChannelEditor";
import { FxView } from "./FxView";
import { PatchView } from "./PatchView";
import { SetupView } from "./SetupView";
import { ObsPlugin } from "./ObsPlugin";

// Presets change the selected channel (and the shared FX returns for the echo preset).
const PRESETS: Record<string, (m: Mixer, id: string) => Mixer> = {
  "Broadcast Voice": (m, id) => withDsp(m, id, voiceDsp()),
  "Noisy Room": (m, id) => withDsp(m, id, { ...voiceDsp(), input: { ...voiceDsp().input, hpf: 110 }, gate: { on: true, threshold: -42, range: -60, attack: 2, release: 120 } }),
  "Radio DJ": (m, id) => { const p = voiceDsp(); p.eq.lowGain = 5; p.eq.lowFreq = 100; p.comp = { on: true, threshold: -28, ratio: 6, attack: 5, release: 150, makeup: 8 }; p.warmth = { on: true, drive: 30 }; return withDsp(m, id, p); },
  "Cave Echo": (m, id) => ({ ...withDsp(m, id, voiceDsp()), channels: withDsp(m, id, voiceDsp()).channels.map((c) => (c.id === id ? { ...c, sends: [-6, -9, c.sends[2] ?? -60] } : c)), fx: { ...m.fx, reverb: { ...m.fx.reverb, size: 3.5, level: -3 }, delay: { ...m.fx.delay, time: 380, feedback: 40, level: -6 } } }),
  Flat: (m, id) => withDsp(m, id, flatDsp()),
};
function withDsp(m: Mixer, id: string, dsp: Dsp): Mixer {
  return { ...m, channels: m.channels.map((c) => (c.id === id ? { ...c, dsp: { ...dsp, input: { ...dsp.input, delaySamples: c.dsp.input.delaySamples }, duck: c.dsp.duck } } : c)) };
}

const STORE = "stream-console-v2";
const NAMES: Record<SourceKind, string> = { mic: "MIC", file: "MEDIA", desktop: "DESKTOP", gen: "TONE" };
const TABS: [View, string, typeof Power][] = [["mixer", "Mixer", SlidersHorizontal], ["channel", "Channel", AudioLines], ["fx", "FX", Sparkles], ["patch", "Patch", Cable], ["setup", "Setup", Wrench]];
const midiToDb = (v: number) => Math.round((FADER_MIN + (v / 127) * (FADER_MAX - FADER_MIN)) * 2) / 2;

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Console() {
  const engine = useRef<AudioEngine | null>(null);
  const getEngine = useCallback(() => { engine.current ??= new AudioEngine(); return engine.current; }, []);
  const [mixer, setMixer] = useState<Mixer>(defaultMixer);
  const mixerRef = useRef(mixer); mixerRef.current = mixer;
  const [selected, setSelected] = useState<string[]>(["voice"]);
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const [view, setView] = useState<View>("mixer");
  const [skin, setSkin] = useState<"hardware" | "modern">("hardware");
  const [active, setActive] = useState<Record<string, boolean>>({});
  const activeRef = useRef(active); activeRef.current = active;
  const [files, setFiles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [programOut, setProgramOutState] = useState("default");
  const [monitorOut, setMonitorOutState] = useState("off");
  const [bank, setBank] = useState(0);
  const bankRef = useRef(bank); bankRef.current = bank;
  const [midiLearn, setMidiLearn] = useState<string | null>(null);
  const learnRef = useRef(midiLearn); learnRef.current = midiLearn;
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const buffers = useRef<Record<string, AudioBuffer>>({});
  const recorder = useRef<MediaRecorder | null>(null);
  const outputsApplied = useRef(false);

  // Restore the last session (and upgrade the old single-rack save).
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || "null");
      if (raw?.mixer) { const m = sanitizeMixer(raw.mixer); setMixer(m); setSelected([m.channels[0]?.id ?? "voice"]); }
      else {
        const old = JSON.parse(localStorage.getItem("stream-console-v1") || "null");
        if (old?.params) setMixer(migrateV1({ params: old.params }));
      }
      const skinSaved = raw?.skin ?? JSON.parse(localStorage.getItem("stream-console-v1") || "null")?.skin;
      if (skinSaved === "hardware" || skinSaved === "modern") setSkin(skinSaved);
    } catch { /* ignore a corrupt save */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ mixer, skin })); } catch { /* storage blocked */ }
    const e = engine.current;
    if (!e?.ready) return;
    e.sync(mixer);
    for (const c of mixer.channels) if (c.kind === "gen" && activeRef.current[c.id]) e.updateGen(c.id, c.gen);
    for (const c of mixer.channels) if (c.kind === "file" && activeRef.current[c.id]) e.setLoop(c.id, c.loop);
  }, [mixer, skin]);

  useEffect(() => () => { void engine.current?.dispose(); }, []);

  // Drop UI state for channels that no longer exist.
  useEffect(() => {
    const ids = new Set(mixer.channels.map((c) => c.id));
    setActive((a) => (Object.keys(a).some((k) => !ids.has(k)) ? Object.fromEntries(Object.entries(a).filter(([k]) => ids.has(k))) : a));
    setSelected((s) => { const keep = s.filter((id) => ids.has(id)); return keep.length === s.length && keep.length ? s : keep.length ? keep : [mixer.channels[0]?.id ?? ""]; });
  }, [mixer.channels]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => () => { if (recorder.current?.state === "recording") recorder.current.stop(); }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const d = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    setInputs(d.filter((x) => x.kind === "audioinput"));
    setOutputs(d.filter((x) => x.kind === "audiooutput"));
  }, []);
  useEffect(() => {
    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  const fail = useCallback((e: unknown) => setError(e instanceof Error ? e.message : "Could not open this audio source."), []);

  // Create the audio graph on first use (needs a click) and apply saved output choices.
  const ready = useCallback(async () => {
    const e = getEngine();
    await e.ensure();
    e.sync(mixerRef.current);
    if (!outputsApplied.current) {
      outputsApplied.current = true;
      await e.setOutput(programOut).catch(() => {});
      if (monitorOut !== "off") await e.setMonitorOutput(monitorOut).catch(() => {});
    }
    return e;
  }, [getEngine, programOut, monitorOut]);

  const setProgramOut = (id: string) => { setProgramOutState(id); setError(null); void getEngine().setOutput(id).catch(() => setError("This browser cannot choose an output. Use Chrome or Edge.")); };
  const setMonitorOut = (id: string) => { setMonitorOutState(id); setError(null); void getEngine().setMonitorOutput(id).catch((e) => fail(e)); };

  // ---- channel actions ----------------------------------------------------------------------
  const startSource = async (id: string) => {
    const ch = mixerRef.current.channels.find((c) => c.id === id);
    if (!ch) return;
    const e = await ready();
    const ended = () => setActive((a) => ({ ...a, [id]: false }));
    if (ch.kind === "mic") { await e.startMic(id, ch.deviceId, ch.dsp.input.browserNS, ch.stereo); void refreshDevices(); }
    else if (ch.kind === "desktop") await e.shareDesktop(id, ended);
    else if (ch.kind === "gen") await e.startGen(id, ch.gen);
    else { const b = buffers.current[id]; if (!b) return; await e.playBuffer(id, b, ch.loop, ended); }
    setActive((a) => ({ ...a, [id]: true }));
  };
  const toggleSource = async (id: string) => {
    setError(null);
    try {
      if (activeRef.current[id]) { getEngine().stopSource(id); setActive((a) => ({ ...a, [id]: false })); return; }
      await startSource(id);
    } catch (e) { fail(e); }
  };
  // Restart a live microphone after its device, channel type or noise suppression changed.
  const restartMic = (id: string) => { if (activeRef.current[id]) setTimeout(() => { startSource(id).catch(fail); }, 60); };

  const loadFile = async (id: string, file?: File) => {
    if (!file) return;
    try {
      const e = await ready();
      buffers.current[id] = await e.loadAudio(file);
      setFiles((f) => ({ ...f, [id]: file.name }));
    } catch (err) { fail(err); }
  };

  const patch = (id: string, p: Partial<Channel>) => {
    setMixer((m) => {
      const base = m.channels.find((c) => c.id === id);
      if (!base) return m;
      const linked = m.desk.multi && selectedRef.current.length > 1 && selectedRef.current.includes(id);
      const targets = linked ? selectedRef.current : [id];
      return { ...m, channels: m.channels.map((c) => {
        if (!targets.includes(c.id)) return c;
        if (c.id === id) return { ...c, ...p };
        const next: Channel = { ...c };
        if (p.fader !== undefined) next.fader = clamp(c.fader + (p.fader - base.fader), FADER_MIN, FADER_MAX);
        if (p.pan !== undefined) next.pan = clamp(c.pan + (p.pan - base.pan), -100, 100);
        if (p.mute !== undefined) next.mute = p.mute;
        if (p.solo !== undefined) next.solo = p.solo;
        if (p.pfl !== undefined) next.pfl = p.pfl;
        return next;
      }) };
    });
    if (p.deviceId !== undefined || p.stereo !== undefined) restartMic(id);
  };
  const patchDsp: DeskApi["patchDsp"] = (id, key, p) => {
    setMixer((m) => ({ ...m, channels: m.channels.map((c) => (c.id === id ? { ...c, dsp: { ...c.dsp, [key]: { ...c.dsp[key], ...p } } as Dsp } : c)) }));
    if (key === "input" && "browserNS" in p) restartMic(id);
  };
  const setSend = (id: string, aux: number, db: number) => patch(id, { sends: (mixerRef.current.channels.find((c) => c.id === id)?.sends ?? [-60, -60, -60]).map((s, i) => (i === aux ? db : s)) });
  const patchGroup = (id: Group["id"], p: Partial<Group>) => setMixer((m) => ({ ...m, groups: m.groups.map((g) => (g.id === id ? { ...g, ...p } : g)) }));
  const patchMaster = (p: Partial<Master>) => setMixer((m) => ({ ...m, master: { ...m.master, ...p } }));
  const patchFx: DeskApi["patchFx"] = (key, p) => setMixer((m) => ({ ...m, fx: { ...m.fx, [key]: { ...m.fx[key], ...p } } as Fx }));
  const patchDesk = (p: Partial<Desk>) => setMixer((m) => ({ ...m, desk: { ...m.desk, ...p } }));

  const addChannel = (kind: SourceKind) => {
    const id = uid();
    setMixer((m) => {
      if (m.channels.length >= MAX_CHANNELS) return m;
      const n = m.channels.filter((c) => c.kind === kind).length + 1;
      return { ...m, channels: [...m.channels, makeChannel(kind, id, `${NAMES[kind]} ${n}`, HUES[m.channels.length % HUES.length] ?? 195)] };
    });
    setSelected([id]);
  };
  const removeChannel = (id: string) => {
    getEngine().stopSource(id);
    delete buffers.current[id];
    setFiles((f) => Object.fromEntries(Object.entries(f).filter(([k]) => k !== id)));
    setMixer((m) => m.channels.length <= 1 ? m : { ...m, channels: m.channels.filter((c) => c.id !== id).map((c) => (c.dsp.duck.source === id ? { ...c, dsp: { ...c.dsp, duck: { ...c.dsp.duck, on: false, source: "" } } } : c)) });
  };
  const select = (id: string, additive?: boolean) => setSelected((s) => (additive ? (s.includes(id) ? (s.length > 1 ? s.filter((x) => x !== id) : s) : [...s, id]) : [id]));
  const clearSolo = () => setMixer((m) => ({ ...m, channels: m.channels.map((c) => ({ ...c, solo: false })) }));
  const clearPfl = () => setMixer((m) => ({ ...m, channels: m.channels.map((c) => ({ ...c, pfl: false })) }));
  const applyMixer = (next: Mixer) => { setMixer((cur) => ({ ...next, desk: { ...next.desk, midi: cur.desk.midi, showLatency: cur.desk.showLatency } })); setSelected([next.channels[0]?.id ?? ""]); };
  const scenes = useScenes(() => mixerRef.current, applyMixer);

  const toggleRecord = async () => {
    if (recording) { recorder.current?.stop(); return; }
    try {
      const eng = await ready();
      if (typeof MediaRecorder === "undefined") throw new Error("Recording is not supported in this browser.");
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(eng.recordingStream, mimeType ? { mimeType } : undefined); const chunks: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => { saveBlob(new Blob(chunks, { type: r.mimeType }), `VOXONE-mix.${r.mimeType.includes("mp4") ? "m4a" : "webm"}`); setRecording(false); };
      recorder.current = r; setSeconds(0); r.start(250); setRecording(true);
    } catch (e) { fail(e); }
  };

  // ---- MIDI desk control --------------------------------------------------------------------
  const onCc = (cc: number, val: number) => {
    const m = mixerRef.current, map = m.desk.midi.map, press = val >= 64;
    const learn = learnRef.current as keyof MidiMap | null;
    if (learn) { patchDesk({ midi: { ...m.desk.midi, map: { ...map, [learn]: cc } } }); setMidiLearn(null); return; }
    const inRange = (base: number) => cc >= base && cc < base + 8;
    const chAt = (base: number) => m.channels[bankRef.current * 8 + cc - base];
    const banks = Math.max(1, Math.ceil(m.channels.length / 8));
    if (cc === map.master) { patchMaster({ fader: midiToDb(val) }); return; }
    if (inRange(map.fader)) { const c = chAt(map.fader); if (c) patch(c.id, { fader: midiToDb(val) }); return; }
    if (inRange(map.pan)) { const c = chAt(map.pan); if (c) patch(c.id, { pan: Math.round((val / 127) * 200 - 100) }); return; }
    if (inRange(map.solo)) { const c = chAt(map.solo); if (c && press) patch(c.id, { solo: !c.solo }); return; }
    if (inRange(map.mute)) { const c = chAt(map.mute); if (c && press) patch(c.id, { mute: !c.mute }); return; }
    if (inRange(map.pfl)) { const c = chAt(map.pfl); if (c && press) patch(c.id, { pfl: !c.pfl }); return; }
    if (inRange(map.sel)) { const c = chAt(map.sel); if (c && press) select(c.id); return; }
    if (!press) return;
    if (cc === map.bankNext) setBank(Math.min(banks - 1, bankRef.current + 1));
    else if (cc === map.bankPrev) setBank(Math.max(0, bankRef.current - 1));
    else if (cc === map.chanNext || cc === map.chanPrev) {
      const i = m.channels.findIndex((c) => c.id === selectedRef.current[0]);
      const n = m.channels[clamp(i + (cc === map.chanNext ? 1 : -1), 0, m.channels.length - 1)];
      if (n) select(n.id);
    } else if (cc === map.tap) void toggleRecord();
  };
  const midi = useMidi(mixer.desk.midi.on, mixer.desk.midi.inputId, onCc);

  const selectedIds = selected.filter((id) => mixer.channels.some((c) => c.id === id));
  const primary = mixer.channels.find((c) => c.id === selectedIds[0]) ?? (mixer.channels[0] as Channel);
  const firstMic = mixer.channels.find((c) => c.kind === "mic");

  const api: DeskApi = {
    mixer, setMixer, getEngine, selected: selectedIds, primary, select, view, setView, active, files, inputs, outputs,
    programOut, monitorOut, setProgramOut, setMonitorOut, patch, patchDsp, patchGroup, patchMaster, patchFx, patchDesk, setSend,
    toggleSource, loadFile, addChannel, removeChannel, clearSolo, clearPfl, fail, bank, setBank, midiLearn, setMidiLearn,
    midiInputs: midi.inputs, midiStatus: midi.status, recording, seconds, toggleRecord, scenes, applyMixer,
  };

  return (
    <DeskContext.Provider value={api}>
      <div data-skin={skin} className="console-root min-h-screen px-3 py-6 md:px-8">
        <div className="console-chassis mx-auto max-w-[1600px] rounded-lg p-4 md:p-6">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="brand text-2xl font-black md:text-3xl">VOX<span className="brand-accent">ONE</span> <span className="brand-model">D12</span></h1>
              <p className="label-text mt-1 text-[10px]">DIGITAL MIXING CONSOLE · {mixer.channels.length} CHANNELS / 2 GROUPS / 3 AUX / STEREO</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Load channel preset" className="console-select rounded px-2 py-1.5 text-xs" value="" onChange={(e) => { const f = PRESETS[e.target.value]; if (f) setMixer((m) => f(m, primary.id)); }}>
                <option value="">Preset for {primary.name}…</option>
                {Object.keys(PRESETS).map((k) => <option key={k}>{k}</option>)}
              </select>
              <select aria-label="Recall scene" className="console-select rounded px-2 py-1.5 text-xs" value="" onChange={(e) => { const i = Number(e.target.value); if (Number.isInteger(i)) scenes.recall(i); }}>
                <option value="">{scenes.current >= 0 ? `Scene: ${scenes.slots[scenes.current]?.name ?? ""}` : "No scene"}</option>
                {scenes.slots.map((s, i) => s && <option key={i} value={i}>{i + 1} · {s.name}</option>)}
              </select>
              <Toggle on={skin === "modern"} onClick={() => setSkin(skin === "hardware" ? "modern" : "hardware")}>{skin === "hardware" ? "Hardware look" : "Modern look"}</Toggle>
              {firstMic && (active[firstMic.id]
                ? <Button variant="ghost" onClick={() => void toggleSource(firstMic.id)} className="power-btn rounded-md px-4 py-2 text-xs font-bold uppercase tracking-widest" data-on="true">● Live — Stop</Button>
                : <Button variant="ghost" onClick={() => void toggleSource(firstMic.id)} className="power-btn rounded-md px-4 py-2 text-xs font-bold uppercase tracking-widest" data-on="false"><Power className="size-4" />Start mic</Button>)}
            </div>
          </header>

          {error && <p role="alert" className="error-box mb-4 rounded-md p-3 text-sm">{error}</p>}

          <nav aria-label="Console view" className="console-tabs mb-4 flex gap-1">
            {TABS.map(([key, label, Icon]) => (
              <Button key={key} variant="ghost" className="console-tab" aria-pressed={view === key} data-on={view === key} onClick={() => setView(key)}><Icon />{label}</Button>
            ))}
            <span className="desk-bus-label">MAIN LR <Waves className="size-3" /><span className="status-dot" data-on={Object.values(active).some(Boolean)} /></span>
          </nav>

          {view === "mixer" && <MixerView />}
          {view === "channel" && <ChannelEditor />}
          {view === "fx" && <FxView />}
          {view === "patch" && <PatchView />}
          {view === "setup" && <SetupView />}

          <ObsPlugin />
          <details className="obs-help mt-4 rounded-lg p-4 text-sm">
            <summary className="module-title cursor-pointer text-xs font-bold uppercase tracking-[0.2em]">How to connect to OBS</summary>
            <ol className="label-text mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed">
              <li>On Windows, open OBS and add <b>Application Audio Capture</b>. Choose the Chrome or Edge window running VOXONE.</li>
              <li>Start your microphone here, then mute the raw microphone source in OBS to avoid doubled audio.</li>
              <li>Keep Program output on your headphones or default output. OBS captures the browser’s entire mix, including music and samples.</li>
              <li>Use the Monitor output (FX tab) for a separate headphone mix, and PFL to preview a channel without sending it to the stream.</li>
              <li>On systems without application capture, select a virtual cable or an audio interface loopback as Program output.</li>
            </ol>
          </details>
        </div>
      </div>
    </DeskContext.Provider>
  );
}

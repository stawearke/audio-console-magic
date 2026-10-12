import { useEffect, useRef, useState } from "react";
import { Download, FileAudio, Mic, Monitor, Music2, Play, Power, Radio, Square, Upload, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AudioEngine, levelDb, type Params } from "@/lib/audio-engine";
import { Fader, Knob, Meter, Toggle } from "./controls";

type Channel = { id: string; name: string; gain: number; pan: number; mute: boolean; solo: boolean };
const initial: Channel[] = [
  { id: "voice", name: "VOICE", gain: 0, pan: 0, mute: false, solo: false },
  { id: "music", name: "MUSIC", gain: -12, pan: 0, mute: false, solo: false },
  { id: "desktop", name: "DESKTOP", gain: -6, pan: 0, mute: false, solo: false },
  { id: "sample", name: "SOUNDPAD", gain: -6, pan: 0, mute: false, solo: false },
];
const icons = [Mic, Music2, Monitor, Radio];
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Mixer({ getEngine, params, setParams, running, start, stop, inputs, outputs, inId, outId, onInput, onOutput, onError }: {
  getEngine: () => AudioEngine; params: Params; setParams: (p: Params) => void; running: boolean; start: () => Promise<void>; stop: () => Promise<void>;
  inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[]; inId: string; outId: string; onInput: (id: string) => void; onOutput: (id: string) => void; onError: (message: string) => void;
}) {
  const [channels, setChannels] = useState(initial);
  const [playing, setPlaying] = useState<Record<string, boolean>>({});
  const [files, setFiles] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const buffers = useRef<Record<string, AudioBuffer>>({});
  const recorder = useRef<MediaRecorder | null>(null);
  const sceneInput = useRef<HTMLInputElement>(null);
  const audioInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const meterBuffers = useRef<Record<string, Float32Array<ArrayBuffer>>>({});
  const anySolo = channels.some(c => c.solo);
  const sync = () => channels.forEach(c => getEngine().setChannel(c.id, c.gain, c.pan, !c.mute && (!anySolo || c.solo)));
  useEffect(() => { sync(); }, [channels, running, playing]);
  useEffect(() => { if (!recording) return; const t = setInterval(() => setSeconds(s => s + 1), 1000); return () => clearInterval(t); }, [recording]);
  useEffect(() => () => { if (recorder.current?.state === "recording") recorder.current.stop(); }, []);
  const update = (id: string, patch: Partial<Channel>) => setChannels(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c));
  const fail = (e: unknown) => onError(e instanceof Error ? e.message : "Could not open this audio source.");
  const load = async (id: string, file?: File) => { if (!file) return; try { buffers.current[id] = await getEngine().loadAudio(file); getEngine().apply(params); sync(); setFiles(f => ({ ...f, [id]: file.name })); } catch (e) { fail(e); } };
  const play = async (id: string) => {
    try {
      if (playing[id]) { getEngine().stopSource(id); setPlaying(p => ({ ...p, [id]: false })); return; }
      const ended = () => setPlaying(p => ({ ...p, [id]: false }));
      if (id === "desktop") await getEngine().shareDesktop(ended);
      else { const b = buffers.current[id]; if (!b) return; await getEngine().playBuffer(id, b, id === "music", ended); }
      getEngine().apply(params); sync(); setPlaying(p => ({ ...p, [id]: true }));
    } catch (e) { fail(e); }
  };
  const record = async () => {
    if (recording) { recorder.current?.stop(); return; }
    try {
      const eng = getEngine(); if (!eng.ctx) await eng.init(); await eng.ctx.resume(); eng.apply(params); sync();
      if (typeof MediaRecorder === "undefined") throw new Error("Recording is not supported in this browser.");
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(t => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(eng.recordingStream, mimeType ? { mimeType } : undefined); const chunks: Blob[] = [];
      r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => { saveBlob(new Blob(chunks, { type: r.mimeType }), `VOXONE-mix.${r.mimeType.includes("mp4") ? "m4a" : "webm"}`); setRecording(false); };
      recorder.current = r; setSeconds(0); r.start(250); setRecording(true);
    } catch (e) { fail(e); }
  };
  const recall = async (file?: File) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.version !== 1 || !Array.isArray(data.channels) || data.channels.length !== 4) throw new Error("Choose a VOXONE scene file.");
      const next = initial.map(base => {
        const c = data.channels.find((item: Channel) => item.id === base.id);
        if (!c || !Number.isFinite(c.gain) || c.gain < -30 || c.gain > 12 || !Number.isFinite(c.pan) || Math.abs(c.pan) > 100 || typeof c.mute !== "boolean" || typeof c.solo !== "boolean") throw new Error("Invalid channel settings in scene.");
        return { ...base, gain: c.gain, pan: c.pan, mute: c.mute, solo: c.solo };
      });
      for (const key of Object.keys(params) as (keyof Params)[]) {
        const group = data.params?.[key];
        for (const [name, value] of Object.entries(params[key])) if (typeof group?.[name] !== typeof value || (typeof value === "number" && (!Number.isFinite(group[name]) || Math.abs(group[name]) > 20000))) throw new Error("Invalid processing settings in scene.");
      }
      setChannels(next); setParams(data.params);
    } catch (e) { fail(e); }
  };
  const read = (id: string) => () => {
    const an = getEngine().analyser(id); if (!an) return -100;
    meterBuffers.current[id] ??= new Float32Array(1024);
    return levelDb(an, meterBuffers.current[id]);
  };
  const outputBuffer = useRef(new Float32Array(2048));
  return <section className="mixer-surface">
    <div className="mixer-toolbar flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2"><span className="status-dot" data-on={running || Object.values(playing).some(Boolean)} /><span className="label-text text-[10px] uppercase tracking-widest">{running || Object.values(playing).some(Boolean) ? "Audio engine active" : "Audio engine standby"}</span></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" className="console-btn" onClick={() => saveBlob(new Blob([JSON.stringify({ version: 1, channels, params }, null, 2)], { type: "application/json" }), "VOXONE-scene.json")}><Download />Save scene</Button>
        <Button variant="ghost" size="sm" className="console-btn" onClick={() => sceneInput.current?.click()}><Upload />Recall</Button>
        <input ref={sceneInput} type="file" accept=".json" hidden onChange={e => { recall(e.target.files?.[0]); e.target.value = ""; }} />
        <Button variant="ghost" size="sm" className="console-btn record-control" data-on={recording} onClick={record}>{recording ? <Square /> : <span className="record-dot" />}{recording ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} Stop` : "Record mix"}</Button>
      </div>
    </div>
    <div className="mixer-bank">
      {channels.map((ch, i) => { const Icon = icons[i] ?? Mic; const active = ch.id === "voice" ? running : playing[ch.id]; return <div key={ch.id} className="channel-strip" data-channel={ch.id}>
        <div className="channel-heading flex items-center justify-between"><span className="readout text-xs">0{i + 1}</span><Icon className="size-4 label-text" /></div>
        <h2 className="mt-3 text-sm font-bold tracking-widest">{ch.name}</h2>
        <div className="channel-source mt-1 truncate text-[10px] label-text" title={files[ch.id]}>{ch.id === "voice" ? "Processed microphone" : ch.id === "desktop" ? "Shared tab / screen" : files[ch.id] || "No audio loaded"}</div>
        <div className="source-controls mt-3 flex gap-1">
          {ch.id === "voice" ? <Button variant="ghost" size="sm" className="console-btn w-full" onClick={active ? stop : start}><Power />{active ? "Stop mic" : "Start mic"}</Button> : <>
            {ch.id !== "desktop" && <><input hidden type="file" accept="audio/*" ref={el => { audioInputs.current[ch.id] = el; }} onChange={e => { load(ch.id, e.target.files?.[0]); e.target.value = ""; }} /><Button variant="ghost" size="icon" className="console-btn size-8" title={`Load ${ch.name.toLowerCase()} audio`} aria-label={`Load ${ch.name.toLowerCase()} audio`} onClick={() => audioInputs.current[ch.id]?.click()}><FileAudio /></Button></>}
            <Button variant="ghost" size="sm" className="console-btn flex-1" disabled={ch.id !== "desktop" && !files[ch.id]} onClick={() => play(ch.id)}>{active ? <Square /> : ch.id === "desktop" ? <Monitor /> : <Play />}{ch.id === "desktop" ? active ? "Stop" : "Share" : active ? "Stop" : "Play"}</Button>
          </>}
        </div>
        <div className="my-4 flex justify-center"><Knob label={`${ch.name} pan`} value={ch.pan} min={-100} max={100} def={0} onChange={v => update(ch.id, { pan: v })} /></div>
        <div className="flex justify-center gap-4"><div className="fader-scale label-text flex h-40 flex-col justify-between text-[9px]"><span>+12</span><span>0</span><span>−12</span><span>−30</span></div><Fader label={`${ch.name} level`} value={ch.gain} onChange={v => update(ch.id, { gain: v })} /><Meter label="Signal" read={read(ch.id)} /></div>
        <div className="mt-4 flex justify-center gap-2"><Toggle on={ch.mute} onClick={() => update(ch.id, { mute: !ch.mute })}>Mute</Toggle><Toggle on={ch.solo} onClick={() => update(ch.id, { solo: !ch.solo })}>Solo</Toggle></div>
        <div className="channel-foot mt-4 text-center text-[9px] uppercase tracking-widest" data-on={active}>{active ? "● On air" : "Standby"}</div>
      </div>; })}
      <div className="channel-strip master-strip">
        <div className="channel-heading flex items-center justify-between"><span className="readout text-xs">LR</span><Volume2 className="size-4" /></div>
        <h2 className="mt-3 text-sm font-bold tracking-widest">MASTER</h2><div className="mt-1 text-[10px] label-text">Stereo program bus</div>
        <div className="my-3 flex justify-center"><Knob label="Ceiling" value={params.limiter.ceiling} min={-12} max={0} step={0.5} unit="dB" onChange={v => setParams({ ...params, limiter: { ...params.limiter, ceiling: v } })} /></div>
        <div className="mb-4 flex justify-center"><Toggle on={params.limiter.on} onClick={() => setParams({ ...params, limiter: { ...params.limiter, on: !params.limiter.on } })}>Limiter</Toggle></div>
        <div className="flex justify-center gap-4"><Fader label="Master level" value={params.output.gain} onChange={v => setParams({ ...params, output: { ...params.output, gain: v } })} /><Meter label="Out" read={() => { const a = getEngine().outAnalyser; return a ? levelDb(a, outputBuffer.current) : -100; }} /></div>
        <div className="mt-4 flex justify-center"><Toggle on={params.output.mute} onClick={() => setParams({ ...params, output: { ...params.output, mute: !params.output.mute } })}>Mute all</Toggle></div>
        <div className="channel-foot mt-4 text-center text-[9px] uppercase tracking-widest">Program output</div>
      </div>
    </div>
    <div className="routing-bar grid gap-4 p-4 md:grid-cols-2">
      <label className="label-text text-[10px] uppercase tracking-widest">Voice input<select aria-label="Voice input" className="console-select mt-2 block w-full rounded p-2 text-xs" value={inId} onChange={e => onInput(e.target.value)}><option value="">Default microphone</option>{inputs.filter(d => d.deviceId !== "default").map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || "Microphone"}</option>)}</select></label>
      <label className="label-text text-[10px] uppercase tracking-widest">Program output<select aria-label="Program output" className="console-select mt-2 block w-full rounded p-2 text-xs" value={outId} onChange={e => onOutput(e.target.value)}><option value="default">Default output · OBS application capture</option>{outputs.filter(d => d.deviceId !== "default").map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || "Audio output"}</option>)}</select></label>
    </div>
  </section>;
}
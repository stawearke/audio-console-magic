import { useRef } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { migrateV1, sanitizeMixer, defaultMidiMap, type MeterMode, type MidiMap, type PanLaw } from "@/lib/mixer-state";
import { useDesk } from "./desk-context";
import { Module, NumberField, Toggle } from "./controls";

const MAP_ROWS: [keyof MidiMap, string][] = [
  ["fader", "Fader"], ["pan", "Pan"], ["solo", "Solo"], ["mute", "Mute"], ["pfl", "PFL"], ["sel", "Select"],
  ["master", "Master"], ["bankPrev", "Bank <"], ["bankNext", "Bank >"], ["chanPrev", "Chan <"], ["chanNext", "Chan >"], ["tap", "Record"],
];

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SetupView() {
  const d = useDesk();
  const { desk } = d.mixer;
  const file = useRef<HTMLInputElement>(null);
  const setMidi = (p: Partial<typeof desk.midi>) => d.patchDesk({ midi: { ...desk.midi, ...p } });
  const recall = async (f?: File) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.version === 1) { if (!Array.isArray(data.channels) || data.channels.length !== 4) throw new Error("Choose a VOXONE scene file."); d.applyMixer(migrateV1(data)); }
      else if (data.version === 2) d.applyMixer(sanitizeMixer(data.mixer));
      else throw new Error("Choose a VOXONE scene file.");
    } catch (e) { d.fail(e); }
  };
  return <div className="grid gap-3 lg:grid-cols-2">
    <Module title="Desk properties">
      <div className="grid w-full gap-3 sm:grid-cols-2">
        <label className="label-text text-[10px] uppercase tracking-widest">Pan law
          <select aria-label="Pan law" className="console-select mt-1 block w-full rounded px-2 py-1.5 text-xs" value={desk.panLaw} onChange={(e) => d.patchDesk({ panLaw: e.target.value as PanLaw })}>
            <option value="0">0 dB (centre)</option><option value="-3">−3 dB (equal power)</option><option value="-4.5">−4.5 dB</option><option value="-6">−6 dB (linear)</option>
          </select>
        </label>
        <label className="label-text text-[10px] uppercase tracking-widest">Meters
          <select aria-label="Meters" className="console-select mt-1 block w-full rounded px-2 py-1.5 text-xs" value={desk.meterMode} onChange={(e) => d.patchDesk({ meterMode: e.target.value as MeterMode })}>
            <option value="peak-post">Peak · post fader</option><option value="peak-pre">Peak · pre fader</option><option value="rms-post">RMS · post fader</option>
          </select>
        </label>
      </div>
      <div className="flex w-full flex-wrap gap-2">
        <Toggle on={desk.multi} title="Move all selected channels together. Shift-click strips to select several." onClick={() => d.patchDesk({ multi: !desk.multi })}>Multi-selection</Toggle>
        <Toggle on={desk.showLatency} onClick={() => d.patchDesk({ showLatency: !desk.showLatency })}>Show latency</Toggle>
      </div>
    </Module>

    <Module title="Scenes">
      <div className="grid w-full gap-1.5">
        {d.scenes.slots.map((s, i) => (
          <div key={i} className="scene-row" data-on={d.scenes.current === i}>
            <span className="readout w-5 text-[10px]">{i + 1}</span>
            {s ? <input aria-label={`Scene ${i + 1} name`} className="console-select min-w-0 flex-1 rounded px-2 py-1 text-xs" value={s.name} onChange={(e) => d.scenes.rename(i, e.target.value)} /> : <span className="label-text flex-1 text-xs">Empty</span>}
            <Button variant="ghost" size="sm" className="console-btn h-7" onClick={() => d.scenes.store(i)}>Store</Button>
            <Button variant="ghost" size="sm" className="console-btn h-7" disabled={!s} onClick={() => d.scenes.recall(i)}>Recall</Button>
            <Button variant="ghost" size="sm" className="console-btn h-7" disabled={!s} onClick={() => d.scenes.clear(i)}>Clear</Button>
          </div>
        ))}
      </div>
      <div className="flex w-full flex-wrap gap-2">
        <Button variant="ghost" size="sm" className="console-btn" onClick={() => saveBlob(new Blob([JSON.stringify({ version: 2, mixer: d.mixer }, null, 2)], { type: "application/json" }), "VOXONE-scene.json")}><Download />Save to file</Button>
        <Button variant="ghost" size="sm" className="console-btn" onClick={() => file.current?.click()}><Upload />Load from file</Button>
        <input ref={file} type="file" accept=".json" hidden onChange={(e) => { void recall(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
    </Module>

    <div className="lg:col-span-2">
      <Module title="MIDI desk control" on={desk.midi.on} onToggle={() => setMidi({ on: !desk.midi.on })}>
        <div className="flex w-full flex-wrap items-center gap-3">
          <select aria-label="MIDI input" className="console-select rounded px-2 py-1.5 text-xs" value={desk.midi.inputId} onChange={(e) => setMidi({ inputId: e.target.value })}>
            <option value="">All MIDI inputs</option>
            {d.midiInputs.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <span className="label-text text-xs">{d.midiStatus === "ready" ? `${d.midiInputs.length} input${d.midiInputs.length === 1 ? "" : "s"} found` : d.midiStatus === "unsupported" ? "Web MIDI needs Chrome or Edge" : d.midiStatus === "denied" ? "MIDI access was blocked" : "Turn on to connect a controller"}</span>
          <Button variant="ghost" size="sm" className="console-btn" onClick={() => setMidi({ map: { ...defaultMidiMap } })}>Reset map</Button>
        </div>
        <p className="label-text w-full text-xs">Fader, pan, solo, mute, PFL and select use eight consecutive controller numbers per bank, starting at the number shown. Click Learn, then move a control on your device.</p>
        <div className="midi-map w-full">
          {MAP_ROWS.map(([key, label]) => (
            <div key={key} className="midi-cell">
              <span className="label-text text-[10px] uppercase tracking-widest">{label}</span>
              <NumberField label={`${label} controller number`} value={desk.midi.map[key]} min={0} max={127} onChange={(v) => setMidi({ map: { ...desk.midi.map, [key]: v } })} />
              <button type="button" className="learn-btn" data-on={d.midiLearn === key} onClick={() => d.setMidiLearn(d.midiLearn === key ? null : key)}>{d.midiLearn === key ? "Move a control…" : "Learn"}</button>
            </div>
          ))}
        </div>
      </Module>
    </div>
  </div>;
}

import { useState } from "react";
import { Plus, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_CHANNELS, type SourceKind } from "@/lib/mixer-state";
import { auxLabel } from "@/lib/aux-labels";
import { useDesk } from "./desk-context";
import { ChannelOverview } from "./ChannelOverview";
import { ChannelStrip, GroupStrip, MasterStrip } from "./Strips";
import { Toggle } from "./controls";

const ADD: [SourceKind, string][] = [["mic", "Microphone"], ["file", "Audio file"], ["desktop", "Desktop audio"], ["gen", "Signal generator"]];
const LAYERS = [["all", "All"], ["a", "1–8"], ["b", "9–16"], ["inputs", "Mic / Gen"], ["media", "Media"]] as const;
type Layer = (typeof LAYERS)[number][0];

export function Mixer() {
  const d = useDesk();
  const { mixer } = d;
  const [layer, setLayer] = useState<Layer>("all");
  const anyActive = Object.values(d.active).some(Boolean);
  const anySolo = mixer.channels.some((c) => c.solo), anyPfl = mixer.channels.some((c) => c.pfl);
  const midiOn = mixer.desk.midi.on;
  const lat = d.getEngine().ready ? d.getEngine().latency() : null;
  const visible = mixer.channels.map((ch, i) => ({ ch, i })).filter(({ ch, i }) =>
    layer === "all" || (layer === "a" && i < 8) || (layer === "b" && i >= 8) || (layer === "inputs" && (ch.kind === "mic" || ch.kind === "gen")) || (layer === "media" && (ch.kind === "file" || ch.kind === "desktop")));
  return <section className="mixer-surface">
    <ChannelOverview />
    <div className="mixer-toolbar flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="status-dot" data-on={anyActive} />
        <span className="label-text text-[10px] uppercase tracking-widest">{anyActive ? "Audio engine active" : "Audio engine standby"}</span>
        {mixer.desk.showLatency && lat && <span className="readout text-[10px]">{(lat.base + lat.output).toFixed(1)} ms · {lat.sampleRate / 1000} kHz</span>}
        {midiOn && <span className="readout text-[10px]">BANK {d.bank + 1}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Program output" title="Program output (main mix)" className="console-select max-w-44 rounded px-2 py-1.5 text-xs" value={d.programOut} onChange={(e) => d.setProgramOut(e.target.value)}>
          <option value="default">Out: Default</option>
          {d.outputs.filter((o) => o.deviceId !== "default").map((o) => <option key={o.deviceId} value={o.deviceId}>Out: {o.label || "Audio output"}</option>)}
        </select>
        <select aria-label="Monitor output" title="Headphone monitor output" className="console-select max-w-44 rounded px-2 py-1.5 text-xs" value={d.monitorOut} onChange={(e) => d.setMonitorOut(e.target.value)}>
          <option value="off">Mon: Off</option>
          {d.outputs.filter((o) => o.deviceId !== "default").map((o) => <option key={o.deviceId} value={o.deviceId}>Mon: {o.label || "Audio output"}</option>)}
        </select>
        <Button variant="ghost" size="sm" className="console-btn" disabled={!anySolo} onClick={d.clearSolo}>Clear solo</Button>
        <Button variant="ghost" size="sm" className="console-btn" disabled={!anyPfl} onClick={d.clearPfl}>Clear PFL</Button>
        <select aria-label="Add channel" className="console-select rounded px-2 py-1.5 text-xs" value="" disabled={mixer.channels.length >= MAX_CHANNELS}
          onChange={(e) => { const k = ADD.find(([kind]) => kind === e.target.value)?.[0]; if (k) d.addChannel(k); }}>
          <option value="">+ Add channel…</option>
          {ADD.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
        </select>
        <Button variant="ghost" size="sm" className="console-btn record-control" data-on={d.recording} onClick={() => void d.toggleRecord()}>
          {d.recording ? <Square /> : <span className="record-dot" />}{d.recording ? `${Math.floor(d.seconds / 60)}:${String(d.seconds % 60).padStart(2, "0")} Stop` : "Record mix"}
        </Button>
      </div>
    </div>
    <div className="desk-modes">
      <div className="mode-group" role="group" aria-label="Layer"><span className="desk-caption">LAYER</span>
        {LAYERS.map(([k, label]) => <button key={k} type="button" className="mode-chip" aria-pressed={layer === k} data-on={layer === k} onClick={() => setLayer(k)}>{label}</button>)}
      </div>
      <div className="mode-group" role="group" aria-label="Fader mode"><span className="desk-caption">FADERS</span>
        <button type="button" className="mode-chip" aria-pressed={mixer.desk.faderMode === 0} data-on={mixer.desk.faderMode === 0} onClick={() => d.patchDesk({ faderMode: 0 })}>Level</button>
        {[0, 1, 2].map((i) => <button key={i} type="button" className="mode-chip" aria-pressed={mixer.desk.faderMode === i + 1} data-on={mixer.desk.faderMode === i + 1} data-aux="true" onClick={() => d.patchDesk({ faderMode: i + 1 })}>{auxLabel(i)}</button>)}
      </div>
      <div className="mode-group" role="group" aria-label="Mute groups"><span className="desk-caption">MUTE GRP</span>
        {mixer.muteGroups.map((g, i) => <button key={i} type="button" className="mode-chip" data-hot="true" aria-pressed={g.on} data-on={g.on} onClick={() => d.toggleMuteGroup(i)}>{i + 1}</button>)}
      </div>
      <Toggle on={mixer.desk.compact} onClick={() => d.patchDesk({ compact: !mixer.desk.compact })} title="Narrow strips so 16 channels fit on screen">Compact view</Toggle>
    </div>
    <div className="mixer-bank" data-compact={mixer.desk.compact} role="group" aria-label="Channel strips">
      {visible.map(({ ch, i }) => <ChannelStrip key={ch.id} ch={ch} index={i} />)}
      <button type="button" className="add-strip" onClick={() => d.addChannel("mic")} disabled={mixer.channels.length >= MAX_CHANNELS} aria-label="Add microphone channel"><Plus className="size-5" />Add</button>
      <MasterStrip />
    </div>
  </section>;
}

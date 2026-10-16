import { Plus, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_CHANNELS, type SourceKind } from "@/lib/mixer-state";
import { useDesk } from "./desk-context";
import { ChannelOverview } from "./ChannelOverview";
import { ChannelStrip, GroupStrip, MasterStrip } from "./Strips";

const ADD: [SourceKind, string][] = [["mic", "Microphone"], ["file", "Audio file"], ["desktop", "Desktop audio"], ["gen", "Signal generator"]];

export function Mixer() {
  const d = useDesk();
  const { mixer } = d;
  const anyActive = Object.values(d.active).some(Boolean);
  const anySolo = mixer.channels.some((c) => c.solo), anyPfl = mixer.channels.some((c) => c.pfl);
  const midiOn = mixer.desk.midi.on;
  const lat = d.getEngine().ready ? d.getEngine().latency() : null;
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
    <div className="mixer-bank" role="group" aria-label="Channel strips">
      {mixer.channels.map((ch, i) => <ChannelStrip key={ch.id} ch={ch} index={i} />)}
      <button type="button" className="add-strip" onClick={() => d.addChannel("mic")} disabled={mixer.channels.length >= MAX_CHANNELS} aria-label="Add microphone channel"><Plus className="size-5" />Add</button>
      {mixer.groups.map((g) => <GroupStrip key={g.id} g={g} />)}
      <MasterStrip />
    </div>
  </section>;
}

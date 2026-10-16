import { useCallback } from "react";
import { Headphones, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDesk } from "./desk-context";
import { EqGraph } from "./EqGraph";
import { Knob, Toggle } from "./controls";

const KIND_LABEL = { mic: "MIC / INSERT CHAIN", file: "FILE PLAYER", desktop: "DESKTOP AUDIO", gen: "SIGNAL GENERATOR" } as const;

// Selected-channel panel above the strips: duplicates the key controls so they always edit the same state.
export function ChannelOverview() {
  const d = useDesk();
  const ch = d.primary;
  const number = d.mixer.channels.findIndex((c) => c.id === ch.id) + 1;
  const dsp = ch.dsp;
  const analyser = useCallback(() => d.getEngine().channelAnalyser(ch.id), [d, ch.id]);
  const multi = d.selected.length > 1;
  return <div className="selected-channel">
    <div className="selected-identity">
      <span className="desk-caption">SELECTED CHANNEL{multi ? ` · +${d.selected.length - 1} LINKED` : ""}</span>
      <div className="selected-display"><span className="selected-number">{String(number).padStart(2, "0")}</span><div><h2>{ch.name}</h2><span>{KIND_LABEL[ch.kind]}</span></div><SlidersHorizontal className="size-5" /></div>
      <div className="flex flex-wrap gap-2">
        <Toggle on={ch.mute} onClick={() => d.patch(ch.id, { mute: !ch.mute })}>Mute</Toggle>
        <Toggle on={ch.solo} onClick={() => d.patch(ch.id, { solo: !ch.solo })}><Headphones className="size-3" />Solo</Toggle>
        <Button variant="ghost" size="sm" className="console-btn h-7" onClick={() => d.setView("channel")}>Edit channel</Button>
      </div>
    </div>
    <div className="selected-processing">
      <span className="desk-caption">CHANNEL PROCESSING</span>
      <div className="flex items-start justify-center gap-2">
        <Knob label="Preamp" value={dsp.input.gain} min={-20} max={30} unit="dB" def={0} onChange={(gain) => d.patchDsp(ch.id, "input", { gain })} />
        <Knob label="Low cut" value={dsp.input.hpf} min={20} max={400} log unit="Hz" def={80} onChange={(hpf) => d.patchDsp(ch.id, "input", { hpf, hpfOn: true })} />
        <Knob label="Comp" value={dsp.comp.threshold} min={-60} max={0} unit="dB" def={-20} onChange={(threshold) => d.patchDsp(ch.id, "comp", { threshold })} />
        <Knob label={ch.stereo ? "Balance" : "Pan"} value={ch.pan} min={-100} max={100} def={0} bipolar onChange={(pan) => d.patch(ch.id, { pan })} />
      </div>
    </div>
    <div className="selected-eq">
      <div className="flex items-center justify-between"><span className="desk-caption">PARAMETRIC EQ</span><span className="label-text text-[9px]">4 BAND · DRAG POINTS</span></div>
      <EqGraph eq={dsp.eq} getAnalyser={analyser} onChange={(p) => d.patchDsp(ch.id, "eq", p)} />
      <div className="eq-axis"><span>20</span><span>100</span><span>1k</span><span>10k</span><span>20k Hz</span></div>
    </div>
    <div className="selected-inserts">
      <span className="desk-caption">INSERTS</span>
      <div className="insert-grid">{([["gate", "GATE"], ["comp", "COMP"], ["deess", "DE-ESS"], ["eq", "EQ"]] as const).map(([key, label]) => <Toggle key={key} on={dsp[key].on} onClick={() => d.patchDsp(ch.id, key, { on: !dsp[key].on })}>{label}</Toggle>)}</div>
    </div>
  </div>;
}

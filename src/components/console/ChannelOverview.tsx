import { useCallback } from "react";
import { Headphones, SlidersHorizontal } from "lucide-react";
import type { AudioEngine, Params } from "@/lib/audio-engine";
import { EqGraph } from "./EqGraph";
import { Knob, Toggle } from "./controls";

export function ChannelOverview({ channel, number, params, setParams, getEngine, update }: {
  channel: { id: string; name: string; gain: number; pan: number; mute: boolean; solo: boolean };
  number: number; params: Params; setParams: (p: Params) => void; getEngine: () => AudioEngine;
  update: (patch: { gain?: number; pan?: number; mute?: boolean; solo?: boolean }) => void;
}) {
  const filters = useCallback(() => getEngine().eqFilters ?? [], [getEngine]);
  const analyser = useCallback(() => getEngine().analyser(channel.id) ?? null, [getEngine, channel.id]);
  const voice = channel.id === "voice";
  return <div className="selected-channel">
    <div className="selected-identity">
      <span className="desk-caption">SELECTED CHANNEL</span>
      <div className="selected-display"><span className="selected-number">{String(number).padStart(2, "0")}</span><div><h2>{channel.name}</h2><span>{voice ? "MIC / INSERT CHAIN" : "STEREO / PROGRAM BUS"}</span></div><SlidersHorizontal className="size-5" /></div>
      <div className="flex gap-2"><Toggle on={channel.mute} onClick={() => update({ mute: !channel.mute })}>Mute</Toggle><Toggle on={channel.solo} onClick={() => update({ solo: !channel.solo })}><Headphones className="size-3" />Solo</Toggle></div>
    </div>
    <div className="selected-processing">
      <span className="desk-caption">{voice ? "CHANNEL PROCESSING" : "CHANNEL CONTROL"}</span>
      <div className="flex items-start justify-center gap-2">
        {voice ? <>
          <Knob label="Preamp" value={params.input.gain} min={-20} max={30} unit="dB" def={0} onChange={gain => setParams({ ...params, input: { ...params.input, gain } })} />
          <Knob label="Low cut" value={params.input.hpf} min={20} max={400} log unit="Hz" onChange={hpf => setParams({ ...params, input: { ...params.input, hpf } })} />
          <Knob label="Comp" value={params.comp.threshold} min={-60} max={0} unit="dB" onChange={threshold => setParams({ ...params, comp: { ...params.comp, threshold } })} />
        </> : <Knob label="Level" value={channel.gain} min={-30} max={12} step={0.5} unit="dB" def={0} onChange={gain => update({ gain })} />}
        <Knob label="Pan" value={channel.pan} min={-100} max={100} def={0} onChange={pan => update({ pan })} />
      </div>
    </div>
    <div className="selected-eq">
      <div className="flex items-center justify-between"><span className="desk-caption">{voice ? "PARAMETRIC EQ" : "SIGNAL"}</span><span className="label-text text-[9px]">{voice ? "4 BAND" : "STEREO"}</span></div>
      {voice ? <><EqGraph params={params} getFilters={filters} getAnalyser={analyser} /><div className="eq-axis"><span>20</span><span>100</span><span>1k</span><span>10k</span><span>20k Hz</span></div></> : <div className="bus-diagram"><span>{channel.name}</span><span>GAIN → PAN → LR</span><span>PROGRAM OUTPUT</span></div>}
    </div>
    <div className="selected-inserts">
      <span className="desk-caption">{voice ? "INSERTS" : "ROUTING"}</span>
      {voice ? <div className="insert-grid">{([['gate', 'GATE'], ['comp', 'COMP'], ['deess', 'DE-ESS'], ['eq', 'EQ']] as const).map(([key, label]) => <Toggle key={key} on={params[key].on} onClick={() => setParams({ ...params, [key]: { ...params[key], on: !params[key].on } })}>{label}</Toggle>)}</div> : <div className="bus-route">LR<span>MAIN MIX</span></div>}
    </div>
  </div>;
}
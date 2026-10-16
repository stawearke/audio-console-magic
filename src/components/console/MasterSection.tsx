import { useCallback } from "react";
import { useDesk } from "./desk-context";
import { CompCurve } from "./Dyn";
import { EqGraph } from "./EqGraph";
import { Knob, Module } from "./controls";

// EQ and compressor on the main mix, ahead of the limiter.
export function MasterSection() {
  const d = useDesk();
  const m = d.mixer.master;
  const analyser = useCallback(() => d.getEngine().masterAnalyser, [d]);
  const eq = (p: Partial<typeof m.eq>) => d.patchMaster({ eq: { ...m.eq, ...p } });
  const cp = (p: Partial<typeof m.comp>) => d.patchMaster({ comp: { ...m.comp, ...p } });
  return <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
    <Module title="Master EQ" on={m.eq.on} onToggle={() => eq({ on: !m.eq.on })}>
      <div className="w-full"><EqGraph eq={m.eq} getAnalyser={analyser} onChange={eq} /></div>
      <Knob label="Low" value={m.eq.lowGain} min={-15} max={15} step={0.5} def={0} unit="dB" onChange={(v) => eq({ lowGain: v })} />
      <Knob label="Low Hz" value={m.eq.lowFreq} min={30} max={500} log def={120} onChange={(v) => eq({ lowFreq: v })} />
      <Knob label="Lo-mid" value={m.eq.lmGain} min={-15} max={15} step={0.5} def={0} unit="dB" onChange={(v) => eq({ lmGain: v })} />
      <Knob label="Hz" value={m.eq.lmFreq} min={100} max={2000} log def={350} onChange={(v) => eq({ lmFreq: v })} />
      <Knob label="Hi-mid" value={m.eq.hmGain} min={-15} max={15} step={0.5} def={0} unit="dB" onChange={(v) => eq({ hmGain: v })} />
      <Knob label="Hz" value={m.eq.hmFreq} min={1000} max={8000} log def={3000} onChange={(v) => eq({ hmFreq: v })} />
      <Knob label="High" value={m.eq.highGain} min={-15} max={15} step={0.5} def={0} unit="dB" onChange={(v) => eq({ highGain: v })} />
      <Knob label="High Hz" value={m.eq.highFreq} min={4000} max={18000} log def={10000} onChange={(v) => eq({ highFreq: v })} />
    </Module>
    <Module title="Master compressor" on={m.comp.on} onToggle={() => cp({ on: !m.comp.on })} extra={<CompCurve comp={m.comp} />}>
      <Knob label="Thresh" value={m.comp.threshold} min={-40} max={0} def={-18} unit="dB" onChange={(v) => cp({ threshold: v })} />
      <Knob label="Ratio" value={m.comp.ratio} min={1} max={10} step={0.5} def={2} unit=":1" onChange={(v) => cp({ ratio: v })} />
      <Knob label="Attack" value={m.comp.attack} min={1} max={100} log def={30} unit="ms" onChange={(v) => cp({ attack: v })} />
      <Knob label="Release" value={m.comp.release} min={50} max={1500} log def={250} unit="ms" onChange={(v) => cp({ release: v })} />
      <Knob label="Makeup" value={m.comp.makeup} min={0} max={18} def={0} unit="dB" onChange={(v) => cp({ makeup: v })} />
    </Module>
  </div>;
}

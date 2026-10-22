import { useEffect, useState } from "react";
import { engine } from "@/lib/mk/use-switcher";
import type { MonitorType } from "@/lib/mk/types";
import type { InputTiming } from "@/lib/mk/transport";
import { Knob, Module } from "./controls";
import { ObsStrip, VoicePanel } from "./ObsDesk";
import { useObsInputs } from "./obs-inputs";

const MONITORS: Array<[MonitorType, string]> = [["none", "Off"], ["monitorOnly", "Monitor only"], ["monitorAndOutput", "Monitor and output"]];

/** One OBS input in detail: level, EQ, voice chain (OBS filters), delay, balance and monitoring. */
export function ObsChannel({ focus }: { focus: string | null }) {
  const { state, inputs, connected } = useObsInputs();
  const [picked, setPicked] = useState<string | null>(focus);
  const name = inputs.find((c) => c.name === picked)?.name ?? inputs[0]?.name ?? "";
  const channel = inputs.find((c) => c.name === name);
  const [timing, setTiming] = useState<InputTiming>({ syncOffset: 0, balance: 0.5 });
  useEffect(() => { if (focus) setPicked(focus); }, [focus]);
  useEffect(() => {
    if (!name) return;
    let alive = true;
    void engine.readTiming(name).then((t) => { if (alive) setTiming(t); });
    return () => { alive = false; };
  }, [name]);

  if (!connected || !channel) {
    return <section className="mixer-surface p-6" aria-label="Channel"><p className="label-text text-xs">{connected ? "OBS reports no audio inputs." : "Connect to OBS to edit an input."}</p></section>;
  }
  const delay = (ms: number) => { setTiming((t) => ({ ...t, syncOffset: ms })); engine.setSyncOffset(name, ms); };
  const balance = (v: number) => { const b = 0.5 + v / 100; setTiming((t) => ({ ...t, balance: b })); engine.setBalance(name, b); };
  return (
    <>
      <section className="mixer-surface p-3" aria-label="Channel">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h3 className="module-title text-[11px] font-bold uppercase tracking-[0.2em]">Channel</h3>
          <select aria-label="OBS input" className="console-select rounded px-2 py-1.5 text-xs" value={name} onChange={(e) => setPicked(e.target.value)}>
            {inputs.map((c) => <option key={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <ObsStrip c={channel} level={state.levels[name] ?? -100} focused={false} />
          <Module title="Delay" on onToggle={() => delay(0)}>
            <Knob label="Delay" size="sm" min={-950} max={2000} step={5} unit=" ms" def={0} value={timing.syncOffset} onChange={delay} />
            <span className="label-text max-w-[12rem] text-center text-[10px] leading-relaxed">Lines this input up with the picture (OBS "Audio sync offset"). The switch resets it to 0.</span>
          </Module>
          <Module title="Balance" on onToggle={() => balance(0)}>
            <Knob label="L / R" size="sm" bipolar min={-50} max={50} step={1} unit="" def={0} value={Math.round((timing.balance - 0.5) * 100)} onChange={balance} />
            <span className="label-text max-w-[12rem] text-center text-[10px] leading-relaxed">Pan this input left or right. The switch centres it.</span>
          </Module>
          <Module title="Monitoring" on={channel.monitor !== "none"} onToggle={() => void engine.setAudioMonitor(name, channel.monitor === "none" ? "monitorAndOutput" : "none")}>
            <select aria-label="Monitoring" className="console-select rounded px-2 py-1.5 text-xs" value={channel.monitor} onChange={(e) => void engine.setAudioMonitor(name, e.target.value as MonitorType)}>
              {MONITORS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            <span className="label-text max-w-[12rem] text-center text-[10px] leading-relaxed">What you hear on the OBS PC itself. Set the monitoring device in OBS settings.</span>
          </Module>
        </div>
      </section>
      <VoicePanel name={name} sources={inputs.map((c) => c.name)} />
    </>
  );
}

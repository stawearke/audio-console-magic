import { useDesk } from "./desk-context";
import { Knob, Module } from "./controls";

// Aux returns. Every channel feeds these buses with its REV / DLY / MON send knobs.
export function FxView() {
  const d = useDesk();
  const { fx } = d.mixer;
  return <div>
    <p className="label-text mb-3 text-xs">Aux returns are shared effects. Turn up a channel's send knob to feed it into a return.</p>
    <div className="grid gap-3 md:grid-cols-3">
      <Module title="Aux 1 · Reverb">
        <Knob label="Size" value={fx.reverb.size} min={0.3} max={6} step={0.1} def={1.5} unit="s" onChange={(v) => d.patchFx("reverb", { size: v })} />
        <Knob label="Pre-delay" value={fx.reverb.predelay} min={0} max={200} def={0} unit="ms" onChange={(v) => d.patchFx("reverb", { predelay: v })} />
        <Knob label="Tone" value={fx.reverb.tone} min={500} max={16000} log def={6000} unit="Hz" onChange={(v) => d.patchFx("reverb", { tone: v })} />
        <Knob label="Return" value={fx.reverb.level} min={-60} max={6} def={-6} unit="dB" onChange={(v) => d.patchFx("reverb", { level: v })} />
      </Module>
      <Module title="Aux 2 · Delay">
        <Knob label="Time" value={fx.delay.time} min={20} max={1500} log def={280} unit="ms" onChange={(v) => d.patchFx("delay", { time: v })} />
        <Knob label="Repeat" value={fx.delay.feedback} min={0} max={90} def={25} unit="%" onChange={(v) => d.patchFx("delay", { feedback: v })} />
        <Knob label="Tone" value={fx.delay.tone} min={500} max={16000} log def={5000} unit="Hz" onChange={(v) => d.patchFx("delay", { tone: v })} />
        <Knob label="Return" value={fx.delay.level} min={-60} max={6} def={-6} unit="dB" onChange={(v) => d.patchFx("delay", { level: v })} />
      </Module>
      <Module title="Aux 3 · Monitor">
        <Knob label="Mix level" value={fx.monitor.level} min={-60} max={6} def={0} unit="dB" onChange={(v) => d.patchFx("monitor", { level: v })} />
        <Knob label="PFL level" value={fx.monitor.pflLevel} min={-60} max={6} def={0} unit="dB" onChange={(v) => d.patchFx("monitor", { pflLevel: v })} />
        <div className="flex w-full flex-col gap-1">
          <label className="label-text text-[9px] uppercase tracking-widest">Monitor output</label>
          <select aria-label="Monitor output" className="console-select w-full rounded px-2 py-1 text-xs" value={d.monitorOut} onChange={(e) => d.setMonitorOut(e.target.value)}>
            <option value="off">Off</option>
            {d.outputs.filter((o) => o.deviceId !== "default").map((o) => <option key={o.deviceId} value={o.deviceId}>{o.label || "Audio output"}</option>)}
          </select>
        </div>
      </Module>
    </div>
  </div>;
}

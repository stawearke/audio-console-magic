import { useCallback, useMemo } from "react";
import { ClipboardPaste, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUX_NAMES, type Dsp, type GenType } from "@/lib/mixer-state";
import { useDesk } from "./desk-context";
import { CompCurve } from "./Dyn";
import { EqGraph } from "./EqGraph";
import { Fader, Knob, Meter, Module, NumberField, Toggle } from "./controls";

const FLAT = { lowGain: 0, lowFreq: 120, lmGain: 0, lmFreq: 350, lmQ: 1, hmGain: 0, hmFreq: 3000, hmQ: 1, highGain: 0, highFreq: 10000 };
const EQ_PRESETS: Record<string, Partial<Dsp["eq"]>> = {
  Flat: FLAT,
  "Vocal presence": { ...FLAT, lowGain: -3, lowFreq: 100, lmGain: -2, lmFreq: 300, hmGain: 3.5, hmFreq: 3500, highGain: 2, highFreq: 11000 },
  "Warm voice": { ...FLAT, lowGain: 3, lowFreq: 140, lmGain: 1.5, lmFreq: 250, hmGain: -1.5, hmFreq: 4500, highGain: -1, highFreq: 9000 },
  "Bright / air": { ...FLAT, lowGain: -2, hmGain: 2, hmFreq: 5000, highGain: 5, highFreq: 12000 },
  "Bass boost": { ...FLAT, lowGain: 6, lowFreq: 90, lmGain: 1, lmFreq: 180 },
  Telephone: { ...FLAT, lowGain: -15, lowFreq: 400, lmGain: 4, lmFreq: 1200, hmGain: 3, hmFreq: 2500, highGain: -15, highFreq: 4000 },
  "Cut mud": { ...FLAT, lmGain: -5, lmFreq: 280, lmQ: 1.4 },
};

export function ChannelEditor() {
  const d = useDesk();
  const ch = d.primary;
  const { dsp } = ch;
  const up = d.patchDsp;
  const id = ch.id;
  const analyser = useCallback(() => d.getEngine().channelAnalyser(id), [d, id]);
  const readGr = useMemo(() => () => d.getEngine().compReduction(id), [d, id]);
  const readDs = useMemo(() => () => d.getEngine().deessReduction(id), [d, id]);
  const readIn = useMemo(() => () => d.getEngine().level(id, "peak-pre"), [d, id]);
  const readOut = useMemo(() => () => d.getEngine().level(id, "peak-post"), [d, id]);
  const triggers = d.mixer.channels.filter((c) => c.id !== id);
  const setGen = (p: Partial<typeof ch.gen>) => { d.patch(id, { gen: { ...ch.gen, ...p } }); };

  return <div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="desk-caption !mb-0">CHANNEL</span>
        <input aria-label="Channel name" className="console-select rounded px-2 py-1 text-sm font-bold" value={ch.name} maxLength={14} onChange={(e) => d.patch(id, { name: e.target.value.toUpperCase() })} />
        <select aria-label="Select channel" className="console-select rounded px-2 py-1 text-xs" value={id} onChange={(e) => d.select(e.target.value)}>
          {d.mixer.channels.map((c, i) => <option key={c.id} value={c.id}>{String(i + 1).padStart(2, "0")} {c.name}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" className="console-btn" onClick={() => d.copyDsp(id)}><Copy />Copy settings</Button>
        <Button variant="ghost" size="sm" className="console-btn" disabled={!d.canPaste} onClick={d.pasteDsp}><ClipboardPaste />Paste to {d.selected.length > 1 ? `${d.selected.length} selected` : "channel"}</Button>
        <Button variant="ghost" size="sm" className="console-btn" disabled={d.mixer.channels.length <= 1} onClick={() => d.removeChannel(id)}><Trash2 />Remove channel</Button>
      </div>
    </div>
    <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Module title="Input">
          <div className="flex w-full flex-col gap-2">
            <label className="label-text text-[9px] uppercase tracking-widest">Channel type</label>
            <select className="console-select w-full rounded px-2 py-1 text-xs" value={ch.stereo ? "stereo" : "mono"} onChange={(e) => d.patch(id, { stereo: e.target.value === "stereo" })}>
              <option value="mono">Mono</option><option value="stereo">Stereo</option>
            </select>
            {ch.kind === "mic" && <>
              <label className="label-text text-[9px] uppercase tracking-widest">Microphone</label>
              <select className="console-select w-full rounded px-2 py-1 text-xs" value={ch.deviceId} onChange={(e) => { d.patch(id, { deviceId: e.target.value }); }}>
                <option value="">Default mic</option>
                {d.inputs.filter((x) => x.deviceId !== "default").map((x) => <option key={x.deviceId} value={x.deviceId}>{x.label || "Mic"}</option>)}
              </select>
            </>}
          </div>
          <Knob label="Gain" value={dsp.input.gain} min={-20} max={30} def={0} unit="dB" onChange={(v) => up(id, "input", { gain: v })} />
          <Knob label="Delay" value={dsp.input.delaySamples} min={0} max={4800} step={1} def={0} unit="smp" onChange={(v) => up(id, "input", { delaySamples: v })} />
          <div className="flex w-full flex-wrap justify-center gap-2">
            <Toggle on={dsp.input.polarity} onClick={() => up(id, "input", { polarity: !dsp.input.polarity })}>Ø Phase</Toggle>
            <Toggle on={dsp.input.dcBlock} onClick={() => up(id, "input", { dcBlock: !dsp.input.dcBlock })}>DC block</Toggle>
            {ch.kind === "file" && <Toggle on={ch.loop} onClick={() => d.patch(id, { loop: !ch.loop })}>Loop</Toggle>}
            {ch.kind === "mic" && <Toggle on={dsp.input.browserNS} onClick={() => up(id, "input", { browserNS: !dsp.input.browserNS })}>Noise suppress</Toggle>}
          </div>
          <div className="flex w-full items-center justify-center gap-2 text-[10px] label-text">Delay comp<NumberField label="Delay samples" value={dsp.input.delaySamples} min={0} max={4800} onChange={(v) => up(id, "input", { delaySamples: v })} width="w-16" />samples</div>
        </Module>

        <Module title="Filters" on={dsp.input.hpfOn || dsp.input.lpfOn} onToggle={() => { const on = !(dsp.input.hpfOn || dsp.input.lpfOn); up(id, "input", { hpfOn: on, lpfOn: on && dsp.input.lpfOn }); }}>
          <Knob label="Low cut" value={dsp.input.hpf} min={20} max={400} log def={80} unit="Hz" onChange={(v) => up(id, "input", { hpf: v, hpfOn: true })} />
          <Knob label="High cut" value={dsp.input.lpf} min={2000} max={20000} log def={16000} unit="Hz" onChange={(v) => up(id, "input", { lpf: v, lpfOn: true })} />
          <div className="flex w-full justify-center gap-2">
            <Toggle on={dsp.input.hpfOn} onClick={() => up(id, "input", { hpfOn: !dsp.input.hpfOn })}>Low cut</Toggle>
            <Toggle on={dsp.input.lpfOn} onClick={() => up(id, "input", { lpfOn: !dsp.input.lpfOn })}>High cut</Toggle>
          </div>
        </Module>

        <Module title="Noise Gate" on={dsp.gate.on} onToggle={() => up(id, "gate", { on: !dsp.gate.on })}>
          <Knob label="Thresh" value={dsp.gate.threshold} min={-80} max={-10} def={-50} unit="dB" onChange={(v) => up(id, "gate", { threshold: v })} />
          <Knob label="Range" value={dsp.gate.range} min={-80} max={0} def={-40} unit="dB" onChange={(v) => up(id, "gate", { range: v })} />
          <Knob label="Attack" value={dsp.gate.attack} min={0.5} max={50} step={0.5} log def={3} unit="ms" onChange={(v) => up(id, "gate", { attack: v })} />
          <Knob label="Release" value={dsp.gate.release} min={20} max={1000} log def={150} unit="ms" onChange={(v) => up(id, "gate", { release: v })} />
        </Module>

        <Module title="De-Esser" on={dsp.deess.on} onToggle={() => up(id, "deess", { on: !dsp.deess.on })} extra={<Meter read={readDs} mode="gr" />}>
          <Knob label="Freq" value={dsp.deess.freq} min={3000} max={12000} step={100} log def={6500} unit="Hz" onChange={(v) => up(id, "deess", { freq: v })} />
          <Knob label="Thresh" value={dsp.deess.threshold} min={-60} max={0} def={-30} unit="dB" onChange={(v) => up(id, "deess", { threshold: v })} />
          <Knob label="Range" value={dsp.deess.range} min={0} max={20} def={8} unit="dB" onChange={(v) => up(id, "deess", { range: v })} />
        </Module>

        <Module title="Compressor" on={dsp.comp.on} onToggle={() => up(id, "comp", { on: !dsp.comp.on })} extra={<CompCurve comp={dsp.comp} />}>
          <Knob label="Thresh" value={dsp.comp.threshold} min={-60} max={0} def={-20} unit="dB" onChange={(v) => up(id, "comp", { threshold: v })} />
          <Knob label="Ratio" value={dsp.comp.ratio} min={1} max={20} step={0.5} def={4} unit=":1" onChange={(v) => up(id, "comp", { ratio: v })} />
          <Knob label="Attack" value={dsp.comp.attack} min={1} max={100} log def={10} unit="ms" onChange={(v) => up(id, "comp", { attack: v })} />
          <Knob label="Release" value={dsp.comp.release} min={20} max={1000} log def={200} unit="ms" onChange={(v) => up(id, "comp", { release: v })} />
          <Knob label="Makeup" value={dsp.comp.makeup} min={0} max={24} def={4} unit="dB" onChange={(v) => up(id, "comp", { makeup: v })} />
        </Module>

        <div className="sm:col-span-2 xl:col-span-4">
          <Module title="4-Band Parametric EQ" on={dsp.eq.on} onToggle={() => up(id, "eq", { on: !dsp.eq.on })} extra={
            <select aria-label="EQ preset" className="console-select rounded px-2 py-1 text-[10px]" value="" onChange={(e) => { const p = EQ_PRESETS[e.target.value]; if (p) up(id, "eq", { ...p, on: true }); }}>
              <option value="">EQ preset…</option>{Object.keys(EQ_PRESETS).map((k) => <option key={k}>{k}</option>)}
            </select>}>
            <div className="w-full"><EqGraph eq={dsp.eq} getAnalyser={analyser} onChange={(p) => up(id, "eq", p)} /></div>
            <Knob label="Low" value={dsp.eq.lowGain} min={-15} max={15} step={0.5} def={0} unit="dB" onChange={(v) => up(id, "eq", { lowGain: v })} />
            <Knob label="Low Hz" value={dsp.eq.lowFreq} min={30} max={500} log def={120} onChange={(v) => up(id, "eq", { lowFreq: v })} />
            <Knob label="Lo-mid" value={dsp.eq.lmGain} min={-15} max={15} step={0.5} def={0} unit="dB" onChange={(v) => up(id, "eq", { lmGain: v })} />
            <Knob label="Hz" value={dsp.eq.lmFreq} min={100} max={2000} log def={350} onChange={(v) => up(id, "eq", { lmFreq: v })} />
            <Knob label="Q" value={dsp.eq.lmQ} min={0.3} max={8} step={0.1} def={1} onChange={(v) => up(id, "eq", { lmQ: v })} />
            <Knob label="Hi-mid" value={dsp.eq.hmGain} min={-15} max={15} step={0.5} def={0} unit="dB" onChange={(v) => up(id, "eq", { hmGain: v })} />
            <Knob label="Hz" value={dsp.eq.hmFreq} min={1000} max={8000} log def={3000} onChange={(v) => up(id, "eq", { hmFreq: v })} />
            <Knob label="Q" value={dsp.eq.hmQ} min={0.3} max={8} step={0.1} def={1} onChange={(v) => up(id, "eq", { hmQ: v })} />
            <Knob label="High" value={dsp.eq.highGain} min={-15} max={15} step={0.5} def={0} unit="dB" onChange={(v) => up(id, "eq", { highGain: v })} />
            <Knob label="High Hz" value={dsp.eq.highFreq} min={4000} max={18000} log def={10000} onChange={(v) => up(id, "eq", { highFreq: v })} />
          </Module>
        </div>

        <Module title="Warmth / Tube" on={dsp.warmth.on} onToggle={() => up(id, "warmth", { on: !dsp.warmth.on })}>
          <Knob label="Drive" value={dsp.warmth.drive} min={0} max={100} def={20} unit="%" onChange={(v) => up(id, "warmth", { drive: v })} />
        </Module>

        <Module title="Auto-duck" on={dsp.duck.on} onToggle={() => up(id, "duck", { on: !dsp.duck.on })}>
          <div className="flex w-full flex-col gap-1">
            <label className="label-text text-[9px] uppercase tracking-widest">Lower this channel when</label>
            <select className="console-select w-full rounded px-2 py-1 text-xs" value={dsp.duck.source} onChange={(e) => up(id, "duck", { source: e.target.value })}>
              <option value="">Choose a channel</option>
              {triggers.map((c) => <option key={c.id} value={c.id}>{c.name} is loud</option>)}
            </select>
          </div>
          <Knob label="Thresh" value={dsp.duck.threshold} min={-60} max={-5} def={-40} unit="dB" onChange={(v) => up(id, "duck", { threshold: v })} />
          <Knob label="Amount" value={dsp.duck.amount} min={1} max={40} def={12} unit="dB" onChange={(v) => up(id, "duck", { amount: v })} />
          <Knob label="Release" value={dsp.duck.release} min={50} max={2000} log def={400} unit="ms" onChange={(v) => up(id, "duck", { release: v })} />
        </Module>

        <Module title="Aux sends">
          {AUX_NAMES.map((name, i) => (
            <div key={name} className="flex flex-col items-center gap-1">
              <Knob label={name} value={ch.sends[i] ?? -60} min={-60} max={12} def={-60} unit="dB" onChange={(v) => d.setSend(id, i, v)} />
              <Toggle on={ch.sendPre[i] ?? false} title="Send before the fader" onClick={() => d.patch(id, { sendPre: ch.sendPre.map((p, j) => (j === i ? !p : p)) })}>Pre</Toggle>
            </div>
          ))}
        </Module>

        <Module title="DCA / mute groups">
          <div className="flex w-full flex-col gap-1">
            <label className="label-text text-[9px] uppercase tracking-widest">DCA (master fader for a set of channels)</label>
            <select aria-label="DCA" className="console-select w-full rounded px-2 py-1 text-xs" value={ch.dca} onChange={(e) => d.patch(id, { dca: Number(e.target.value) })}>
              <option value={0}>None</option>{d.mixer.dcas.map((x, i) => <option key={i} value={i + 1}>{x.name}</option>)}
            </select>
          </div>
          <div className="flex w-full flex-wrap justify-center gap-2">
            {d.mixer.muteGroups.map((g, i) => <Toggle key={i} on={ch.muteGrp[i] ?? false} onClick={() => d.patch(id, { muteGrp: ch.muteGrp.map((v, j) => (j === i ? !v : v)) })}>{g.name}</Toggle>)}
          </div>
        </Module>

        {ch.kind === "gen" && (
          <Module title="Signal generator">
            <div className="flex w-full flex-col gap-1">
              <label className="label-text text-[9px] uppercase tracking-widest">Signal</label>
              <select className="console-select w-full rounded px-2 py-1 text-xs" value={ch.gen.type} onChange={(e) => setGen({ type: e.target.value as GenType })}>
                <option value="white">White noise</option><option value="pink">Pink noise</option><option value="sine">Sine</option>
              </select>
            </div>
            <Knob label="Freq" value={ch.gen.freq} min={20} max={20000} log def={440} unit="Hz" onChange={(v) => setGen({ freq: v })} />
            <Knob label="Level" value={ch.gen.level} min={-60} max={0} def={-12} unit="dBFS" onChange={(v) => setGen({ level: v })} />
          </Module>
        )}
      </div>

      <aside className="module flex flex-col items-center gap-3 rounded-lg p-3">
        <h3 className="module-title text-[11px] font-bold uppercase tracking-[0.2em]">{ch.name}</h3>
        <div className="flex gap-3">
          <Meter read={readIn} label="Pre" />
          <Meter read={readGr} label="Comp" mode="gr" />
          <Meter read={readOut} label="Post" />
          <Fader value={ch.fader} label="Level" onChange={(v) => d.patch(id, { fader: v })} />
        </div>
        <div className="flex gap-2"><Toggle on={ch.mute} onClick={() => d.patch(id, { mute: !ch.mute })}>Mute</Toggle><Toggle on={ch.solo} onClick={() => d.patch(id, { solo: !ch.solo })}>Solo</Toggle></div>
      </aside>
    </div>
  </div>;
}

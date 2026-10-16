import { useMemo, useRef } from "react";
import { AudioLines, FileAudio, Mic, Monitor, Music2, Play, Power, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HUES, type Channel, type Group, type Route, type SourceKind } from "@/lib/mixer-state";
import { auxLabel } from "@/lib/aux-labels";
import { useDesk } from "./desk-context";
import { EqGraph } from "./EqGraph";
import { Fader, Knob, Meter, Toggle } from "./controls";

export const KIND_ICON: Record<SourceKind, typeof Mic> = { mic: Mic, file: Music2, desktop: Monitor, gen: AudioLines };
const hueColor = (h: number) => `oklch(0.78 0.14 ${h})`;
const SCALE = ["+12", "+6", "0", "−6", "−12", "−24", "−36", "−60"];

export function ChannelStrip({ ch, index }: { ch: Channel; index: number }) {
  const d = useDesk();
  const fileInput = useRef<HTMLInputElement>(null);
  const selected = d.selected.includes(ch.id);
  const Icon = KIND_ICON[ch.kind];
  const live = d.active[ch.id] ?? false;
  const dsp = ch.dsp;
  const mode = d.mixer.desk.meterMode;
  const read = useMemo(() => () => d.getEngine().level(ch.id, mode), [d, ch.id, mode]);
  const inserts: [string, boolean, () => void][] = [
    ["Filters", dsp.input.hpfOn || dsp.input.lpfOn, () => { const on = !(dsp.input.hpfOn || dsp.input.lpfOn); d.patchDsp(ch.id, "input", { hpfOn: on, lpfOn: false }); }],
    ["Gate", dsp.gate.on, () => d.patchDsp(ch.id, "gate", { on: !dsp.gate.on })],
    ["De-ess", dsp.deess.on, () => d.patchDsp(ch.id, "deess", { on: !dsp.deess.on })],
    ["Comp", dsp.comp.on, () => d.patchDsp(ch.id, "comp", { on: !dsp.comp.on })],
    ["EQ", dsp.eq.on, () => d.patchDsp(ch.id, "eq", { on: !dsp.eq.on })],
    ["Tube", dsp.warmth.on, () => d.patchDsp(ch.id, "warmth", { on: !dsp.warmth.on })],
    ["Duck", dsp.duck.on, () => d.patchDsp(ch.id, "duck", { on: !dsp.duck.on })],
  ];
  const nextHue = () => d.patch(ch.id, { hue: HUES[(HUES.indexOf(ch.hue) + 1) % HUES.length] ?? 195 });

  return (
    <div className="channel-strip" data-selected={selected} data-kind={ch.kind} style={{ ["--channel-color" as string]: hueColor(ch.hue) }}>
      <div className="channel-heading flex items-center justify-between">
        <span className="readout text-xs">{String(index + 1).padStart(2, "0")}</span>
        <button type="button" className="hue-dot" onClick={nextHue} title="Change channel colour" aria-label={`Change ${ch.name} colour`} />
        <Icon className="size-4 label-text" />
      </div>
      <Button variant="ghost" className="channel-name" aria-label={`Select ${ch.name.toLowerCase()} channel`} aria-pressed={selected}
        title="Click to select. Shift-click adds to the selection. Double-click opens the channel editor."
        onClick={(e) => d.select(ch.id, e.shiftKey || e.metaKey || e.ctrlKey)} onDoubleClick={() => { d.select(ch.id); d.setView("channel"); }}>{ch.name}</Button>
      <div className="channel-source mt-1 truncate text-[10px] label-text" title={d.files[ch.id]}>
        {ch.kind === "mic" ? (ch.stereo ? "Stereo mic" : "Mono mic") : ch.kind === "desktop" ? "Shared tab / screen" : ch.kind === "gen" ? `Generator · ${ch.gen.type}` : d.files[ch.id] || "No audio loaded"}
      </div>

      <div className="source-controls mt-2 flex gap-1">
        {ch.kind === "file" && <>
          <input hidden type="file" accept="audio/*" ref={fileInput} onChange={(e) => { void d.loadFile(ch.id, e.target.files?.[0]); e.target.value = ""; }} />
          <Button variant="ghost" size="icon" className="console-btn size-7" title="Load audio file" aria-label={`Load ${ch.name.toLowerCase()} audio`} onClick={() => fileInput.current?.click()}><FileAudio /></Button>
        </>}
        <Button variant="ghost" size="sm" className="console-btn h-7 flex-1" disabled={ch.kind === "file" && !d.files[ch.id]} onClick={() => void d.toggleSource(ch.id)}>
          {ch.kind === "mic" ? <Power /> : live ? <Square /> : ch.kind === "desktop" ? <Monitor /> : <Play />}
          {live ? "Stop" : ch.kind === "mic" ? "Start" : ch.kind === "desktop" ? "Share" : ch.kind === "gen" ? "Tone" : "Play"}
        </Button>
      </div>

      <div className="strip-eq mt-2"><EqGraph eq={dsp.eq} compact /></div>

      <div className="strip-inserts">
        {inserts.map(([name, on, toggle]) => (
          <button key={name} type="button" className="insert-slot" data-on={on} aria-pressed={on} onClick={toggle}>
            <span className="led size-1.5 rounded-full" data-on={on} />{name}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-start justify-center gap-1">
        <Knob label="Gain" value={dsp.input.gain} min={-20} max={30} def={0} unit="dB" size="sm" onChange={(v) => d.patchDsp(ch.id, "input", { gain: v })} />
        <Knob label={ch.stereo ? "Bal" : "Pan"} value={ch.pan} min={-100} max={100} def={0} size="sm" bipolar onChange={(v) => d.patch(ch.id, { pan: v })} />
      </div>
      <div className="mt-2 flex items-start justify-center gap-0.5" title="Aux sends: reverb, delay, monitor">
        {[0, 1, 2].map((i) => (
          <Knob key={i} label={auxLabel(i).slice(0, 3)} value={ch.sends[i] ?? -60} min={-60} max={12} step={1} def={-60} size="sm" onChange={(v) => d.setSend(ch.id, i, v)} />
        ))}
      </div>

      <div className="strip-switches mt-3 flex justify-center gap-1">
        <Toggle on={ch.mute} onClick={() => d.patch(ch.id, { mute: !ch.mute })}>M</Toggle>
        <Toggle on={ch.solo} onClick={() => d.patch(ch.id, { solo: !ch.solo })}>S</Toggle>
        <Toggle on={ch.pfl} title="Pre-fader listen on the monitor output" onClick={() => d.patch(ch.id, { pfl: !ch.pfl })}>PFL</Toggle>
      </div>

      <div className="fader-section flex justify-center gap-3">
        <div className="fader-scale label-text flex flex-col justify-between text-[9px]">{SCALE.map((s) => <span key={s}>{s}</span>)}</div>
        <Fader label={`${ch.name} level`} hideLabel value={ch.fader} onChange={(v) => d.patch(ch.id, { fader: v })} />
        <Meter read={read} />
      </div>

      <div className="strip-route mt-3 flex items-center gap-1">
        <select aria-label={`${ch.name} output`} className="console-select w-full rounded px-1 py-1 text-[10px]" value={ch.route} onChange={(e) => d.patch(ch.id, { route: e.target.value as Route })}>
          <option value="master">Master</option><option value="g1">Group 1</option><option value="g2">Group 2</option>
        </select>
        <Toggle on={dsp.input.polarity} title="Invert polarity" onClick={() => d.patchDsp(ch.id, "input", { polarity: !dsp.input.polarity })}>Ø</Toggle>
      </div>
      <div className="channel-foot mt-3 text-center text-[9px] uppercase tracking-widest" data-on={live}>
        {live ? "● On air" : "Standby"}{dsp.input.delaySamples > 0 ? ` · ${dsp.input.delaySamples} smp` : ""}
      </div>
    </div>
  );
}

export function GroupStrip({ g }: { g: Group }) {
  const d = useDesk();
  const read = useMemo(() => () => d.getEngine().groupLevel(g.id), [d, g.id]);
  const members = d.mixer.channels.filter((c) => c.route === g.id).length;
  return (
    <div className="channel-strip group-strip" style={{ ["--channel-color" as string]: "oklch(0.8 0.05 260)" }}>
      <div className="channel-heading flex items-center justify-between"><span className="readout text-xs">{g.id.toUpperCase()}</span><Volume2 className="size-4" /></div>
      <input aria-label="Group name" className="channel-name-input" value={g.name} maxLength={12} onChange={(e) => d.patchGroup(g.id, { name: e.target.value.toUpperCase() })} />
      <div className="channel-source mt-1 text-[10px] label-text">{members} channel{members === 1 ? "" : "s"} → master</div>
      <div className="strip-switches mt-4 flex justify-center"><Toggle on={g.mute} onClick={() => d.patchGroup(g.id, { mute: !g.mute })}>Mute</Toggle></div>
      <div className="fader-section group-fader flex justify-center gap-3">
        <div className="fader-scale label-text flex flex-col justify-between text-[9px]">{SCALE.map((s) => <span key={s}>{s}</span>)}</div>
        <Fader label={`${g.name} level`} hideLabel value={g.fader} onChange={(v) => d.patchGroup(g.id, { fader: v })} />
        <Meter read={read} />
      </div>
      <div className="channel-foot mt-3 text-center text-[9px] uppercase tracking-widest">Subgroup</div>
    </div>
  );
}

export function MasterStrip() {
  const d = useDesk();
  const m = d.mixer.master;
  const readL = useMemo(() => () => d.getEngine().masterLevel(0), [d]);
  const readR = useMemo(() => () => d.getEngine().masterLevel(1), [d]);
  return (
    <div className="channel-strip master-strip">
      <div className="channel-heading flex items-center justify-between"><span className="readout text-xs">LR</span><Volume2 className="size-4" /></div>
      <h2 className="mt-3 text-sm font-bold tracking-widest">MASTER</h2><div className="mt-1 text-[10px] label-text">Stereo program bus</div>
      <div className="my-3 flex justify-center"><Knob label="Ceiling" value={m.limiter.ceiling} min={-12} max={0} step={0.5} def={-1} unit="dB" onChange={(v) => d.patchMaster({ limiter: { ...m.limiter, ceiling: v } })} /></div>
      <div className="mb-4 flex justify-center"><Toggle on={m.limiter.on} onClick={() => d.patchMaster({ limiter: { ...m.limiter, on: !m.limiter.on } })}>Limiter</Toggle></div>
      <div className="fader-section master-fader flex justify-center gap-2">
        <div className="fader-scale label-text flex flex-col justify-between text-[9px]">{SCALE.map((s) => <span key={s}>{s}</span>)}</div>
        <Fader label="Master level" hideLabel value={m.fader} onChange={(v) => d.patchMaster({ fader: v })} />
        <Meter read={readL} label="L" /><Meter read={readR} label="R" />
      </div>
      <div className="mt-4 flex justify-center"><Toggle on={m.mute} onClick={() => d.patchMaster({ mute: !m.mute })}>Mute all</Toggle></div>
      <div className="channel-foot mt-4 text-center text-[9px] uppercase tracking-widest">Program output</div>
    </div>
  );
}

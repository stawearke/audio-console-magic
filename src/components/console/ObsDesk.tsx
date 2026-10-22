import { useCallback, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { engine, useSwitcher } from "@/lib/mk/use-switcher";
import { EQ_RANGE, FLAT_EQ, type AudioChannel, type EqValues } from "@/lib/mk/types";
import { Fader, Knob, Meter, Toggle } from "./controls";

// The real OBS inputs, controlled exactly like MK VISION's mixer: the same engine, the same
// OBS connection (a shared singleton), so a fader here is the same fader there.
function ObsStrip({ c, level, focused }: { c: AudioChannel; level: number; focused: boolean }) {
  const lv = useRef(-100);
  lv.current = c.muted ? -100 : level;
  const read = useCallback(() => lv.current, []);
  const eq = c.eq ?? FLAT_EQ;
  const knob = (key: keyof EqValues, label: string) => (
    <Knob label={label} size="sm" bipolar def={0} step={0.5} unit=" dB" min={EQ_RANGE[key][0]} max={EQ_RANGE[key][1]} value={eq[key]} onChange={(v) => engine.setEq(c.name, { [key]: v })} />
  );
  return (
    <div className="channel-strip flex min-w-[150px] flex-col items-center gap-2 rounded-md p-2" data-selected={focused} style={focused ? { outline: "2px solid var(--c-voice)" } : undefined}>
      <span className="selected-display max-w-full truncate text-center text-xs font-bold uppercase tracking-widest" title={c.name}>{c.name}</span>
      <div className="flex items-end gap-2">
        <Meter read={read} />
        <Fader value={c.db} label={`${c.name} volume`} hideLabel onChange={(db) => void engine.setAudioVolume(c.name, db)} />
      </div>
      <div className="flex flex-wrap justify-center gap-1">
        <Toggle on={c.muted} onClick={() => void engine.toggleAudioMute(c.name)} title="Mute this input in OBS">Mute</Toggle>
        <Toggle on={c.stream} onClick={() => void engine.toggleAudioStream(c.name)} title="On the FINAL mix (YouTube + recording, OBS track 1)">MN</Toggle>
        <Toggle on={c.monitor !== "none"} onClick={() => void engine.cycleAudioMonitor(c.name)} title="Also on the OBS PC's own headphones">PC</Toggle>
      </div>
      <div className="grid grid-cols-2 gap-x-1 gap-y-2">
        {knob("gain", "Gain")}{knob("hi", "High")}{knob("mid", "Mid")}{knob("lo", "Low")}
      </div>
    </div>
  );
}

export function ObsDesk({ focus }: { focus: string | null }) {
  const state = useSwitcher();
  const hidden = state.config.hiddenAudio;
  const strips = state.audio.filter((c) => !hidden.includes(c.name));
  const connected = state.status === "connected";
  return (
    <section className="mixer-surface" aria-label="OBS inputs">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <Link to="/" className="console-btn flex h-7 items-center gap-1.5 rounded px-2 text-[10px] font-semibold uppercase tracking-widest"><ArrowLeft className="size-3" />MK VISION</Link>
        <span className="label-text text-[11px]">
          {connected ? `Live OBS audio: ${strips.length} input${strips.length === 1 ? "" : "s"}. Same faders, mutes, MN / PC routing and EQ as the MK mixer.` : `Not connected to OBS (${state.status}). Connect in MK VISION → Settings.`}
        </span>
        {!connected && <Link to="/settings" className="console-btn rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-widest">Settings</Link>}
      </div>
      <div className="mixer-bank" role="group" aria-label="OBS audio inputs">
        {strips.length === 0
          ? <p className="label-text p-6 text-xs">{connected ? "OBS reports no audio inputs." : "Waiting for OBS."}</p>
          : strips.map((c) => <ObsStrip key={c.name} c={c} level={state.levels[c.name] ?? -100} focused={c.name === focus} />)}
      </div>
    </section>
  );
}

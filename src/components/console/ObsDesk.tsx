import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { engine, useSwitcher } from "@/lib/mk/use-switcher";
import { EQ_RANGE, FLAT_EQ, LIMITER_MAX, LIMITER_MIN, type AudioChannel, type EqValues, type LimiterConfig } from "@/lib/mk/types";
import { powerSum } from "@/lib/mk/audio-math";
import { DEFAULT_VOICE, VOICE_RANGE as R, type ObsVoice } from "@/lib/mk/obs-voice";
import { OBS_VOICE_PRESET_NAMES, obsVoicePreset } from "@/lib/obs-voice-presets";
import { Fader, Knob, Meter, Module, Toggle } from "./controls";

// In-app navigation keeps the OBS connection alive; without a router (tests, embedding) fall back to a plain link.
function NavLink({ to, className, children }: { to: "/" | "/settings"; className: string; children: ReactNode }) {
  const router = useRouter({ warn: false });
  return router ? <Link to={to} className={className}>{children}</Link> : <a href={to} className={className}>{children}</a>;
}

// The real OBS inputs, controlled exactly like MK VISION's mixer: the same engine, the same
// OBS connection (a shared singleton), so a fader here is the same fader there.
export function ObsStrip({ c, level, focused, onEdit }: { c: AudioChannel; level: number; focused: boolean; onEdit?: ((name: string) => void) | undefined }) {
  const lv = useRef(-100);
  lv.current = c.muted ? -100 : level;
  const read = useCallback(() => lv.current, []);
  const eq = c.eq ?? FLAT_EQ;
  const knob = (key: keyof EqValues, label: string) => (
    <Knob label={label} size="sm" bipolar def={0} step={0.5} unit=" dB" min={EQ_RANGE[key][0]} max={EQ_RANGE[key][1]} value={eq[key]} onChange={(v) => engine.setEq(c.name, { [key]: v })} />
  );
  return (
    <div className="channel-strip flex min-w-[150px] flex-col items-center gap-2 rounded-md p-2" data-selected={focused} style={focused ? { outline: "2px solid var(--c-voice)" } : undefined}>
      {onEdit ? (
        <button type="button" onClick={() => onEdit(c.name)} className="selected-display max-w-full truncate text-center text-xs font-bold uppercase tracking-widest hover:underline" title={`${c.name}: open in Channel`}>{c.name}</button>
      ) : (
        <span className="selected-display max-w-full truncate text-center text-xs font-bold uppercase tracking-widest" title={c.name}>{c.name}</span>
      )}
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


/** A stable `read()` for the meters that always returns the latest value. */
function useReader(v: number) {
  const ref = useRef(v);
  ref.current = v;
  return useCallback(() => ref.current, []);
}

// MAIN OUT, like OBS's own mixer and MK VISION's Master: the final mix (every input on MN) to the stream and
// recording, with the limiter and MUTE OUT. Same engine calls as MK VISION, so both stay in step.
export function MainOut({ inputs, levels, limiter, gr, muted }: { inputs: AudioChannel[]; levels: Record<string, number>; limiter: LimiterConfig; gr: number | null; muted: boolean }) {
  const live = inputs.filter((c) => c.stream && !c.muted);
  const mix = powerSum(live.map((c) => levels[c.name] ?? -100));
  const out = muted ? -100 : mix;
  // OBS cannot report gain reduction, so estimate it from how close the mix is to the ceiling.
  const engaged = limiter.on && !muted && mix >= limiter.threshold - 0.6;
  const reduction = !limiter.on ? 0 : (gr ?? (engaged ? 2.5 : 0));
  const readL = useReader(out);
  const readR = useReader(out - 0.7);
  const readGr = useReader(reduction);
  return (
    <div className="channel-strip master-strip flex min-w-[170px] flex-col items-center gap-2 rounded-md p-2" aria-label="Main out">
      <span className="selected-display text-xs font-bold uppercase tracking-[0.2em]">Main out</span>
      <span className="label-text text-[10px]">{live.length} on air</span>
      <div className="flex items-end gap-2">
        <Meter read={readL} label="L" />
        <Meter read={readR} label="R" />
        <Meter read={readGr} label="GR" mode="gr" />
      </div>
      <Knob label="Ceiling" size="sm" min={LIMITER_MIN} max={LIMITER_MAX} step={0.5} unit=" dB" def={-6} value={limiter.threshold} onChange={(v) => engine.setLimiter({ threshold: v })} />
      <div className="flex flex-wrap justify-center gap-1">
        <Toggle on={limiter.on} onClick={() => engine.setLimiter({ on: !limiter.on })} title={`Limiter: a ceiling at ${limiter.threshold} dB on every input of the final mix`}>Limiter</Toggle>
        <Toggle on={muted} onClick={() => void engine.toggleMasterMute()} title="Silence the whole final mix. Press again to bring back exactly what was live.">Mute out</Toggle>
      </div>
    </div>
  );
}

// The VOXONE voice rack, but running INSIDE OBS: native OBS filters on the chosen input
// (denoise -> gate -> EQ -> compressor -> gain), so it works for stream, recording and every track.
export function VoicePanel({ name, sources = [] }: { name: string; sources?: string[] }) {
  const [voice, setVoice] = useState<ObsVoice>(DEFAULT_VOICE);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!name) return;
    let alive = true;
    setLoaded(false);
    void engine.readVoice(name).then((v) => { if (alive) { setVoice(v); setLoaded(true); } });
    return () => { alive = false; };
  }, [name]);
  if (!name) return null;
  const commit = (next: ObsVoice) => { setVoice(next); engine.setVoice(name, next); };
  const gate = (p: Partial<ObsVoice["gate"]>) => commit({ ...voice, gate: { ...voice.gate, ...p } });
  const comp = (p: Partial<ObsVoice["comp"]>) => commit({ ...voice, comp: { ...voice.comp, ...p } });
  const duck = (p: Partial<ObsVoice["duck"]>) => commit({ ...voice, duck: { ...voice.duck, ...p } });
  const others = sources.filter((n) => n !== name);
  const shown = voice.duck.source && !others.includes(voice.duck.source) ? [...others, voice.duck.source] : others;
  const k = (label: string, value: number, [min, max]: readonly [number, number], unit: string, def: number, onChange: (v: number) => void, step = 1) => (
    <Knob label={label} size="sm" min={min} max={max} step={step} unit={unit} def={def} value={value} onChange={onChange} />
  );
  return (
    <section className="mixer-surface mt-3 p-3" aria-label="Voice processing in OBS">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="module-title text-[11px] font-bold uppercase tracking-[0.2em]">Voice processing in OBS</h3>
        <span className="label-text text-[11px]">{name}</span>
        <select aria-label="Voice preset" className="console-select rounded px-2 py-1.5 text-xs" value="" onChange={(e) => { const p = obsVoicePreset(e.target.value); if (p) commit({ ...p, duck: voice.duck }); }}>
          <option value="">Preset…</option>
          {OBS_VOICE_PRESET_NAMES.map((n) => <option key={n}>{n}</option>)}
        </select>
        <Toggle on={false} title="Switch every stage off" onClick={() => commit(DEFAULT_VOICE)}>Reset</Toggle>
        <span className="label-text text-[10px]">{loaded ? "Native OBS filters: runs in OBS itself." : "Reading OBS…"}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Module title="Noise suppression" on={voice.denoise.on} onToggle={() => commit({ ...voice, denoise: { on: !voice.denoise.on } })}>
          <span className="label-text max-w-[14rem] text-center text-[10px] leading-relaxed">AI denoise (RNNoise) from OBS. Takes hiss, fans and room noise out of the voice.</span>
        </Module>
        <Module title="Gate" on={voice.gate.on} onToggle={() => gate({ on: !voice.gate.on })}>
          {k("Thresh", voice.gate.threshold, R.gateThreshold, " dB", -40, (v) => gate({ threshold: v }))}
          {k("Attack", voice.gate.attack, R.gateAttack, " ms", 5, (v) => gate({ attack: v }))}
          {k("Release", voice.gate.release, R.gateRelease, " ms", 150, (v) => gate({ release: v }), 5)}
        </Module>
        <Module title="Compressor" on={voice.comp.on} onToggle={() => comp({ on: !voice.comp.on })}>
          {k("Thresh", voice.comp.threshold, R.compThreshold, " dB", -18, (v) => comp({ threshold: v }))}
          {k("Ratio", voice.comp.ratio, R.compRatio, ":1", 3, (v) => comp({ ratio: v }), 0.5)}
          {k("Attack", voice.comp.attack, R.compAttack, " ms", 6, (v) => comp({ attack: v }))}
          {k("Release", voice.comp.release, R.compRelease, " ms", 60, (v) => comp({ release: v }), 5)}
          {k("Makeup", voice.comp.makeup, R.compMakeup, " dB", 0, (v) => comp({ makeup: v }), 0.5)}
        </Module>
        <Module title="Duck under" on={voice.duck.on && !!voice.duck.source} onToggle={() => duck({ on: !(voice.duck.on && !!voice.duck.source) })}>
          <select aria-label="Duck under this input" className="console-select max-w-[12rem] rounded px-2 py-1.5 text-xs" value={voice.duck.source} onChange={(e) => duck({ source: e.target.value, on: e.target.value ? true : false })}>
            <option value="">Pick an input…</option>
            {shown.map((n) => <option key={n} value={n}>{others.includes(n) ? n : `${n} (not in OBS)`}</option>)}
          </select>
          {k("Thresh", voice.duck.threshold, R.duckThreshold, " dB", -35, (v) => duck({ threshold: v }))}
          {k("Depth", voice.duck.ratio, R.duckRatio, ":1", 12, (v) => duck({ ratio: v }))}
          {k("Attack", voice.duck.attack, R.duckAttack, " ms", 20, (v) => duck({ attack: v }))}
          {k("Release", voice.duck.release, R.duckRelease, " ms", 400, (v) => duck({ release: v }), 10)}
        </Module>
      </div>
      <p className="label-text mt-3 text-[10px] leading-relaxed">
        EQ and gain are the strip knobs above. Limiter: MK VISION's master LIM. De-esser, warmth, reverb and delay exist only in VOXONE's browser rack: OBS has no filter for them.
        Put "Duck under" on music or background inputs and pick the mic: the music drops while the mic talks (Depth = how far, Release = how fast it comes back). Filters are named MK Denoise / MK Gate / MK Compressor / MK Duck.
      </p>
    </section>
  );
}

export function ObsDesk({ focus, onEdit }: { focus: string | null; onEdit?: ((name: string) => void) | undefined }) {
  const state = useSwitcher();
  const hidden = state.config.hiddenAudio;
  // MK's own helper sources (graphics layers, the sound-pad clip) are not mixer inputs.
  const inputs = state.audio.filter((c) => !/^MK /i.test(c.name));
  const strips = inputs.filter((c) => !hidden.includes(c.name));
  const connected = state.status === "connected";
  return (
    <>
    <section className="mixer-surface" aria-label="OBS inputs">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <NavLink to="/" className="console-btn flex h-7 items-center gap-1.5 rounded px-2 text-[10px] font-semibold uppercase tracking-widest"><ArrowLeft className="size-3" />MK VISION</NavLink>
        <span className="label-text text-[11px]">
          {connected ? `Live OBS audio: ${strips.length} input${strips.length === 1 ? "" : "s"}. Same faders, mutes, MN / PC routing, EQ and MAIN OUT as the MK mixer.` : `Not connected to OBS (${state.status}). Connect in MK VISION → Settings.`}
        </span>
        {!connected && <NavLink to="/settings" className="console-btn rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-widest">Settings</NavLink>}
      </div>
      <div className="mixer-bank" role="group" aria-label="OBS audio inputs">
        {strips.length === 0
          ? <p className="label-text p-6 text-xs">{connected ? "OBS reports no audio inputs." : "Waiting for OBS."}</p>
          : strips.map((c) => <ObsStrip key={c.name} c={c} level={state.levels[c.name] ?? -100} focused={c.name === focus} onEdit={onEdit} />)}
        {connected && <MainOut inputs={inputs} levels={state.levels} limiter={state.config.limiter} gr={state.gr} muted={state.masterMuted} />}
      </div>
    </section>
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import { FileAudio, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDesk } from "./desk-context";
import { Meter, Module, Toggle } from "./controls";

function Rta() {
  const d = useDesk();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const cv = ref.current, g = cv?.getContext("2d");
      if (cv && g) {
        const dpr = window.devicePixelRatio || 1, w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        const css = getComputedStyle(cv);
        g.clearRect(0, 0, w, h);
        g.strokeStyle = css.getPropertyValue("--grid"); g.lineWidth = 1;
        [100, 1000, 10000].forEach((f) => { const x = (Math.log10(f / 20) / 3) * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); });
        const an = d.getEngine().masterAnalyser;
        if (an) {
          const data = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(data);
          const bars = 64; g.fillStyle = css.getPropertyValue("--curve");
          for (let i = 0; i < bars; i++) {
            const f0 = 20 * Math.pow(1000, i / bars), f1 = 20 * Math.pow(1000, (i + 1) / bars), nyq = an.context.sampleRate / 2;
            const b0 = Math.floor((f0 / nyq) * data.length), b1 = Math.max(b0 + 1, Math.ceil((f1 / nyq) * data.length));
            let peak = -120; for (let b = b0; b < b1 && b < data.length; b++) peak = Math.max(peak, data[b] ?? -120);
            const bh = Math.min(1, Math.max(0, (peak + 100) / 80)) * h;
            g.fillRect((i / bars) * w + 1, h - bh, w / bars - 2, bh);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [d]);
  return <canvas ref={ref} className="eq-screen h-48 w-full rounded-md" aria-label="Master spectrum analyser" />;
}

const fmtL = (v: number | null) => (v === null ? "--" : v.toFixed(1));

// Loudness in LUFS (K-weighted, ITU-R BS.1770 style gating). Streams are commonly mastered around -14 to -16 LUFS.
function Loudness() {
  const d = useDesk();
  const [l, setL] = useState<{ momentary: number | null; short: number | null; integrated: number | null }>({ momentary: null, short: null, integrated: null });
  useEffect(() => { const t = setInterval(() => { if (d.getEngine().ready) setL(d.getEngine().loudness()); }, 250); return () => clearInterval(t); }, [d]);
  const tone = (v: number | null) => (v === null ? "idle" : v > -9 ? "hot" : v > -20 ? "ok" : "low");
  return <Module title="Loudness (LUFS)" extra={<Button variant="ghost" size="sm" className="console-btn h-7" onClick={() => { d.getEngine().resetLoudness(); setL({ momentary: null, short: null, integrated: null }); }}>Reset</Button>}>
    <div className="lufs-grid w-full">
      {([["Momentary", l.momentary], ["Short-term", l.short], ["Integrated", l.integrated]] as const).map(([label, v]) => (
        <div key={label} className="lufs-cell" data-tone={tone(v)}><span className="label-text text-[9px] uppercase tracking-widest">{label}</span><span className="readout lufs-num">{fmtL(v)}</span><span className="label-text text-[9px]">LUFS</span></div>
      ))}
    </div>
    <p className="label-text w-full text-xs">Short-term needs 3 seconds of audio. Integrated keeps averaging until you press Reset.</p>
  </Module>;
}

// Twelve one-shot pads (stingers, sound effects). They play through the chosen channel, so its fader, EQ and sends apply.
function Pads() {
  const d = useDesk();
  const files = useRef<(HTMLInputElement | null)[]>([]);
  const targets = d.mixer.channels.filter((c) => c.kind !== "mic");
  return <Module title="Sound pads" extra={<div className="flex items-center gap-2">
    <select aria-label="Pad output channel" className="console-select rounded px-2 py-1 text-[10px]" value={targets.some((c) => c.id === d.padChannel) ? d.padChannel : (targets[0]?.id ?? "")} onChange={(e) => d.setPadChannel(e.target.value)}>
      {targets.map((c) => <option key={c.id} value={c.id}>via {c.name}</option>)}
    </select>
    <Button variant="ghost" size="sm" className="console-btn h-7" onClick={d.stopPads}><Square />Stop all</Button></div>}>
    <div className="pad-grid w-full">
      {d.pads.map((p, i) => (
        <div key={i} className="pad" data-loaded={p.loaded}>
          <button type="button" className="pad-hit" disabled={!p.loaded} onClick={() => void d.firePad(i)} aria-label={p.loaded ? `Play ${p.name}` : `Pad ${i + 1} is empty`}>
            <span className="readout text-[10px]">{i + 1}</span><span className="text-xs font-bold">{p.loaded ? p.name : "Empty"}</span>
          </button>
          <input hidden type="file" accept="audio/*" ref={(el) => { files.current[i] = el; }} onChange={(e) => { void d.loadPad(i, e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" className="pad-load" onClick={() => files.current[i]?.click()} aria-label={`Load sound for pad ${i + 1}`}><FileAudio className="size-3.5" /></button>
        </div>
      ))}
    </div>
    <p className="label-text w-full text-xs">Load a sound into a pad, then tap it to play. Sounds are not saved between sessions.</p>
  </Module>;
}

function useClock() {
  const [t, setT] = useState("--:--:--");
  useEffect(() => { const f = () => setT(new Date().toLocaleTimeString([], { hour12: false })); f(); const i = setInterval(f, 1000); return () => clearInterval(i); }, []);
  return t;
}

// Show page: big scene pads, mute groups, master spectrum and record, for running a live program.
export function Show() {
  const d = useDesk();
  const clock = useClock();
  const [arm, setArm] = useState(false);
  const readL = () => d.getEngine().masterLevel(0), readR = () => d.getEngine().masterLevel(1);
  return <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
    <Module title="Scene pads" extra={<Toggle on={arm} onClick={() => setArm(!arm)} title="While armed, a pad stores the current mix instead of recalling it">Store mode</Toggle>}>
      <div className="scene-pads w-full">
        {d.scenes.slots.map((s, i) => (
          <button key={i} type="button" className="scene-pad" data-on={d.scenes.current === i} data-armed={arm} disabled={!s && !arm}
            onClick={() => { if (arm) { d.scenes.store(i); setArm(false); } else d.scenes.recall(i); }}>
            <span className="readout text-[10px]">{i + 1}</span><span className="text-sm font-bold">{s?.name ?? "Empty"}</span>
          </button>
        ))}
      </div>
      <p className="label-text w-full text-xs">Rename scenes in Setup. Scenes recall faders, processing, sends and routing but keep your MIDI settings.</p>
    </Module>
    <Module title="Program">
      <div className="clock-big readout" aria-label="Current time">{clock}</div>
      <Button variant="ghost" className="console-btn record-control h-10 px-4" data-on={d.recording} onClick={() => void d.toggleRecord()}>
        {d.recording ? <Square /> : <span className="record-dot" />}{d.recording ? `Stop ${Math.floor(d.seconds / 60)}:${String(d.seconds % 60).padStart(2, "0")}` : "Record mix"}
      </Button>
      <div className="flex gap-3"><Meter read={readL} label="L" /><Meter read={readR} label="R" /></div>
      <div className="flex w-full flex-wrap justify-center gap-2">
        {d.mixer.muteGroups.map((g, i) => <Toggle key={i} on={g.on} onClick={() => d.toggleMuteGroup(i)}>{g.name}</Toggle>)}
      </div>
    </Module>
    <Loudness />
    <Pads />
    <div className="lg:col-span-2"><Module title="Master spectrum (RTA)"><div className="w-full"><Rta /></div>
      <div className="eq-axis w-full"><span>20</span><span>100</span><span>1k</span><span>10k</span><span>20k Hz</span></div></Module></div>
  </div>;
}

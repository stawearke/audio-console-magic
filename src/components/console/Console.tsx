import { useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine, defaultParams, levelDb, type Params } from "@/lib/audio-engine";
import { Fader, Knob, Meter, Module, Toggle } from "./controls";
import { EqGraph } from "./EqGraph";

const PRESETS: Record<string, (p: Params) => Params> = {
  "Broadcast Voice": () => structuredClone(defaultParams),
  "Noisy Room": () => ({ ...structuredClone(defaultParams), input: { gain: 0, hpfOn: true, hpf: 110, browserNS: true }, gate: { on: true, threshold: -42, range: -60, attack: 2, release: 120 } }),
  "Radio DJ": () => { const p = structuredClone(defaultParams); p.eq.lowGain = 5; p.eq.lowFreq = 100; p.comp = { on: true, threshold: -28, ratio: 6, attack: 5, release: 150, makeup: 8 }; p.warmth = { on: true, drive: 30 }; return p; },
  "Cave Echo": () => { const p = structuredClone(defaultParams); p.reverb = { on: true, size: 3.5, mix: 35 }; p.delay = { on: true, time: 380, feedback: 40, mix: 25 }; return p; },
  Flat: () => { const p = structuredClone(defaultParams); p.gate.on = false; p.eq.on = false; p.deess.on = false; p.comp.on = false; p.limiter.on = false; p.input.browserNS = false; return p; },
};

const STORE = "stream-console-v1";

export function Console() {
  const engine = useRef<AudioEngine | null>(null);
  const [params, setParams] = useState<Params>(defaultParams);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skin, setSkin] = useState<"hardware" | "modern">("hardware");
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [inId, setInId] = useState("");
  const [outId, setOutId] = useState("default");
  const bufIn = useRef(new Float32Array(1024));
  const bufOut = useRef(new Float32Array(2048));

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || "null");
      if (s?.params) setParams({ ...defaultParams, ...s.params });
      if (s?.skin) setSkin(s.skin);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { localStorage.setItem(STORE, JSON.stringify({ params, skin })); engine.current?.apply(params); }, [params, skin]);

  const refreshDevices = useCallback(async () => {
    const d = await navigator.mediaDevices.enumerateDevices();
    setInputs(d.filter((x) => x.kind === "audioinput"));
    setOutputs(d.filter((x) => x.kind === "audiooutput"));
  }, []);
  useEffect(() => { refreshDevices(); }, [refreshDevices]);

  const start = async (deviceId = inId, ns = params.input.browserNS) => {
    setError(null);
    try {
      engine.current ??= new AudioEngine();
      await engine.current.start(deviceId || undefined, ns);
      engine.current.apply(params);
      await engine.current.setOutput(outId).catch(() => {});
      setRunning(true);
      refreshDevices();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the microphone");
    }
  };
  const stop = async () => { await engine.current?.stop(); setRunning(false); };

  const up = <K extends keyof Params>(k: K, patch: Partial<Params[K]>) => setParams((p) => ({ ...p, [k]: { ...p[k], ...patch } }));

  const readIn = useCallback(() => (engine.current?.inAnalyser && running ? levelDb(engine.current.inAnalyser, bufIn.current) : -100), [running]);
  const readOut = useCallback(() => (engine.current?.outAnalyser && running ? levelDb(engine.current.outAnalyser, bufOut.current) : -100), [running]);
  const readGr = useCallback(() => (running ? engine.current?.compReduction ?? 0 : 0), [running]);
  const readDs = useCallback(() => (running ? engine.current?.deessReduction ?? 0 : 0), [running]);
  const getFilters = useCallback(() => engine.current?.eqFilters ?? [], []);
  const getAnalyser = useCallback(() => (running ? engine.current?.outAnalyser ?? null : null), [running]);

  const { input, gate, eq, deess, comp, warmth, delay, reverb, limiter, output } = params;

  return (
    <div data-skin={skin} className="console-root min-h-screen px-3 py-6 md:px-8">
      <div className="console-chassis mx-auto max-w-7xl rounded-2xl p-4 md:p-6">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="brand text-2xl font-black tracking-tight md:text-3xl">VOX<span className="brand-accent">ONE</span> <span className="label-text text-xs font-semibold tracking-[0.3em]">STREAM CONSOLE</span></h1>
            <p className="label-text mt-1 text-xs">Clean your mic live, then send it to OBS.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="console-select rounded px-2 py-1.5 text-xs" value="" onChange={(e) => { const f = PRESETS[e.target.value]; if (f) setParams(f(params)); }}>
              <option value="">Load preset…</option>
              {Object.keys(PRESETS).map((k) => <option key={k}>{k}</option>)}
            </select>
            <Toggle on={skin === "modern"} onClick={() => setSkin(skin === "hardware" ? "modern" : "hardware")}>{skin === "hardware" ? "Hardware look" : "Modern look"}</Toggle>
            {running ? (
              <button onClick={stop} className="power-btn rounded-md px-4 py-2 text-xs font-bold uppercase tracking-widest" data-on="true">● Live — Stop</button>
            ) : (
              <button onClick={() => start()} className="power-btn rounded-md px-4 py-2 text-xs font-bold uppercase tracking-widest" data-on="false">Power On</button>
            )}
          </div>
        </header>

        {error && <p className="error-box mb-4 rounded-md p-3 text-sm">{error}</p>}

        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Module title="Input">
              <div className="flex w-full flex-col gap-2">
                <label className="label-text text-[9px] uppercase tracking-widest">Microphone</label>
                <select className="console-select w-full rounded px-2 py-1 text-xs" value={inId} onChange={(e) => { setInId(e.target.value); if (running) start(e.target.value); }}>
                  <option value="">Default mic</option>
                  {inputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Mic"}</option>)}
                </select>
                <label className="label-text text-[9px] uppercase tracking-widest">Send to (pick your virtual cable)</label>
                <select className="console-select w-full rounded px-2 py-1 text-xs" value={outId} onChange={(e) => { setOutId(e.target.value); engine.current?.setOutput(e.target.value).catch(() => setError("This browser can't choose an output. Use Chrome or Edge.")); }}>
                  {outputs.length === 0 && <option value="default">Default output</option>}
                  {outputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Output"}</option>)}
                </select>
              </div>
              <Knob label="Gain" value={input.gain} min={-20} max={30} def={0} unit="dB" onChange={(v) => up("input", { gain: v })} />
              <Knob label="Low cut" value={input.hpf} min={20} max={400} log def={80} unit="Hz" onChange={(v) => up("input", { hpf: v })} />
              <div className="flex w-full flex-wrap justify-center gap-2">
                <Toggle on={input.hpfOn} onClick={() => up("input", { hpfOn: !input.hpfOn })}>Low cut</Toggle>
                <Toggle on={input.browserNS} onClick={() => { up("input", { browserNS: !input.browserNS }); if (running) start(inId, !input.browserNS); }}>AI denoise</Toggle>
              </div>
            </Module>

            <Module title="Noise Gate" on={gate.on} onToggle={() => up("gate", { on: !gate.on })}>
              <Knob label="Thresh" value={gate.threshold} min={-80} max={-10} def={-50} unit="dB" onChange={(v) => up("gate", { threshold: v })} />
              <Knob label="Range" value={gate.range} min={-80} max={0} def={-40} unit="dB" onChange={(v) => up("gate", { range: v })} />
              <Knob label="Attack" value={gate.attack} min={0.5} max={50} step={0.5} log def={3} unit="ms" onChange={(v) => up("gate", { attack: v })} />
              <Knob label="Release" value={gate.release} min={20} max={1000} log def={150} unit="ms" onChange={(v) => up("gate", { release: v })} />
            </Module>

            <Module title="De-Esser" on={deess.on} onToggle={() => up("deess", { on: !deess.on })}>
              <Knob label="Freq" value={deess.freq} min={3000} max={12000} step={100} log def={6500} unit="Hz" onChange={(v) => up("deess", { freq: v })} />
              <Knob label="Thresh" value={deess.threshold} min={-60} max={0} def={-30} unit="dB" onChange={(v) => up("deess", { threshold: v })} />
              <Knob label="Range" value={deess.range} min={0} max={20} def={8} unit="dB" onChange={(v) => up("deess", { range: v })} />
            </Module>

            <Module title="Compressor" on={comp.on} onToggle={() => up("comp", { on: !comp.on })}>
              <Knob label="Thresh" value={comp.threshold} min={-60} max={0} def={-20} unit="dB" onChange={(v) => up("comp", { threshold: v })} />
              <Knob label="Ratio" value={comp.ratio} min={1} max={20} step={0.5} def={4} unit=":1" onChange={(v) => up("comp", { ratio: v })} />
              <Knob label="Attack" value={comp.attack} min={1} max={100} log def={10} unit="ms" onChange={(v) => up("comp", { attack: v })} />
              <Knob label="Release" value={comp.release} min={20} max={1000} log def={200} unit="ms" onChange={(v) => up("comp", { release: v })} />
              <Knob label="Makeup" value={comp.makeup} min={0} max={24} def={4} unit="dB" onChange={(v) => up("comp", { makeup: v })} />
            </Module>

            <div className="sm:col-span-2 xl:col-span-4">
              <Module title="4-Band Parametric EQ" on={eq.on} onToggle={() => up("eq", { on: !eq.on })}>
                <div className="w-full"><EqGraph params={params} getFilters={getFilters} getAnalyser={getAnalyser} /></div>
                <Knob label="Low" value={eq.lowGain} min={-15} max={15} step={0.5} def={0} unit="dB" onChange={(v) => up("eq", { lowGain: v })} />
                <Knob label="Low Hz" value={eq.lowFreq} min={30} max={500} log def={120} onChange={(v) => up("eq", { lowFreq: v })} />
                <Knob label="Lo-mid" value={eq.lmGain} min={-15} max={15} step={0.5} def={0} unit="dB" onChange={(v) => up("eq", { lmGain: v })} />
                <Knob label="Hz" value={eq.lmFreq} min={100} max={2000} log def={350} onChange={(v) => up("eq", { lmFreq: v })} />
                <Knob label="Q" value={eq.lmQ} min={0.3} max={8} step={0.1} def={1} onChange={(v) => up("eq", { lmQ: v })} />
                <Knob label="Hi-mid" value={eq.hmGain} min={-15} max={15} step={0.5} def={0} unit="dB" onChange={(v) => up("eq", { hmGain: v })} />
                <Knob label="Hz" value={eq.hmFreq} min={1000} max={8000} log def={3000} onChange={(v) => up("eq", { hmFreq: v })} />
                <Knob label="Q" value={eq.hmQ} min={0.3} max={8} step={0.1} def={1} onChange={(v) => up("eq", { hmQ: v })} />
                <Knob label="High" value={eq.highGain} min={-15} max={15} step={0.5} def={0} unit="dB" onChange={(v) => up("eq", { highGain: v })} />
                <Knob label="High Hz" value={eq.highFreq} min={4000} max={18000} log def={10000} onChange={(v) => up("eq", { highFreq: v })} />
              </Module>
            </div>

            <Module title="Warmth / Tube" on={warmth.on} onToggle={() => up("warmth", { on: !warmth.on })}>
              <Knob label="Drive" value={warmth.drive} min={0} max={100} def={20} unit="%" onChange={(v) => up("warmth", { drive: v })} />
            </Module>

            <Module title="Delay" on={delay.on} onToggle={() => up("delay", { on: !delay.on })}>
              <Knob label="Time" value={delay.time} min={20} max={1500} log def={280} unit="ms" onChange={(v) => up("delay", { time: v })} />
              <Knob label="Repeat" value={delay.feedback} min={0} max={90} def={25} unit="%" onChange={(v) => up("delay", { feedback: v })} />
              <Knob label="Mix" value={delay.mix} min={0} max={100} def={15} unit="%" onChange={(v) => up("delay", { mix: v })} />
            </Module>

            <Module title="Reverb" on={reverb.on} onToggle={() => up("reverb", { on: !reverb.on })}>
              <Knob label="Size" value={reverb.size} min={0.3} max={6} step={0.1} def={1.5} unit="s" onChange={(v) => up("reverb", { size: v })} />
              <Knob label="Mix" value={reverb.mix} min={0} max={100} def={12} unit="%" onChange={(v) => up("reverb", { mix: v })} />
            </Module>

            <Module title="Limiter" on={limiter.on} onToggle={() => up("limiter", { on: !limiter.on })}>
              <Knob label="Ceiling" value={limiter.ceiling} min={-12} max={0} step={0.5} def={-1} unit="dB" onChange={(v) => up("limiter", { ceiling: v })} />
            </Module>
          </div>

          <aside className="module flex flex-col items-center gap-3 rounded-lg p-3">
            <h3 className="module-title text-[11px] font-bold uppercase tracking-[0.2em]">Master</h3>
            <div className="flex gap-3">
              <Meter read={readIn} label="In" />
              <Meter read={readGr} label="Comp" mode="gr" />
              <Meter read={readDs} label="S" mode="gr" />
              <Meter read={readOut} label="Out" />
              <Fader value={output.gain} label="Out" onChange={(v) => up("output", { gain: v })} />
            </div>
            <Toggle on={output.mute} onClick={() => up("output", { mute: !output.mute })}>Mute</Toggle>
          </aside>
        </div>

        <details className="module mt-4 rounded-lg p-4 text-sm">
          <summary className="module-title cursor-pointer text-xs font-bold uppercase tracking-[0.2em]">How to connect to OBS</summary>
          <ol className="label-text mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed">
            <li>Install a free virtual audio cable (VB-Audio Cable on Windows, BlackHole on Mac).</li>
            <li>Open this page in Chrome or Edge, press <b>Power On</b> and allow the microphone.</li>
            <li>Under <b>Send to</b>, pick "CABLE Input" (or BlackHole).</li>
            <li>In OBS, add an <b>Audio Input Capture</b> source set to "CABLE Output", and mute your raw mic in OBS.</li>
            <li>Keep this tab open while streaming. Settings save on their own.</li>
          </ol>
        </details>
      </div>
    </div>
  );
}

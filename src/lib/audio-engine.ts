// Browser audio engine for the VOXONE desk.
// Every channel is one strip:
//   source -> trim -> polarity -> DC block -> low cut -> high cut -> gate -> 4-band EQ -> de-esser -> compressor
//          -> makeup -> tube -> delay comp -> ducker -> [PFL tap] -> mute -> [pre sends] -> fader -> pan -> [post sends] -> group / master
// Aux buses: 1 reverb, 2 delay, 3 monitor (headphones). Master: limiter -> fader -> program output + recorder.
import type { Channel, Dsp, Fx, GenSettings, Master, MeterMode, Mixer } from "./mixer-state";
import { balanceGains, panGains } from "./dsp-math";

const WORKLET = `
class Gate extends AudioWorkletProcessor {
  constructor(){super();this.p={on:true,threshold:-50,range:-40,attack:3,release:150};this.env=0;this.g=1;
    this.port.onmessage=e=>Object.assign(this.p,e.data);}
  process(inputs,outputs){const i=inputs[0],o=outputs[0];if(!i||!i[0])return true;
    const p=this.p,n=i[0].length,thr=Math.pow(10,p.threshold/20),floor=Math.pow(10,p.range/20);
    const a=Math.exp(-1/(sampleRate*Math.max(p.attack,0.1)/1000)),r=Math.exp(-1/(sampleRate*Math.max(p.release,1)/1000));
    for(let s=0;s<n;s++){let pk=0;for(let c=0;c<i.length;c++)pk=Math.max(pk,Math.abs(i[c][s]));
      this.env=pk>this.env?pk:this.env*0.9995;
      const target=!p.on?1:(this.env>thr?1:(this.env>thr*0.7&&this.g>0.5?1:floor));
      this.g=target>this.g?a*this.g+(1-a)*target:r*this.g+(1-r)*target;
      for(let c=0;c<o.length;c++)o[c][s]=(i[c]||i[0])[s]*this.g;}
    return true;}
}
class DeEss extends AudioWorkletProcessor {
  constructor(){super();this.p={on:true,freq:6500,threshold:-30,range:8};this.x=0;this.y=0;this.env=0;this.g=1;this.t=0;
    this.port.onmessage=e=>Object.assign(this.p,e.data);}
  process(inputs,outputs){const i=inputs[0],o=outputs[0];if(!i||!i[0])return true;
    const p=this.p,n=i[0].length,rc=1/(2*Math.PI*p.freq),dt=1/sampleRate,al=rc/(rc+dt),thr=Math.pow(10,p.threshold/20),minG=Math.pow(10,-p.range/20);
    for(let s=0;s<n;s++){const x=i[0][s];this.y=al*(this.y+x-this.x);this.x=x;
      const v=Math.abs(this.y);this.env=v>this.env?0.5*this.env+0.5*v:this.env*0.999;
      let target=1;if(p.on&&this.env>thr){target=Math.max(minG,thr/this.env);}
      this.g=target<this.g?0.9*this.g+0.1*target:0.9995*this.g+0.0005*target;
      for(let c=0;c<o.length;c++)o[c][s]=(i[c]||i[0])[s]*this.g;}
    this.t+=n;if(this.t>2048){this.t=0;this.port.postMessage(-20*Math.log10(this.g));}
    return true;}
}
registerProcessor('sc-gate',Gate);registerProcessor('sc-deess',DeEss);
`;

const db = (v: number) => (v <= -59.9 ? 0 : Math.pow(10, v / 20));

function warmthCurve(drive: number) {
  const k = drive * 0.5, n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = k === 0 ? x : ((1 + k) * x) / (1 + k * Math.abs(x)); }
  return c;
}
function impulse(ctx: AudioContext, seconds: number) {
  const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  return buf;
}
// A filter that can be switched out of the signal path without clicks.
function bypassable(c: AudioContext, fx: AudioNode) {
  const inp = c.createGain(), out = c.createGain(), wet = c.createGain(), dry = c.createGain();
  inp.connect(wet).connect(fx).connect(out); inp.connect(dry).connect(out);
  return { inp, out, set: (on: boolean, t: number) => { wet.gain.setTargetAtTime(on ? 1 : 0, t, 0.01); dry.gain.setTargetAtTime(on ? 0 : 1, t, 0.01); } };
}
type Bypass = ReturnType<typeof bypassable>;

type Strip = {
  in: GainNode; pol: GainNode; dc: Bypass; hpf: Bypass; lpf: Bypass;
  hpfF: BiquadFilterNode; lpfF: BiquadFilterNode; gate: AudioWorkletNode;
  low: BiquadFilterNode; lm: BiquadFilterNode; hm: BiquadFilterNode; high: BiquadFilterNode;
  deess: AudioWorkletNode; comp: DynamicsCompressorNode; makeup: GainNode; warm: WaveShaperNode;
  dly: DelayNode; duck: GainNode; pfl: GainNode; mute: GainNode; fader: GainNode;
  toMono: GainNode; split: ChannelSplitterNode; gL: GainNode; gR: GainNode; merge: ChannelMergerNode; post: GainNode;
  pre: AnalyserNode; postAn: AnalyserNode;
  sendPre: GainNode[]; sendPost: GainNode[];
  stereo: boolean; route: string; deessRed: number; warmDrive: number; cache: { gate: string; deess: string };
};
type Source = { stop: () => void; setLoop?: (l: boolean) => void; gen?: { out: GainNode; node: AudioScheduledSourceNode; type: string } };
type Bus = { in: GainNode; fader: GainNode; an: AnalyserNode };

export class AudioEngine {
  ctx!: AudioContext;
  ready = false;
  recordingStream!: MediaStream;
  private initPromise: Promise<void> | null = null;
  private strips = new Map<string, Strip>();
  private groups = new Map<string, Bus>();
  private sources = new Map<string, Source>();
  private mixer: Mixer | null = null;
  private aux: GainNode[] = [];
  private n!: {
    masterBus: GainNode; lim: DynamicsCompressorNode; out: GainNode; split: ChannelSplitterNode; anL: AnalyserNode; anR: AnalyserNode; anMix: AnalyserNode;
    verbPre: DelayNode; verb: ConvolverNode; verbTone: BiquadFilterNode; verbRet: GainNode;
    dly: DelayNode; fb: GainNode; dlyTone: BiquadFilterNode; dlyRet: GainNode;
    monLevel: GainNode; pflBus: GainNode; pflLevel: GainNode; monOut: GainNode; monDest: MediaStreamAudioDestinationNode;
  };
  private reverbSize = 0;
  private noiseBuf: Record<string, AudioBuffer> = {};
  private monEl: HTMLAudioElement | null = null;
  private buf = new Float32Array(2048);
  private timer = 0;

  ensure(): Promise<void> {
    this.initPromise ??= this.init();
    return this.initPromise;
  }

  private async init() {
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const c = this.ctx;
    const an = (size: number) => { const a = c.createAnalyser(); a.fftSize = size; return a; };
    const masterBus = c.createGain();
    const lim = c.createDynamicsCompressor(); lim.knee.value = 0; lim.attack.value = 0.001; lim.release.value = 0.05;
    const out = c.createGain();
    const split = c.createChannelSplitter(2);
    const n = {
      masterBus, lim, out, split, anL: an(1024), anR: an(1024), anMix: an(2048),
      verbPre: c.createDelay(0.5), verb: c.createConvolver(), verbTone: c.createBiquadFilter(), verbRet: c.createGain(),
      dly: c.createDelay(2), fb: c.createGain(), dlyTone: c.createBiquadFilter(), dlyRet: c.createGain(),
      monLevel: c.createGain(), pflBus: c.createGain(), pflLevel: c.createGain(), monOut: c.createGain(), monDest: c.createMediaStreamDestination(),
    };
    this.n = n;
    n.verbTone.type = "lowpass"; n.dlyTone.type = "lowpass";
    masterBus.connect(lim).connect(out).connect(c.destination);
    out.connect(n.anMix); out.connect(split); split.connect(n.anL, 0); split.connect(n.anR, 1);
    const rec = c.createMediaStreamDestination(); out.connect(rec); this.recordingStream = rec.stream;
    // Aux 1: reverb return
    const a0 = c.createGain(), a1 = c.createGain(), a2 = c.createGain();
    this.aux = [a0, a1, a2];
    a0.connect(n.verbPre).connect(n.verb).connect(n.verbTone).connect(n.verbRet).connect(masterBus);
    // Aux 2: delay return with filtered feedback
    a1.connect(n.dly); n.dly.connect(n.dlyTone).connect(n.dlyRet).connect(masterBus); n.dlyTone.connect(n.fb).connect(n.dly);
    // Aux 3: headphone monitor; PFL replaces it while any channel is cued
    a2.connect(n.monLevel).connect(n.monOut); n.pflBus.connect(n.pflLevel).connect(n.monOut); n.monOut.connect(n.monDest);
    for (const id of ["g1", "g2"]) {
      const g: Bus = { in: c.createGain(), fader: c.createGain(), an: an(1024) };
      g.in.connect(g.fader).connect(g.an).connect(masterBus);
      this.groups.set(id, g);
    }
    this.ready = true;
    this.timer = window.setInterval(() => this.tick(), 30);
  }

  // ---- strips -------------------------------------------------------------------------------
  private makeStrip(ch: Channel): Strip {
    const c = this.ctx, g = () => c.createGain(), bq = (type: BiquadFilterType) => { const f = c.createBiquadFilter(); f.type = type; return f; };
    const hpfF = bq("highpass"), lpfF = bq("lowpass"), dcF = bq("highpass");
    hpfF.Q.value = 0.707; lpfF.Q.value = 0.707; dcF.frequency.value = 10; dcF.Q.value = 0.707;
    const low = bq("lowshelf"), lm = bq("peaking"), hm = bq("peaking"), high = bq("highshelf");
    const comp = c.createDynamicsCompressor(); comp.knee.value = 6;
    const warm = c.createWaveShaper(); warm.oversample = "4x";
    const toMono = g(); toMono.channelCount = 1; toMono.channelCountMode = "explicit"; toMono.channelInterpretation = "speakers";
    const merge = c.createChannelMerger(2);
    const an = (size: number) => { const a = c.createAnalyser(); a.fftSize = size; return a; };
    const s: Strip = {
      in: g(), pol: g(), dc: bypassable(c, dcF), hpf: bypassable(c, hpfF), lpf: bypassable(c, lpfF), hpfF, lpfF,
      gate: new AudioWorkletNode(c, "sc-gate"), low, lm, hm, high, deess: new AudioWorkletNode(c, "sc-deess"),
      comp, makeup: g(), warm, dly: c.createDelay(0.1), duck: g(), pfl: g(), mute: g(), fader: g(),
      toMono, split: c.createChannelSplitter(2), gL: g(), gR: g(), merge, post: g(), pre: an(1024), postAn: an(1024),
      sendPre: [g(), g(), g()], sendPost: [g(), g(), g()],
      stereo: ch.stereo, route: "", deessRed: 0, warmDrive: -1, cache: { gate: "", deess: "" },
    };
    s.deess.port.onmessage = (e: MessageEvent) => { s.deessRed = e.data; };
    s.in.connect(s.pol).connect(s.dc.inp);
    s.dc.out.connect(s.hpf.inp); s.hpf.out.connect(s.lpf.inp); s.lpf.out.connect(s.gate);
    s.gate.connect(low).connect(lm).connect(hm).connect(high).connect(s.deess).connect(comp).connect(s.makeup).connect(warm).connect(s.dly).connect(s.duck);
    s.duck.connect(s.pre); s.duck.connect(s.pfl).connect(this.n.pflBus); s.duck.connect(s.mute);
    s.mute.connect(s.fader);
    s.toMono.connect(s.gL); s.toMono.connect(s.gR);
    s.split.connect(s.gL, 0); s.split.connect(s.gR, 1);
    s.gL.connect(merge, 0, 0); s.gR.connect(merge, 0, 1);
    merge.connect(s.post); s.post.connect(s.postAn);
    for (let i = 0; i < 3; i++) {
      const bus = this.aux[i]; if (!bus) continue;
      s.mute.connect(s.sendPre[i] as GainNode).connect(bus);
      s.post.connect(s.sendPost[i] as GainNode).connect(bus);
    }
    s.pfl.gain.value = 0;
    this.wirePan(s, ch.stereo);
    this.strips.set(ch.id, s);
    return s;
  }

  private wirePan(s: Strip, stereo: boolean) {
    try { s.fader.disconnect(s.toMono); } catch { /* not connected */ }
    try { s.fader.disconnect(s.split); } catch { /* not connected */ }
    s.fader.connect(stereo ? s.split : s.toMono);
    s.stereo = stereo;
  }

  private removeStrip(id: string) {
    this.stopSource(id);
    const s = this.strips.get(id); if (!s) return;
    const nodes: AudioNode[] = [s.in, s.pol, s.dc.inp, s.dc.out, s.hpf.inp, s.hpf.out, s.lpf.inp, s.lpf.out, s.gate, s.low, s.lm, s.hm, s.high, s.deess, s.comp, s.makeup, s.warm, s.dly, s.duck, s.pfl, s.mute, s.fader, s.toMono, s.split, s.gL, s.gR, s.merge, s.post, s.pre, s.postAn, ...s.sendPre, ...s.sendPost];
    nodes.forEach(x => { try { x.disconnect(); } catch { /* already gone */ } });
    this.strips.delete(id);
  }

  private strip(id: string) {
    const s = this.strips.get(id);
    if (!s) throw new Error("Channel is not ready yet. Try again.");
    return s;
  }

  // Apply the whole mixer state. Safe to call on every change.
  sync(m: Mixer) {
    if (!this.ready) return;
    const ids = new Set(m.channels.map(c => c.id));
    for (const id of [...this.strips.keys()]) if (!ids.has(id)) this.removeStrip(id);
    const anySolo = m.channels.some(c => c.solo), anyPfl = m.channels.some(c => c.pfl);
    for (const ch of m.channels) {
      const s = this.strips.get(ch.id) ?? this.makeStrip(ch);
      this.applyChannel(ch, s, !ch.mute && (!anySolo || ch.solo), m.desk.panLaw);
    }
    const t = this.ctx.currentTime, set = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, 0.02);
    for (const gr of m.groups) { const b = this.groups.get(gr.id); if (b) set(b.fader.gain, gr.mute ? 0 : db(gr.fader)); }
    this.applyMaster(m.master);
    this.applyFx(m.fx, anyPfl);
    this.mixer = m;
  }

  private applyChannel(ch: Channel, s: Strip, audible: boolean, law: Mixer["desk"]["panLaw"]) {
    const d: Dsp = ch.dsp, t = this.ctx.currentTime, set = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, 0.02);
    set(s.in.gain, db(d.input.gain));
    set(s.pol.gain, d.input.polarity ? -1 : 1);
    s.dc.set(d.input.dcBlock, t);
    s.hpf.set(d.input.hpfOn, t); set(s.hpfF.frequency, d.input.hpf);
    s.lpf.set(d.input.lpfOn, t); set(s.lpfF.frequency, d.input.lpf);
    const gateMsg = JSON.stringify(d.gate); if (gateMsg !== s.cache.gate) { s.cache.gate = gateMsg; s.gate.port.postMessage(d.gate); }
    const deessMsg = JSON.stringify(d.deess); if (deessMsg !== s.cache.deess) { s.cache.deess = deessMsg; s.deess.port.postMessage(d.deess); }
    const eq = d.eq;
    set(s.low.frequency, eq.lowFreq); set(s.low.gain, eq.on ? eq.lowGain : 0);
    set(s.lm.frequency, eq.lmFreq); set(s.lm.Q, eq.lmQ); set(s.lm.gain, eq.on ? eq.lmGain : 0);
    set(s.hm.frequency, eq.hmFreq); set(s.hm.Q, eq.hmQ); set(s.hm.gain, eq.on ? eq.hmGain : 0);
    set(s.high.frequency, eq.highFreq); set(s.high.gain, eq.on ? eq.highGain : 0);
    const cp = d.comp;
    set(s.comp.threshold, cp.on ? cp.threshold : 0); set(s.comp.ratio, cp.on ? cp.ratio : 1);
    set(s.comp.attack, cp.attack / 1000); set(s.comp.release, cp.release / 1000);
    set(s.makeup.gain, cp.on ? db(cp.makeup) : 1);
    const drive = d.warmth.on ? d.warmth.drive : 0;
    if (drive !== s.warmDrive) { s.warm.curve = drive > 0 ? warmthCurve(drive) : null; s.warmDrive = drive; }
    set(s.dly.delayTime, Math.min(0.1, d.input.delaySamples / this.ctx.sampleRate));
    set(s.pfl.gain, ch.pfl ? 1 : 0);
    set(s.mute.gain, audible ? 1 : 0);
    set(s.fader.gain, db(ch.fader));
    if (s.stereo !== ch.stereo) this.wirePan(s, ch.stereo);
    const [l, r] = ch.stereo ? balanceGains(ch.pan) : panGains(ch.pan, law);
    set(s.gL.gain, l); set(s.gR.gain, r);
    for (let i = 0; i < 3; i++) {
      const send = db(ch.sends[i] ?? -60), pre = ch.sendPre[i] ?? false;
      set((s.sendPre[i] as GainNode).gain, pre ? send : 0);
      set((s.sendPost[i] as GainNode).gain, pre ? 0 : send);
    }
    if (s.route !== ch.route) {
      s.post.disconnect(); s.post.connect(s.postAn);
      for (let i = 0; i < 3; i++) s.post.connect(s.sendPost[i] as GainNode);
      s.post.connect(ch.route === "master" ? this.n.masterBus : (this.groups.get(ch.route)?.in ?? this.n.masterBus));
      s.route = ch.route;
    }
  }

  private applyMaster(m: Master) {
    const t = this.ctx.currentTime, set = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, 0.02);
    set(this.n.lim.threshold, m.limiter.on ? m.limiter.ceiling - 2 : 0);
    set(this.n.lim.ratio, m.limiter.on ? 20 : 1);
    set(this.n.out.gain, m.mute ? 0 : db(m.fader));
  }

  private applyFx(fx: Fx, anyPfl: boolean) {
    const t = this.ctx.currentTime, set = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, 0.02), n = this.n;
    if (this.reverbSize !== fx.reverb.size) { n.verb.buffer = impulse(this.ctx, fx.reverb.size); this.reverbSize = fx.reverb.size; }
    set(n.verbPre.delayTime, fx.reverb.predelay / 1000); set(n.verbTone.frequency, fx.reverb.tone); set(n.verbRet.gain, db(fx.reverb.level));
    set(n.dly.delayTime, fx.delay.time / 1000); set(n.fb.gain, fx.delay.feedback / 100); set(n.dlyTone.frequency, fx.delay.tone); set(n.dlyRet.gain, db(fx.delay.level));
    set(n.monLevel.gain, anyPfl ? 0 : db(fx.monitor.level)); set(n.pflLevel.gain, db(fx.monitor.pflLevel));
  }

  // Sidechain ducker: reads the trigger channel's pre-fader level every 30 ms.
  private tick() {
    const m = this.mixer; if (!m) return;
    const t = this.ctx.currentTime;
    for (const ch of m.channels) {
      const s = this.strips.get(ch.id); if (!s) continue;
      const d = ch.dsp.duck;
      let target = 1;
      if (d.on && d.source && d.source !== ch.id) {
        const trig = this.strips.get(d.source);
        if (trig && this.measure(trig.pre, false) > d.threshold) target = db(-d.amount);
      }
      s.duck.gain.setTargetAtTime(target, t, target < 1 ? 0.03 : Math.max(0.05, d.release / 1000 / 3));
    }
  }

  // ---- sources ------------------------------------------------------------------------------
  async startMic(id: string, deviceId: string, ns: boolean, stereo: boolean) {
    await this.ensure(); await this.ctx.resume();
    const s = this.strip(id);
    this.stopSource(id);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), noiseSuppression: ns, echoCancellation: false, autoGainControl: false, channelCount: stereo ? 2 : 1 },
    });
    const node = this.ctx.createMediaStreamSource(stream);
    node.connect(s.in);
    this.sources.set(id, { stop: () => { node.disconnect(); stream.getTracks().forEach(t => t.stop()); } });
  }

  async loadAudio(file: File) {
    await this.ensure();
    return this.ctx.decodeAudioData(await file.arrayBuffer());
  }

  async playBuffer(id: string, buffer: AudioBuffer, loop: boolean, onEnded: () => void) {
    await this.ensure(); await this.ctx.resume();
    const s = this.strip(id);
    this.stopSource(id);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer; src.loop = loop; src.connect(s.in);
    const entry: Source = { setLoop: (l) => { src.loop = l; }, stop: () => { src.onended = null; try { src.stop(); } catch { /* not started */ } src.disconnect(); } };
    this.sources.set(id, entry);
    src.onended = () => { if (this.sources.get(id) === entry) { this.sources.delete(id); onEnded(); } };
    src.start();
  }

  async shareDesktop(id: string, onEnded: () => void) {
    await this.ensure(); await this.ctx.resume();
    const s = this.strip(id);
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    if (!stream.getAudioTracks().length) { stream.getTracks().forEach(t => t.stop()); throw new Error("No audio was shared. Select a browser tab and enable Share tab audio."); }
    this.stopSource(id);
    const node = this.ctx.createMediaStreamSource(stream);
    node.connect(s.in);
    this.sources.set(id, { stop: () => { node.disconnect(); stream.getTracks().forEach(t => t.stop()); } });
    stream.getVideoTracks()[0]?.addEventListener("ended", () => { this.stopSource(id); onEnded(); }, { once: true });
  }

  private noise(type: "white" | "pink") {
    const cached = this.noiseBuf[type]; if (cached) return cached;
    const len = this.ctx.sampleRate * 4, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === "white") { d[i] = w; continue; }
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    return (this.noiseBuf[type] = buf);
  }

  async startGen(id: string, g: GenSettings) {
    await this.ensure(); await this.ctx.resume();
    const s = this.strip(id);
    this.stopSource(id);
    const out = this.ctx.createGain(); out.gain.value = db(g.level);
    let node: AudioScheduledSourceNode;
    if (g.type === "sine") { const o = this.ctx.createOscillator(); o.frequency.value = g.freq; node = o; }
    else { const b = this.ctx.createBufferSource(); b.buffer = this.noise(g.type); b.loop = true; node = b; }
    node.connect(out).connect(s.in); node.start();
    this.sources.set(id, { stop: () => { try { node.stop(); } catch { /* stopped */ } node.disconnect(); out.disconnect(); }, gen: { out, node, type: g.type } });
  }

  updateGen(id: string, g: GenSettings) {
    const src = this.sources.get(id); if (!src?.gen) return;
    if (src.gen.type !== g.type) { void this.startGen(id, g); return; }
    const t = this.ctx.currentTime;
    src.gen.out.gain.setTargetAtTime(db(g.level), t, 0.02);
    if (g.type === "sine") (src.gen.node as OscillatorNode).frequency.setTargetAtTime(g.freq, t, 0.02);
  }

  setLoop(id: string, loop: boolean) { this.sources.get(id)?.setLoop?.(loop); }

  stopSource(id: string) {
    const src = this.sources.get(id);
    this.sources.delete(id);
    src?.stop();
  }

  async dispose() {
    window.clearInterval(this.timer);
    for (const id of [...this.sources.keys()]) this.stopSource(id);
    this.monEl?.pause();
    this.monEl = null;
    this.ready = false;
    await this.ctx?.close().catch(() => {});
  }

  // ---- outputs ------------------------------------------------------------------------------
  async setOutput(sinkId: string) {
    await this.ensure();
    const c = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (!c.setSinkId) { if (sinkId !== "default") throw new Error("Output selection is not supported in this browser. Use Chrome or Edge."); return; }
    await c.setSinkId(sinkId === "default" ? "" : sinkId);
  }

  // Headphone monitor: plays the monitor bus on a second device through a hidden audio element.
  async setMonitorOutput(sinkId: string) {
    await this.ensure();
    if (sinkId === "off") { this.monEl?.pause(); if (this.monEl) this.monEl.srcObject = null; return; }
    this.monEl ??= new Audio();
    const el = this.monEl as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (!el.setSinkId) throw new Error("Monitor output needs Chrome or Edge.");
    el.srcObject = this.n.monDest.stream;
    await el.setSinkId(sinkId === "default" ? "" : sinkId);
    await el.play();
  }

  // ---- metering -----------------------------------------------------------------------------
  private measure(a: AnalyserNode | null, rms: boolean) {
    if (!a) return -100;
    if (this.buf.length < a.fftSize) this.buf = new Float32Array(a.fftSize);
    const b = this.buf as Float32Array<ArrayBuffer>;
    a.getFloatTimeDomainData(b);
    let v = 0;
    for (let i = 0; i < a.fftSize; i++) { const x = b[i] ?? 0; v = rms ? v + x * x : Math.max(v, Math.abs(x)); }
    if (rms) v = Math.sqrt(v / a.fftSize);
    return v > 0 ? 20 * Math.log10(v) : -100;
  }
  level(id: string, mode: MeterMode) {
    const s = this.strips.get(id);
    return s ? this.measure(mode === "peak-pre" ? s.pre : s.postAn, mode === "rms-post") : -100;
  }
  groupLevel(id: string) { return this.measure(this.groups.get(id)?.an ?? null, false); }
  masterLevel(side: 0 | 1) { return this.ready ? this.measure(side === 0 ? this.n.anL : this.n.anR, false) : -100; }
  get masterAnalyser(): AnalyserNode | null { return this.ready ? this.n.anMix : null; }
  channelAnalyser(id: string) { return this.strips.get(id)?.pre ?? null; }
  compReduction(id: string) { return -(this.strips.get(id)?.comp.reduction ?? 0); }
  deessReduction(id: string) { return this.strips.get(id)?.deessRed ?? 0; }
  latency() {
    const c = this.ctx as AudioContext | undefined;
    return { base: (c?.baseLatency ?? 0) * 1000, output: (c?.outputLatency ?? 0) * 1000, sampleRate: c?.sampleRate ?? 0 };
  }
}

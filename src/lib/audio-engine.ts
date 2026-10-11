// Browser audio processing chain for streaming voice.
// mic -> input gain -> HPF -> gate -> EQ -> de-esser -> compressor -> warmth -> (delay/reverb sends) -> limiter -> output

export type Params = {
  input: { gain: number; hpfOn: boolean; hpf: number; browserNS: boolean };
  gate: { on: boolean; threshold: number; range: number; attack: number; release: number };
  eq: {
    on: boolean;
    lowGain: number; lowFreq: number;
    lmGain: number; lmFreq: number; lmQ: number;
    hmGain: number; hmFreq: number; hmQ: number;
    highGain: number; highFreq: number;
  };
  deess: { on: boolean; freq: number; threshold: number; range: number };
  comp: { on: boolean; threshold: number; ratio: number; attack: number; release: number; makeup: number };
  warmth: { on: boolean; drive: number };
  delay: { on: boolean; time: number; feedback: number; mix: number };
  reverb: { on: boolean; size: number; mix: number };
  limiter: { on: boolean; ceiling: number };
  output: { gain: number; mute: boolean };
};

export const defaultParams: Params = {
  input: { gain: 0, hpfOn: true, hpf: 80, browserNS: true },
  gate: { on: true, threshold: -50, range: -40, attack: 3, release: 150 },
  eq: {
    on: true,
    lowGain: 2, lowFreq: 120,
    lmGain: -2, lmFreq: 350, lmQ: 1,
    hmGain: 2, hmFreq: 3000, hmQ: 1,
    highGain: 2, highFreq: 10000,
  },
  deess: { on: true, freq: 6500, threshold: -30, range: 8 },
  comp: { on: true, threshold: -20, ratio: 4, attack: 10, release: 200, makeup: 4 },
  warmth: { on: false, drive: 20 },
  delay: { on: false, time: 280, feedback: 25, mix: 15 },
  reverb: { on: false, size: 1.5, mix: 12 },
  limiter: { on: true, ceiling: -1 },
  output: { gain: 0, mute: false },
};

const WORKLET = `
class Gate extends AudioWorkletProcessor {
  constructor(){super();this.p={on:true,threshold:-50,range:-40,attack:3,release:150};this.env=0;this.g=1;this.open=false;
    this.port.onmessage=e=>Object.assign(this.p,e.data);}
  process(inputs,outputs){const i=inputs[0],o=outputs[0];if(!i||!i[0])return true;
    const p=this.p,n=i[0].length,thr=Math.pow(10,p.threshold/20),floor=Math.pow(10,p.range/20);
    const a=Math.exp(-1/(sampleRate*Math.max(p.attack,0.1)/1000)),r=Math.exp(-1/(sampleRate*Math.max(p.release,1)/1000));
    for(let s=0;s<n;s++){let pk=0;for(let c=0;c<i.length;c++)pk=Math.max(pk,Math.abs(i[c][s]));
      this.env=pk>this.env?pk:this.env*0.9995;
      const target=!p.on?1:(this.env>thr?1:(this.env>thr*0.7&&this.g>0.5?1:floor));
      this.g=target>this.g?a*this.g+(1-a)*target:r*this.g+(1-r)*target;
      for(let c=0;c<o.length;c++)o[c][s]=(i[c]||i[0])[s]*this.g;}
    this.port.postMessage?null:null;return true;}
}
class DeEss extends AudioWorkletProcessor {
  constructor(){super();this.p={on:true,freq:6500,threshold:-30,range:8};this.x=0;this.y=0;this.env=0;this.g=1;this.red=0;this.t=0;
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

const db = (v: number) => Math.pow(10, v / 20);

function warmthCurve(drive: number) {
  const k = drive * 0.5;
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = k === 0 ? x : ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

function impulse(ctx: AudioContext, seconds: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

export class AudioEngine {
  ctx!: AudioContext;
  stream: MediaStream | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private n: Record<string, any> = {};
  private reverbSize = 0;
  deessReduction = 0;
  inAnalyser!: AnalyserNode;
  outAnalyser!: AnalyserNode;
  eqFilters: BiquadFilterNode[] = [];

  async init() {
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await this.ctx.audioWorklet.addModule(url);
    const c = this.ctx;
    const n = this.n;
    n.inGain = c.createGain();
    n.hpf = c.createBiquadFilter(); n.hpf.type = "highpass"; n.hpf.Q.value = 0.707;
    n.gate = new AudioWorkletNode(c, "sc-gate");
    n.low = c.createBiquadFilter(); n.low.type = "lowshelf";
    n.lm = c.createBiquadFilter(); n.lm.type = "peaking";
    n.hm = c.createBiquadFilter(); n.hm.type = "peaking";
    n.high = c.createBiquadFilter(); n.high.type = "highshelf";
    this.eqFilters = [n.low, n.lm, n.hm, n.high];
    n.deess = new AudioWorkletNode(c, "sc-deess");
    n.deess.port.onmessage = (e: MessageEvent) => (this.deessReduction = e.data);
    n.comp = c.createDynamicsCompressor(); n.comp.knee.value = 6;
    n.makeup = c.createGain();
    n.warm = c.createWaveShaper(); n.warm.oversample = "4x";
    n.bus = c.createGain();
    n.delay = c.createDelay(2); n.fb = c.createGain(); n.delaySend = c.createGain();
    n.verb = c.createConvolver(); n.verbSend = c.createGain();
    n.lim = c.createDynamicsCompressor(); n.lim.knee.value = 0; n.lim.attack.value = 0.001; n.lim.release.value = 0.05;
    n.out = c.createGain();
    this.inAnalyser = c.createAnalyser(); this.inAnalyser.fftSize = 1024;
    this.outAnalyser = c.createAnalyser(); this.outAnalyser.fftSize = 2048;

    n.inGain.connect(this.inAnalyser);
    n.inGain.connect(n.hpf).connect(n.gate).connect(n.low).connect(n.lm).connect(n.hm).connect(n.high)
      .connect(n.deess).connect(n.comp).connect(n.makeup).connect(n.warm);
    n.warm.connect(n.bus);
    n.warm.connect(n.delaySend).connect(n.delay).connect(n.bus);
    n.delay.connect(n.fb).connect(n.delay);
    n.warm.connect(n.verbSend).connect(n.verb).connect(n.bus);
    n.bus.connect(n.lim).connect(n.out).connect(this.outAnalyser).connect(c.destination);
  }

  async start(deviceId: string | undefined, browserNS: boolean) {
    if (!this.ctx) await this.init();
    await this.ctx.resume();
    this.stopStream();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        noiseSuppression: browserNS,
        echoCancellation: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    this.src = this.ctx.createMediaStreamSource(this.stream);
    this.src.connect(this.n.inGain);
  }

  stopStream() {
    this.src?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.src = null; this.stream = null;
  }

  async stop() {
    this.stopStream();
    await this.ctx?.suspend();
  }

  async setOutput(sinkId: string) {
    const c = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (c?.setSinkId) await c.setSinkId(sinkId === "default" ? "" : sinkId);
  }

  get compReduction() {
    return this.n.comp ? -this.n.comp.reduction : 0;
  }

  apply(p: Params) {
    if (!this.ctx) return;
    const n = this.n;
    const t = this.ctx.currentTime;
    const set = (a: AudioParam, v: number) => a.setTargetAtTime(v, t, 0.02);
    set(n.inGain.gain, db(p.input.gain));
    set(n.hpf.frequency, p.input.hpfOn ? p.input.hpf : 10);
    n.gate.port.postMessage(p.gate);
    const eq = p.eq;
    set(n.low.frequency, eq.lowFreq); set(n.low.gain, eq.on ? eq.lowGain : 0);
    set(n.lm.frequency, eq.lmFreq); set(n.lm.Q, eq.lmQ); set(n.lm.gain, eq.on ? eq.lmGain : 0);
    set(n.hm.frequency, eq.hmFreq); set(n.hm.Q, eq.hmQ); set(n.hm.gain, eq.on ? eq.hmGain : 0);
    set(n.high.frequency, eq.highFreq); set(n.high.gain, eq.on ? eq.highGain : 0);
    n.deess.port.postMessage(p.deess);
    const cp = p.comp;
    set(n.comp.threshold, cp.on ? cp.threshold : 0);
    set(n.comp.ratio, cp.on ? cp.ratio : 1);
    set(n.comp.attack, cp.attack / 1000);
    set(n.comp.release, cp.release / 1000);
    set(n.makeup.gain, cp.on ? db(cp.makeup) : 1);
    n.warm.curve = p.warmth.on && p.warmth.drive > 0 ? warmthCurve(p.warmth.drive) : null;
    set(n.delay.delayTime, p.delay.time / 1000);
    set(n.fb.gain, p.delay.feedback / 100);
    set(n.delaySend.gain, p.delay.on ? p.delay.mix / 100 : 0);
    if (this.reverbSize !== p.reverb.size) { n.verb.buffer = impulse(this.ctx, p.reverb.size); this.reverbSize = p.reverb.size; }
    set(n.verbSend.gain, p.reverb.on ? p.reverb.mix / 100 : 0);
    set(n.lim.threshold, p.limiter.on ? p.limiter.ceiling - 2 : 0);
    set(n.lim.ratio, p.limiter.on ? 20 : 1);
    set(n.out.gain, p.output.mute ? 0 : db(p.output.gain));
  }
}

export function levelDb(a: AnalyserNode, buf: Float32Array<ArrayBuffer>) {
  a.getFloatTimeDomainData(buf);
  let pk = 0;
  for (let i = 0; i < buf.length; i++) pk = Math.max(pk, Math.abs(buf[i]));
  return pk > 0 ? 20 * Math.log10(pk) : -100;
}

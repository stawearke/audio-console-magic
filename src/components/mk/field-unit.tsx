import { useCallback, useEffect, useRef, useState } from "react";

import {
  captureSize,
  DEFAULT_FIELD_FPS,
  DEFAULT_FIELD_ORIENT,
  DEFAULT_FIELD_QUALITY,
  fieldCapsOf,
  fieldCtlOf,
  fieldKbps,
  FIELD_FPS,
  FIELD_KBPS,
  FIELD_QUALITY,
  FieldReporter,
  videoConstraintsOf,
  type FieldBattery,
  type FieldCaps,
  type FieldCtl,
  type FieldFacing,
  type FieldOrient,
  type FieldSetup,
  type FieldTally,
} from "@/lib/mk/field-link";
import { whipStart, whipStop, type WhipTarget } from "@/lib/mk/whip";
import { cn } from "@/lib/utils";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const asRecord = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const field = "mk-button h-10 w-full rounded-sm px-2 text-sm text-foreground";
const QUALITY = FIELD_QUALITY;

type Dev = { id: string; label: string };

const ORIENT = [
  { id: "portrait", label: "Portrait · tall 9:16 (phone default)" },
  { id: "landscape", label: "Landscape · wide 16:9 (turns the phone sideways)" },
] as const;

/** Phone controls are real phones only: a laptop webcam is always wide and must not be nagged to turn. */
const isPhone = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

/** Reporter page: pick camera + mic (laptop webcam, capture card, phone camera), go live to the relay. */
export function FieldUnit() {
  const q =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const [target, setTarget] = useState<WhipTarget>({
    server: q.get("server") ?? "",
    path: q.get("path") ?? "",
    user: q.get("user") ?? "",
    pass: q.get("pass") ?? "",
  });
  const linked = !!(q.get("server") && q.get("path"));
  // Director link (no server of your own): ?room=…&unit=N&name=…&loc=…
  const room = q.get("room") ?? "";
  const unit = Math.max(0, Number(q.get("unit")) || 0);
  const p2p = !!(room && unit);
  const unitName = q.get("name") ?? "";
  const unitLoc = q.get("loc") ?? "";
  const [viewers, setViewers] = useState(0);
  const [registered, setRegistered] = useState(false);
  const reporter = useRef<FieldReporter | null>(null);
  const [cams, setCams] = useState<Dev[]>([]);
  const [mics, setMics] = useState<Dev[]>([]);
  const [cam, setCam] = useState("");
  const [mic, setMic] = useState("");
  const [quality, setQuality] = useState<string>(DEFAULT_FIELD_QUALITY);
  const [orient, setOrient] = useState<FieldOrient>(DEFAULT_FIELD_ORIENT);
  const [fps, setFps] = useState<number>(DEFAULT_FIELD_FPS);
  const [kbpsPick, setKbpsPick] = useState(0);
  const [deviceTall, setDeviceTall] = useState(true);
  const [ignoreTurn, setIgnoreTurn] = useState(false);
  const [lockNote, setLockNote] = useState("");
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  // Camera + mic the director can drive remotely (zoom, torch, focus, exposure, white balance, front/back, sound processing).
  const [facing, setFacing] = useState<FieldFacing>("environment");
  const facingRef = useRef(facing);
  facingRef.current = facing;
  // What the studio sends back: tally light, written cues, the director's voice.
  const [tally, setTally] = useState<FieldTally>("off");
  const [cue, setCue] = useState<{ text: string; seq: number } | null>(null);
  const [voice, setVoice] = useState<MediaStream | null>(null);
  const [battery, setBattery] = useState<FieldBattery | undefined>(undefined);
  const voiceEl = useRef<HTMLAudioElement>(null);
  const levelRef = useRef(0);
  const [caps, setCaps] = useState<FieldCaps | null>(null);
  const [ctl, setCtl] = useState<FieldCtl>({});
  // Sound is sent raw (no processing) until the director asks for it.
  const ctlRef = useRef<FieldCtl>({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
  const [live, setLive] = useState(false);
  const [state, setState] = useState("");
  const [error, setError] = useState("");
  const [stats, setStats] = useState({ kbps: 0, rtt: 0 });
  const [level, setLevel] = useState(0);

  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const session = useRef<string | null>(null);
  const want = useRef(false);
  const last = useRef({ bytes: 0, at: 0 });

  const secure = typeof window === "undefined" || window.isSecureContext;
  const portrait = orient === "portrait";
  // Portrait = the same picture standing up: 1080 x 1920 instead of 1920 x 1080.
  const { w: capW, h: capH } = captureSize(quality, orient);
  const kbpsEff = fieldKbps(quality, fps, kbpsPick);
  const held: FieldOrient = deviceTall ? "portrait" : "landscape";
  const needTurn = isPhone() && held !== orient && !ignoreTurn;
  const metaRef = useRef<{ orient: FieldOrient; fps: number; kbps: number; held: FieldOrient; caps?: FieldCaps; ctl: FieldCtl; battery?: FieldBattery }>({ orient, fps, kbps: kbpsEff, held, ctl });
  metaRef.current = { orient, fps, kbps: kbpsEff, held, ...(caps ? { caps } : {}), ctl, ...(battery ? { battery } : {}) };

  // How the phone is held right now (the director sees it, and we ask for a turn if it does not match).
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(orientation: portrait)");
    const on = () => setDeviceTall(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Lock the screen to the way the director wants it. Browsers only allow this full screen and after a tap,
  // so GO LIVE and the FULL SCREEN button ask for it; where it is refused (iPhone) the big "turn your phone" notice stays.
  const lockPhone = useCallback(async (o: FieldOrient, gesture: boolean) => {
    try {
      if (gesture && !document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    } catch {
      /* refused: carry on, the lock below may still work */
    }
    try {
      const so = (typeof screen !== "undefined" ? screen.orientation : undefined) as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
      if (!so?.lock) throw new Error("unsupported");
      await so.lock(o);
      setLockNote("");
    } catch {
      setLockNote("This phone will not lock its screen. Turn it by hand when asked.");
    }
  }, []);
  useEffect(() => {
    if (isPhone()) void lockPhone(orient, false);
    setIgnoreTurn(false);
  }, [orient, lockPhone]);

  /** Read what the camera and mic can do, and what they are doing now, and tell the studio. */
  const readControls = useCallback((s: MediaStream) => {
    const vt = s.getVideoTracks()[0];
    const at = s.getAudioTracks()[0];
    const vCaps = asRecord(vt?.getCapabilities?.());
    const aCaps = asRecord(at?.getCapabilities?.());
    const aSet = asRecord(at?.getSettings?.());
    setCaps(fieldCapsOf(vCaps, aCaps, aSet, isPhone()));
    setCtl(fieldCtlOf(asRecord(vt?.getSettings?.()), aSet, facingRef.current));
  }, []);

  /** The director moved something: zoom, torch, focus, exposure, white balance, front/back camera, sound processing. */
  const applyCtl = useCallback(
    async (patch: FieldCtl) => {
      let next: FieldCtl = { ...ctlRef.current, ...patch };
      if (patch.facing && patch.facing !== facingRef.current) {
        // A different camera has different abilities: drop what belonged to the old one, the studio sees the new list.
        next = {
          facing: patch.facing,
          ...(next.echoCancellation !== undefined ? { echoCancellation: next.echoCancellation } : {}),
          ...(next.noiseSuppression !== undefined ? { noiseSuppression: next.noiseSuppression } : {}),
          ...(next.autoGainControl !== undefined ? { autoGainControl: next.autoGainControl } : {}),
        };
        facingRef.current = patch.facing;
        setFacing(patch.facing);
        setCam("");
      }
      ctlRef.current = next;
      const s = stream.current;
      const vt = s?.getVideoTracks()[0];
      const at = s?.getAudioTracks()[0];
      const sets = videoConstraintsOf(next);
      if (vt && sets.length) await vt.applyConstraints({ advanced: sets }).catch(() => {});
      if (at && (patch.echoCancellation !== undefined || patch.noiseSuppression !== undefined || patch.autoGainControl !== undefined))
        await at
          .applyConstraints({
            echoCancellation: next.echoCancellation ?? false,
            noiseSuppression: next.noiseSuppression ?? false,
            autoGainControl: next.autoGainControl ?? false,
          })
          .catch(() => {});
      if (s) setCtl(fieldCtlOf(asRecord(vt?.getSettings?.()), asRecord(at?.getSettings?.()), facingRef.current));
    },
    [],
  );

  const open = useCallback(async () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    const s = await navigator.mediaDevices.getUserMedia({
      video: {
        ...(cam ? { deviceId: { exact: cam } } : { facingMode: facing }),
        width: { ideal: capW },
        height: { ideal: capH },
        aspectRatio: { ideal: capW / capH },
        frameRate: { ideal: fps },
      },
      audio: {
        ...(mic ? { deviceId: { exact: mic } } : {}),
        echoCancellation: ctlRef.current.echoCancellation ?? false,
        noiseSuppression: ctlRef.current.noiseSuppression ?? false,
        autoGainControl: ctlRef.current.autoGainControl ?? false,
      },
    });
    // Keep the picture sharp and smooth rather than letting the encoder trade it away.
    for (const t of s.getVideoTracks()) if ("contentHint" in t) t.contentHint = "motion";
    // The camera was just (re)opened: put back whatever the director had set (zoom, focus …).
    const again = videoConstraintsOf(ctlRef.current);
    if (again.length) await s.getVideoTracks()[0]?.applyConstraints({ advanced: again }).catch(() => {});
    stream.current = s;
    readControls(s);
    if (video.current) video.current.srcObject = s;
    const list = await navigator.mediaDevices.enumerateDevices();
    const dev = (k: string) =>
      list
        .filter((d) => d.kind === k)
        .map((d, i) => ({ id: d.deviceId, label: d.label || `${k} ${i + 1}` }));
    setCams(dev("videoinput"));
    setMics(dev("audioinput"));
    return s;
  }, [cam, mic, capW, capH, fps, facing, readControls]);

  // preview + mic meter
  useEffect(() => {
    if (!secure) return;
    let stop = false;
    let ctx: AudioContext | null = null;
    open()
      .then((s) => {
        reporter.current?.swapTracks(s);
        if (stop || s.getAudioTracks().length === 0) return;
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => {
          if (stop) return;
          an.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
          setLevel(peak);
          levelRef.current = peak;
          requestAnimationFrame(tick);
        };
        tick();
      })
      .catch((e) => setError(msg(e)));
    return () => {
      stop = true;
      void ctx?.close();
    };
  }, [open, secure]);

  const connect = useCallback(async () => {
    const s = stream.current;
    if (!s) return;
    pc.current?.close();
    const p = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.current = p;
    s.getTracks().forEach((t) => p.addTrack(t, s));
    const sender = p.getSenders().find((x) => x.track?.kind === "video");
    if (sender) {
      const prm = sender.getParameters();
      prm.encodings = [{ ...(prm.encodings?.[0] ?? {}), maxBitrate: kbpsEff * 1000, maxFramerate: fps }];
      await sender.setParameters(prm).catch(() => {});
    }
    p.onconnectionstatechange = () => {
      setState(p.connectionState);
      if (
        want.current &&
        (p.connectionState === "failed" || p.connectionState === "disconnected")
      ) {
        setTimeout(
          () => want.current && pc.current === p && void connect().catch((e) => setError(msg(e))),
          2000,
        );
      }
    };
    session.current = await whipStart(p, target);
  }, [target, kbpsEff, fps]);

  useEffect(() => {
    if (!p2p) return;
    const r = new FieldReporter(
      room,
      unit,
      () => ({ name: unitName, loc: unitLoc, ...metaRef.current }),
      () => stream.current,
      (st) => {
        setRegistered(st.registered);
        setViewers(st.viewers);
        if (st.error) setError(st.error);
      },
      // The director changed the picture: follow it (the camera is re-opened at that size, bitrate follows).
      (s: Partial<FieldSetup>) => {
        if (s.res) setQuality(s.res);
        if (s.fps) setFps(s.fps);
        if (s.orient) setOrient(s.orient);
        if (s.kbps !== undefined) setKbpsPick(s.kbps);
      },
      () => qualityRef.current,
      (c: FieldCtl) => void applyCtl(c),
      {
        tally: setTally,
        cue: (text, seq) => {
          setCue({ text, seq });
          try {
            navigator.vibrate?.([200, 100, 200]);
          } catch {
            /* not every phone can vibrate */
          }
        },
        voice: setVoice,
      },
    );
    reporter.current = r;
    void r.start();
    return () => {
      r.stop();
      reporter.current = null;
    };
  }, [p2p, room, unit, unitName, unitLoc, applyCtl]);

  // Quality / frame rate changed (by the director or here): tell the studio and apply it to running calls.
  useEffect(() => {
    // Bitrate "Auto" (0) means Auto quality: the phone may go below this and climbs back when the signal recovers.
    reporter.current?.setQuality(kbpsEff, fps, kbpsPick === 0);
  }, [kbpsEff, fps, quality, kbpsPick]);

  // Tell the studio (and OBS monitor) the moment the shape changes, the phone is turned, or the camera / mic changed.
  useEffect(() => {
    reporter.current?.announce();
  }, [orient, held, caps, ctl, battery]);

  // The studio's voice plays in the reporter's ear.
  useEffect(() => {
    const el = voiceEl.current;
    if (!el) return;
    el.srcObject = voice;
    if (voice) void el.play().catch(() => {});
  }, [voice]);

  // Phone battery, so the director knows before it dies.
  useEffect(() => {
    type Battery = { level: number; charging: boolean; addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void };
    let alive = true;
    let b: Battery | null = null;
    const read = () => b && alive && setBattery({ level: Math.round(b.level * 100), charging: b.charging });
    (navigator as Navigator & { getBattery?: () => Promise<Battery> }).getBattery?.().then(
      (x) => {
        if (!alive) return;
        b = x;
        read();
        x.addEventListener("levelchange", read);
        x.addEventListener("chargingchange", read);
      },
      () => {},
    );
    return () => {
      alive = false;
      b?.removeEventListener("levelchange", read);
      b?.removeEventListener("chargingchange", read);
    };
  }, []);

  // Mic level to the director's card, a few times a second.
  useEffect(() => {
    if (!live || !p2p) return;
    const id = setInterval(() => reporter.current?.sendLevel(levelRef.current), 250);
    return () => clearInterval(id);
  }, [live, p2p]);

  // Keep the screen awake while live (a sleeping phone stops the stream).
  useEffect(() => {
    if (!live) return;
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l), () => {});
    return () => void lock?.release().catch(() => {});
  }, [live]);

  const goLive = async () => {
    setError("");
    try {
      want.current = true;
      if (p2p) {
        if (!stream.current) await open();
        reporter.current?.setLive(true, kbpsEff);
      } else await connect();
      if (isPhone()) void lockPhone(orient, true);
      setLive(true);
    } catch (e) {
      want.current = false;
      setError(msg(e));
    }
  };
  const stopLive = async () => {
    want.current = false;
    setLive(false);
    reporter.current?.setLive(false, kbpsEff);
    await whipStop(session.current, target);
    pc.current?.close();
    pc.current = null;
    setState("");
  };
  useEffect(() => () => void stopLive(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Switching camera / mic while live: swap the track, the stream to the studio does not restart.
  useEffect(() => {
    const p = pc.current;
    const s = stream.current;
    if (!live || !p || !s) return;
    for (const t of s.getTracks())
      p.getSenders()
        .find((x) => x.track?.kind === t.kind)
        ?.replaceTrack(t)
        .catch(() => {});
  }, [live, cam, mic, quality, orient, fps]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(async () => {
      const p = pc.current ?? reporter.current?.statsPc() ?? null;
      if (!p) return;
      const r = await p.getStats();
      r.forEach((x) => {
        if (x.type === "outbound-rtp" && x.kind === "video") {
          const now = performance.now();
          if (last.current.at)
            setStats((o) => ({
              ...o,
              kbps: Math.round(((x.bytesSent - last.current.bytes) * 8) / (now - last.current.at)),
            }));
          last.current = { bytes: x.bytesSent, at: now };
        }
        if (
          x.type === "candidate-pair" &&
          x.state === "succeeded" &&
          x.currentRoundTripTime != null
        )
          setStats((o) => ({ ...o, rtt: Math.round(x.currentRoundTripTime * 1000) }));
      });
    }, 2000);
    return () => clearInterval(id);
  }, [live]);

  const ready = p2p || !!(target.server && target.path);

  return (
    <div className="mx-auto grid max-w-xl gap-3 p-3">
      <audio ref={voiceEl} autoPlay playsInline className="hidden" />
      {tally !== "off" && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none fixed inset-0 z-40 border-[8px]",
            tally === "program" ? "animate-pulse border-red-600" : "border-emerald-400",
          )}
        >
          <span className={cn("absolute left-1/2 top-2 -translate-x-1/2 rounded-sm px-3 py-1 font-mono text-xs font-bold tracking-[0.2em] text-white", tally === "program" ? "bg-red-600" : "bg-emerald-600")}>
            {tally === "program" ? "YOU ARE ON AIR" : "YOU ARE NEXT"}
          </span>
        </div>
      )}
      {cue && (
        <div role="alert" className="fixed inset-x-0 top-0 z-50 grid gap-2 bg-amber-500 p-4 text-center text-black shadow-lg">
          <div className="text-2xl font-black leading-tight">{cue.text}</div>
          <button
            type="button"
            className="mx-auto h-11 rounded-sm bg-black px-8 text-sm font-bold tracking-[0.15em] text-white"
            onClick={() => {
              reporter.current?.sendAck(cue.seq);
              setCue(null);
            }}
          >
            OK
          </button>
        </div>
      )}
      {voice && (
        <p className="rounded-sm border border-amber-400 p-2 text-center font-mono text-[11px] text-amber-300">
          The studio is talking to you. Wear headphones, or their voice goes back on air through your mic.
        </p>
      )}
      {p2p && (
        <div className="mk-panel rounded-md p-3 text-center">
          <div className="text-lg tracking-[0.15em] text-foreground">
            FIELD {unit}
            {unitName ? ` · ${unitName}` : ""}
          </div>
          {unitLoc && <div className="font-mono text-[11px] text-muted-foreground">{unitLoc}</div>}
          <div className="mt-1 font-mono text-[10px] text-muted-foreground">
            {registered ? "Connected to the studio link" : "Connecting to the studio link…"}
            {live && viewers > 0 ? ` · ${viewers} watching` : ""}
          </div>
        </div>
      )}
      {!secure && (
        <p className="rounded-sm border border-border p-2 font-mono text-[11px] text-foreground">
          The camera only works on an https:// page. Open this link from the https address.
        </p>
      )}
      {needTurn && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-6 text-center text-white">
          <div className={cn("h-24 w-14 rounded-xl border-4 border-white transition-transform", orient === "landscape" ? "rotate-90" : "rotate-0")} />
          <div className="text-xl font-bold tracking-[0.1em]">{orient === "landscape" ? "TURN YOUR PHONE SIDEWAYS" : "HOLD YOUR PHONE UPRIGHT"}</div>
          <p className="max-w-xs text-sm text-white/70">
            The studio wants this shot {orient === "landscape" ? "wide (landscape)" : "tall (portrait)"}.
          </p>
          <button type="button" className="mk-button h-11 rounded-sm px-5 text-sm" onClick={() => void lockPhone(orient, true)}>
            FULL SCREEN · LOCK
          </button>
          <button type="button" className="text-xs text-white/50 underline" onClick={() => setIgnoreTurn(true)}>
            Keep going this way
          </button>
          {lockNote && <p className="max-w-xs text-[11px] text-white/50">{lockNote}</p>}
        </div>
      )}
      <div className="relative overflow-hidden rounded-md bg-black">
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          className={cn(
            "object-contain",
            portrait ? "mx-auto block aspect-[9/16] h-[70vh] w-auto max-w-full" : "aspect-video w-full",
          )}
        />
        <span
          className={cn(
            "absolute left-2 top-2 rounded-sm px-2 py-0.5 font-mono text-[11px]",
            live ? "mk-lit-program" : "mk-button",
          )}
        >
          {live
            ? p2p
              ? viewers > 0
                ? "LIVE"
                : "WAITING FOR STUDIO"
              : state === "connected"
                ? "LIVE"
                : state.toUpperCase() || "CONNECTING"
            : "OFF AIR"}
        </span>
        <div
          className="absolute bottom-0 left-0 h-1.5 bg-emerald-400"
          style={{ width: `${Math.min(100, level * 140)}%` }}
        />
      </div>

      {error && (
        <p className="rounded-sm border border-border p-2 font-mono text-[11px] text-foreground">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!ready || !secure}
        onClick={() => void (live ? stopLive() : goLive())}
        className={cn(
          "mk-button h-14 rounded-sm text-base tracking-[0.15em]",
          live && "mk-lit-program",
        )}
      >
        {live ? "STOP" : "GO LIVE"}
      </button>
      {live && (
        <p className="text-center font-mono text-[11px] text-muted-foreground">
          {(stats.kbps / 1000).toFixed(1)} Mbps · delay {stats.rtt} ms
        </p>
      )}

      <label className="grid gap-1">
        <span className="mk-label text-[9px]">CAMERA (laptop, phone, capture card)</span>
        <select value={cam} onChange={(e) => setCam(e.target.value)} className={field}>
          <option value="">Default / back camera</option>
          {cams.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="mk-label text-[9px]">MICROPHONE / AUDIO INPUT</span>
        <select value={mic} onChange={(e) => setMic(e.target.value)} className={field}>
          <option value="">Default</option>
          {mics.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="mk-label text-[9px]">VIDEO SHAPE{p2p ? " (set by the director)" : ""}</span>
        <select value={orient} onChange={(e) => setOrient(e.target.value as FieldOrient)} disabled={p2p} className={field}>
          {ORIENT.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="mk-label text-[9px]">QUALITY{p2p ? " (set by the director)" : ""}</span>
        <select value={quality} onChange={(e) => setQuality(e.target.value)} disabled={live || p2p} className={field}>
          {QUALITY.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">
          <span className="mk-label text-[9px]">FRAME RATE{p2p ? " (director)" : ""}</span>
          <select value={fps} onChange={(e) => setFps(Number(e.target.value))} disabled={live || p2p} className={field}>
            {FIELD_FPS.map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="mk-label text-[9px]">BITRATE{p2p ? " (director)" : ""}</span>
          <select value={kbpsPick} onChange={(e) => setKbpsPick(Number(e.target.value))} disabled={live || p2p} className={field}>
            {FIELD_KBPS.map((k) => (
              <option key={k} value={k}>
                {k === 0 ? `Auto · ${(fieldKbps(quality, fps) / 1000).toFixed(1)} Mbps` : `${k / 1000} Mbps`}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isPhone() && (
        <button type="button" className={field} onClick={() => void lockPhone(orient, true)}>
          FULL SCREEN · LOCK ROTATION
        </button>
      )}

      {!linked && !p2p && (
        <div className="mk-panel grid gap-2 rounded-md p-3">
          <div className="mk-label text-[9px]">RELAY (normally filled by your link)</div>
          {(["server", "path", "user", "pass"] as const).map((k) => (
            <input
              key={k}
              value={target[k]}
              onChange={(e) => setTarget({ ...target, [k]: e.target.value })}
              placeholder={k === "server" ? "https://relay.example.com" : k}
              type={k === "pass" ? "password" : "text"}
              className={field}
              autoComplete="off"
            />
          ))}
        </div>
      )}
    </div>
  );
}

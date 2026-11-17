import { useCallback, useEffect, useRef, useState } from "react";

import { whipStart, whipStop, type WhipTarget } from "@/lib/mk/whip";
import { cn } from "@/lib/utils";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const field = "mk-button h-10 w-full rounded-sm px-2 text-sm text-foreground";
const QUALITY = [
  { id: "720", label: "720p · 2.5 Mbps (safe on mobile data)", w: 1280, h: 720, kbps: 2500 },
  { id: "1080", label: "1080p · 4.5 Mbps (good connection)", w: 1920, h: 1080, kbps: 4500 },
  { id: "480", label: "480p · 1 Mbps (weak signal)", w: 854, h: 480, kbps: 1000 },
];

type Dev = { id: string; label: string };

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
  const [cams, setCams] = useState<Dev[]>([]);
  const [mics, setMics] = useState<Dev[]>([]);
  const [cam, setCam] = useState("");
  const [mic, setMic] = useState("");
  const [quality, setQuality] = useState("720");
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
  const qual = QUALITY.find((x) => x.id === quality) ?? QUALITY[0]!;

  const open = useCallback(async () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    const s = await navigator.mediaDevices.getUserMedia({
      video: {
        ...(cam ? { deviceId: { exact: cam } } : { facingMode: "environment" }),
        width: { ideal: qual.w },
        height: { ideal: qual.h },
        frameRate: { ideal: 30 },
      },
      audio: {
        ...(mic ? { deviceId: { exact: mic } } : {}),
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    stream.current = s;
    if (video.current) video.current.srcObject = s;
    const list = await navigator.mediaDevices.enumerateDevices();
    const dev = (k: string) =>
      list
        .filter((d) => d.kind === k)
        .map((d, i) => ({ id: d.deviceId, label: d.label || `${k} ${i + 1}` }));
    setCams(dev("videoinput"));
    setMics(dev("audioinput"));
    return s;
  }, [cam, mic, qual.w, qual.h]);

  // preview + mic meter
  useEffect(() => {
    if (!secure) return;
    let stop = false;
    let ctx: AudioContext | null = null;
    open()
      .then((s) => {
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
      prm.encodings = [{ ...(prm.encodings?.[0] ?? {}), maxBitrate: qual.kbps * 1000 }];
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
  }, [target, qual.kbps]);

  const goLive = async () => {
    setError("");
    try {
      want.current = true;
      await connect();
      setLive(true);
    } catch (e) {
      want.current = false;
      setError(msg(e));
    }
  };
  const stopLive = async () => {
    want.current = false;
    setLive(false);
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
  }, [live, cam, mic, quality]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(async () => {
      const p = pc.current;
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

  const ready = !!(target.server && target.path);

  return (
    <div className="mx-auto grid max-w-xl gap-3 p-3">
      {!secure && (
        <p className="rounded-sm border border-border p-2 font-mono text-[11px] text-foreground">
          The camera only works on an https:// page. Open this link from the https address.
        </p>
      )}
      <div className="relative overflow-hidden rounded-md bg-black">
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          className="aspect-video w-full object-contain"
        />
        <span
          className={cn(
            "absolute left-2 top-2 rounded-sm px-2 py-0.5 font-mono text-[11px]",
            live ? "mk-lit-program" : "mk-button",
          )}
        >
          {live
            ? state === "connected"
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
        <span className="mk-label text-[9px]">QUALITY</span>
        <select
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
          disabled={live}
          className={field}
        >
          {QUALITY.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>

      {!linked && (
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

import { Eye, EyeOff, Pause, Play, Radio, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  AUDIO_BITRATES,
  OutputClient,
  REC_FORMATS,
  REC_QUALITIES,
  SERVER_PRESETS,
  type OutputStatus,
  type QualitySettings,
  type StreamDest,
} from "@/lib/mk/obs-output";
import { cn } from "@/lib/utils";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const IDLE: OutputStatus = {
  streaming: false,
  recording: false,
  recordPaused: false,
  streamTime: "",
  recordTime: "",
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mk-panel grid content-start gap-2 rounded-md p-3">
      <div className="mk-label text-[9px]">{title}</div>
      {children}
    </section>
  );
}

const field = "mk-button h-9 w-full rounded-sm px-2 text-xs text-foreground";

export function StreamSettings() {
  const ref = useRef<OutputClient | null>(null);
  const [status, setStatus] = useState<"connecting" | "ready" | "error">("connecting");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [out, setOut] = useState<OutputStatus>(IDLE);
  const [dest, setDest] = useState<StreamDest>({ type: "", server: "", key: "", service: "" });
  const [custom, setCustom] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [q, setQ] = useState<QualitySettings>({
    mode: "Simple",
    videoBitrate: "",
    audioBitrate: "",
    recFormat: "",
    recQuality: "",
  });
  const [folder, setFolder] = useState("");

  const load = useCallback(async (c: OutputClient) => {
    setDest(await c.dest());
    setQ(await c.quality());
    setFolder(await c.recordFolder().catch(() => ""));
    setOut(await c.status());
  }, []);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError("");
    const c = new OutputClient();
    try {
      await ref.current?.disconnect();
      ref.current = c;
      c.onClose = () => {
        setStatus("error");
        setError("Connection to OBS lost.");
      };
      await c.connect();
      await load(c);
      setStatus("ready");
    } catch (e) {
      setStatus("error");
      setError(msg(e));
    }
  }, [load]);

  useEffect(() => {
    void connect();
    return () => {
      void ref.current?.disconnect();
    };
  }, [connect]);

  useEffect(() => {
    if (status !== "ready") return;
    const id = setInterval(() => {
      void ref.current
        ?.status()
        .then(setOut)
        .catch(() => {});
    }, 1500);
    return () => clearInterval(id);
  }, [status]);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setError("");
    setNote("");
    try {
      await fn();
      if (done) setNote(done);
      if (ref.current) setOut(await ref.current.status());
    } catch (e) {
      setError(msg(e));
    }
  };

  const c = ref.current;
  if (status !== "ready" || !c) {
    return (
      <div className="mk-panel mx-auto mt-6 grid max-w-xl gap-3 rounded-md p-4">
        <div className="text-sm text-foreground">
          {status === "connecting" ? "Connecting to OBS…" : "Cannot reach OBS"}
        </div>
        {error && <p className="font-mono text-[11px] text-muted-foreground">{error}</p>}
        <p className="font-mono text-[10px] text-muted-foreground">
          In OBS turn on Tools → WebSocket Server Settings, then check the host, port and password
          in MK Settings.
        </p>
        <button
          type="button"
          onClick={() => void connect()}
          className="mk-button flex h-9 w-fit items-center gap-2 rounded-sm px-3 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
      </div>
    );
  }

  const advanced = q.mode === "Advanced";

  return (
    <div className="grid gap-3 p-3 lg:grid-cols-2">
      {(error || note) && (
        <p className="rounded-sm border border-border p-2 font-mono text-[11px] text-foreground lg:col-span-2">
          {error || note}
        </p>
      )}

      <Panel title="GO LIVE / RECORD">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (!out.streaming) return void run(() => c.startStream());
              if (window.confirm("Stop streaming?")) void run(() => c.stopStream());
            }}
            className={cn(
              "mk-button flex h-11 min-w-[11rem] items-center justify-between gap-3 rounded-sm px-4 text-sm",
              out.streaming && "mk-lit-program",
            )}
          >
            <span className="flex items-center gap-2">
              <Radio className="h-4 w-4" />
              {out.streaming ? "STOP STREAM" : "START STREAM"}
            </span>
            <span className="font-mono text-[11px]">{out.streamTime}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!out.recording) return void run(() => c.startRecord());
              if (window.confirm("Stop recording?")) void run(() => c.stopRecord());
            }}
            className={cn(
              "mk-button flex h-11 min-w-[11rem] items-center justify-between gap-3 rounded-sm px-4 text-sm",
              out.recording && !out.recordPaused && "mk-lit-program",
              out.recordPaused && "mk-lit-amber",
            )}
          >
            <span>{out.recording ? "STOP RECORDING" : "START RECORDING"}</span>
            <span className="font-mono text-[11px]">{out.recordTime}</span>
          </button>
          <button
            type="button"
            disabled={!out.recording}
            onClick={() => void run(() => c.toggleRecordPause())}
            aria-label={out.recordPaused ? "Resume recording" : "Pause recording"}
            className="mk-button flex h-11 w-11 items-center justify-center rounded-sm"
          >
            {out.recordPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">
          Stream settings can only be changed while not streaming.
        </p>
      </Panel>

      <Panel title="STREAM DESTINATION">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mk-label text-[9px]">QUICK FILL SERVER</span>
          {SERVER_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setDest({ ...dest, server: p.server });
                setCustom(true);
              }}
              className="mk-button h-7 rounded-sm px-2 text-[11px]"
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="grid gap-1">
          <span className="mk-label text-[9px]">
            SERVER {dest.type === "rtmp_common" && dest.service ? `· ${dest.service}` : ""}
          </span>
          <input
            value={dest.server}
            onChange={(e) => setDest({ ...dest, server: e.target.value })}
            className={field}
            placeholder="rtmp://…"
          />
        </label>
        <label className="grid gap-1">
          <span className="mk-label text-[9px]">STREAM KEY</span>
          <span className="flex gap-1">
            <input
              type={showKey ? "text" : "password"}
              value={dest.key}
              onChange={(e) => setDest({ ...dest, key: e.target.value })}
              className={field}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? "Hide key" : "Show key"}
              className="mk-button flex h-9 w-9 shrink-0 items-center justify-center rounded-sm"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>
        <button
          type="button"
          disabled={out.streaming}
          onClick={() => void run(() => c.saveDest(dest, custom), "Stream destination saved.")}
          className="mk-button h-9 w-fit rounded-sm px-4 text-xs"
        >
          Save destination
        </button>
      </Panel>

      <Panel title="QUALITY">
        {advanced ? (
          <p className="font-mono text-[10px] text-muted-foreground">
            OBS is in Advanced output mode, so bitrate is set in OBS → Settings → Output. The
            recording format below still works.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              <span className="mk-label text-[9px]">VIDEO BITRATE (kbps)</span>
              <input
                value={q.videoBitrate}
                inputMode="numeric"
                onChange={(e) => setQ({ ...q, videoBitrate: e.target.value.replace(/\D/g, "") })}
                className={field}
              />
            </label>
            <label className="grid gap-1">
              <span className="mk-label text-[9px]">AUDIO BITRATE (kbps)</span>
              <select
                value={q.audioBitrate}
                onChange={(e) => setQ({ ...q, audioBitrate: e.target.value })}
                className={field}
              >
                {!AUDIO_BITRATES.map(String).includes(q.audioBitrate) && (
                  <option value={q.audioBitrate}>{q.audioBitrate || "—"}</option>
                )}
                {AUDIO_BITRATES.map((b) => (
                  <option key={b} value={String(b)}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </Panel>

      <Panel title="RECORDING">
        <label className="grid gap-1">
          <span className="mk-label text-[9px]">SAVE FOLDER (on the OBS computer)</span>
          <input
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className={field}
            placeholder="C:\Users\…\Videos"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="mk-label text-[9px]">FORMAT</span>
            <select
              value={q.recFormat}
              onChange={(e) => setQ({ ...q, recFormat: e.target.value })}
              className={field}
            >
              {!REC_FORMATS.some((f) => f.value === q.recFormat) && (
                <option value={q.recFormat}>{q.recFormat || "—"}</option>
              )}
              {REC_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          {!advanced && (
            <label className="grid gap-1">
              <span className="mk-label text-[9px]">QUALITY</span>
              <select
                value={q.recQuality}
                onChange={(e) => setQ({ ...q, recQuality: e.target.value })}
                className={field}
              >
                {!REC_QUALITIES.some((f) => f.value === q.recQuality) && (
                  <option value={q.recQuality}>{q.recQuality || "—"}</option>
                )}
                {REC_QUALITIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <button
          type="button"
          disabled={out.recording}
          onClick={() =>
            void run(async () => {
              if (folder.trim()) await c.setRecordFolder(folder.trim());
              await c.saveQuality(q);
              await load(c);
            }, "Quality and recording settings saved.")
          }
          className="mk-button h-9 w-fit rounded-sm px-4 text-xs"
        >
          Save quality &amp; recording
        </button>
      </Panel>
    </div>
  );
}

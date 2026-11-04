import { Eye, EyeOff, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  loadMultistream,
  saveMultistream,
  SERVER_PRESETS,
  startMultistream,
  stopMultistream,
  type MultistreamInfo,
  type MultistreamTarget,
} from "@/lib/mk/multistream";
import { cn } from "@/lib/utils";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Row {
  id?: string;
  name: string;
  server: string;
  key: string;
  keyHint: string;
  hasKey: boolean;
  enabled: boolean;
}

const toRow = (t: MultistreamTarget): Row => ({
  id: t.id,
  name: t.name,
  server: t.server,
  key: "",
  keyHint: t.keyHint,
  hasKey: t.hasKey,
  enabled: t.enabled,
});

const STATE_TEXT: Record<string, string> = {
  idle: "OFF",
  connecting: "CONNECTING",
  live: "LIVE",
  reconnecting: "RECONNECTING",
  failed: "FAILED",
};

const clock = (s: number) =>
  `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const field = "mk-button h-9 w-full rounded-sm px-2 text-xs text-foreground";

export function MultistreamPanel() {
  const [info, setInfo] = useState<MultistreamInfo | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [showKey, setShowKey] = useState<Record<number, boolean>>({});
  const loadedOnce = useRef(false);

  const apply = useCallback((r: MultistreamInfo, resetRows: boolean) => {
    setInfo(r);
    if (resetRows) {
      setRows(r.targets.map(toRow));
      setDirty(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await loadMultistream();
      apply(r, !loadedOnce.current);
      loadedOnce.current = true;
      if (r.error) setError(r.error);
    } catch (e) {
      setInfo(null);
      setError(msg(e));
    }
  }, [apply]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 1500);
    return () => clearInterval(id);
  }, [refresh]);

  const run = async (fn: () => Promise<MultistreamInfo>, resetRows = false, done?: string) => {
    setError("");
    setNote("");
    try {
      const r = await fn();
      apply(r, resetRows);
      if (r.error) setError(r.error);
      else if (done) setNote(done);
    } catch (e) {
      setError(msg(e));
    }
  };

  const edit = (i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  if (!info)
    return (
      <div className="mk-panel mx-auto mt-6 grid max-w-xl gap-3 rounded-md p-4">
        <div className="text-sm text-foreground">Multistream is only in MK VISION Studio</div>
        {error && <p className="font-mono text-[11px] text-muted-foreground">{error}</p>}
        <button
          type="button"
          onClick={() => void refresh()}
          className="mk-button flex h-9 w-fit items-center gap-2 rounded-sm px-3 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
      </div>
    );

  const liveCount = info.targets.filter(
    (t) => t.state === "live" || t.state === "reconnecting" || t.state === "connecting",
  ).length;
  const totalMbps = info.targets.reduce((sum, t) => sum + t.kbps, 0) / 1000;
  const byId = new Map(info.targets.map((t) => [t.id, t]));

  return (
    <div className="grid gap-3 p-3">
      <section className="mk-panel grid gap-2 rounded-md p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mk-label text-[9px]">MAIN STREAM</div>
          <span
            className={cn(
              "mk-button flex h-7 items-center rounded-sm px-3 text-[11px]",
              info.mainLive && "mk-lit-program",
            )}
          >
            {info.mainLive ? "LIVE" : "OFF"}
          </span>
          <div className="mk-label ml-2 text-[9px]">EXTRA UPLOAD</div>
          <span className="font-mono text-xs text-foreground">{totalMbps.toFixed(1)} Mbps</span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={!info.mainLive || dirty}
              onClick={() => void run(() => startMultistream())}
              className="mk-button h-9 rounded-sm px-4 text-xs"
            >
              Start all switched-on
            </button>
            <button
              type="button"
              disabled={liveCount === 0}
              onClick={() => {
                if (window.confirm("Stop every extra destination? The main stream keeps running."))
                  void run(() => stopMultistream());
              }}
              className="mk-button h-9 rounded-sm px-4 text-xs"
            >
              Stop all
            </button>
          </div>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">
          Extra destinations send the same picture as your main stream, so they cost no extra
          processing. Each one needs its own upload speed: with a 5 Mbps main stream and three
          extras you need about 20 Mbps of real upload.
          {!info.mainLive && " They start by themselves when the main stream starts."}
        </p>
      </section>

      {(error || note) && (
        <p className="rounded-sm border border-border p-2 font-mono text-[11px] text-foreground">
          {error || note}
        </p>
      )}

      <ul className="grid gap-2">
        {rows.map((row, i) => {
          const live = row.id ? byId.get(row.id) : undefined;
          const state = live?.state ?? "idle";
          const running = state === "live" || state === "connecting" || state === "reconnecting";
          return (
            <li key={row.id ?? `new${i}`} className="mk-panel grid gap-2 rounded-md p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={row.name}
                  onChange={(e) => edit(i, { name: e.target.value })}
                  placeholder="Name, e.g. YouTube"
                  className={cn(field, "max-w-[14rem]")}
                  aria-label="Name"
                />
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => edit(i, { enabled: e.target.checked })}
                  />{" "}
                  Switched on
                </label>
                <span
                  className={cn(
                    "mk-button flex h-7 items-center rounded-sm px-3 font-mono text-[10px]",
                    state === "live" && "mk-lit-program",
                    (state === "connecting" || state === "reconnecting") && "mk-lit-amber",
                  )}
                >
                  {STATE_TEXT[state]}
                </span>
                {live && state === "live" && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {(live.kbps / 1000).toFixed(1)} Mbps · dropped {live.dropped.toFixed(1)}% ·{" "}
                    {clock(live.seconds)}
                  </span>
                )}
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    disabled={!row.id || dirty || (!running && !info.mainLive)}
                    onClick={() =>
                      void run(() => (running ? stopMultistream(row.id) : startMultistream(row.id)))
                    }
                    className="mk-button h-9 rounded-sm px-4 text-xs"
                  >
                    {running ? "Stop" : "Start"}
                  </button>
                  <button
                    type="button"
                    aria-label="Remove destination"
                    onClick={() => {
                      if (window.confirm(`Remove “${row.name || "this destination"}”?`)) {
                        setRows((rs) => rs.filter((_, n) => n !== i));
                        setDirty(true);
                      }
                    }}
                    className="mk-button flex h-9 w-9 items-center justify-center rounded-sm"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {state === "failed" && live?.error && (
                <p className="font-mono text-[11px] text-foreground">{live.error}</p>
              )}
              <div className="flex flex-wrap items-center gap-1">
                <span className="mk-label text-[9px]">QUICK FILL</span>
                {SERVER_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => edit(i, { server: p.server, name: row.name || p.name })}
                    className="mk-button h-7 rounded-sm px-2 text-[11px]"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="mk-label text-[9px]">SERVER</span>
                  <input
                    value={row.server}
                    onChange={(e) => edit(i, { server: e.target.value })}
                    placeholder="rtmp://…"
                    className={field}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="mk-label text-[9px]">
                    STREAM KEY {row.hasKey && !row.key ? `· saved ${row.keyHint}` : ""}
                  </span>
                  <span className="flex gap-1">
                    <input
                      type={showKey[i] ? "text" : "password"}
                      value={row.key}
                      onChange={(e) => edit(i, { key: e.target.value })}
                      placeholder={
                        row.hasKey ? "Leave empty to keep the saved key" : "Paste the stream key"
                      }
                      className={field}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((s) => ({ ...s, [i]: !s[i] }))}
                      aria-label={showKey[i] ? "Hide key" : "Show key"}
                      className="mk-button flex h-9 w-9 shrink-0 items-center justify-center rounded-sm"
                    >
                      {showKey[i] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </span>
                </label>
              </div>
            </li>
          );
        })}
        {!rows.length && (
          <li className="font-mono text-[11px] text-muted-foreground">
            No extra destinations yet.
          </li>
        )}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={rows.length >= info.max}
          onClick={() => {
            setRows((rs) => [
              ...rs,
              { name: "", server: "", key: "", keyHint: "", hasKey: false, enabled: true },
            ]);
            setDirty(true);
          }}
          className="mk-button flex h-9 items-center gap-2 rounded-sm px-4 text-xs"
        >
          <Plus className="h-4 w-4" /> Add destination
        </button>
        <button
          type="button"
          disabled={!dirty}
          onClick={() =>
            void run(
              () =>
                saveMultistream(
                  rows.map((r) => ({
                    id: r.id,
                    name: r.name,
                    server: r.server,
                    key: r.key,
                    enabled: r.enabled,
                  })),
                ),
              true,
              "Saved.",
            )
          }
          className="mk-button h-9 rounded-sm px-4 text-xs"
        >
          Save changes
        </button>
        {dirty && (
          <span className="self-center font-mono text-[10px] text-muted-foreground">
            Unsaved changes: save before starting.
          </span>
        )}
      </div>
    </div>
  );
}

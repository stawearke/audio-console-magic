import { useCallback, useEffect, useState } from "react";

import {
  formatBytes,
  formatDuration,
  saveRecording,
  type RecMeta,
  type RecStatus,
  type RecStore,
} from "@/lib/mk/field-record";
import { cn } from "@/lib/utils";

/** Backup-recording UI: the phone's running line and saved list, and the director's REC chip. */

/** On the director's unit card while the phone is keeping a full-quality backup. */
export function RecChip({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span
      className="mk-button inline-flex items-center gap-1.5 rounded-[3px] px-2 py-1 font-mono text-[10px]"
      title="The reporter's phone is keeping a full-quality backup recording"
    >
      <span aria-hidden className="h-2 w-2 rounded-full bg-red-500" />
      REC
    </span>
  );
}

/** The reporter's line while recording (or the reason it stopped). Nothing when idle and fine. */
export function RecStatusLine({ status }: { status: RecStatus }) {
  if (!status.on && !status.error) return null;
  return (
    <div className="grid gap-0.5 text-center font-mono text-[11px]" data-testid="rec-status">
      {status.on && (
        <p className="text-muted-foreground">
          <span
            aria-hidden
            className="mr-1.5 inline-block h-2 w-2 rounded-full bg-red-500 align-middle"
          />
          Backup recording {formatDuration(status.ms)} · {formatBytes(status.bytes)}
          {status.parts > 1 ? ` · ${status.parts} parts` : ""}
        </p>
      )}
      {status.error && <p className="text-amber-400">{status.error}</p>}
    </div>
  );
}

/** Saved backups on this phone: save or share them after the show, delete them to free space. */
export function RecordingsPanel({
  store,
  status,
  enabled,
  onEnabled,
}: {
  store: RecStore | null;
  status: RecStatus;
  enabled: boolean;
  onEnabled: (on: boolean) => void;
}) {
  const [list, setList] = useState<RecMeta[]>([]);
  const [space, setSpace] = useState<{ used: number; quota: number } | null>(null);
  const [note, setNote] = useState("");

  const refresh = useCallback(async () => {
    if (!store) return;
    try {
      setList(await store.list());
    } catch {
      /* an unreadable list shows as empty */
    }
    try {
      const e = await navigator.storage?.estimate?.();
      if (e?.quota !== undefined && e.usage !== undefined)
        setSpace({ used: e.usage, quota: e.quota });
    } catch {
      /* the browser does not say */
    }
  }, [store]);
  // Again whenever a recording starts or ends.
  useEffect(() => {
    void refresh();
  }, [refresh, status.on]);

  if (!store)
    return (
      <p
        className="rounded-sm border border-border p-2 font-mono text-[11px] text-muted-foreground"
        data-testid="rec-panel"
      >
        This browser cannot keep a backup recording.
      </p>
    );

  const save = async (m: RecMeta) => {
    setNote("");
    try {
      const r = await saveRecording(store, m);
      setNote(
        r === "shared" ? "Sent." : r === "downloaded" ? "Saved to this phone's downloads." : "",
      );
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not save it.");
    }
  };
  const del = async (m: RecMeta) => {
    if (!confirm(`Delete the backup "${m.name}"? This cannot be undone.`)) return;
    await store.remove(m.id).catch(() => {});
    await refresh();
  };

  return (
    <details className="rounded-sm border border-border p-2" data-testid="rec-panel">
      <summary className="mk-label cursor-pointer text-[9px]">
        BACKUP RECORDINGS{list.length ? ` (${list.length})` : ""}
      </summary>
      <div className="mt-2 grid gap-2">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={enabled}
            disabled={status.on}
            onChange={(e) => onEnabled(e.target.checked)}
          />
          Record a full-quality backup on this phone while live
        </label>
        <p className="font-mono text-[10px] text-muted-foreground">
          The studio gets the live picture; this copy stays on your phone at full quality. After the
          show, share it, then delete it to free space.
          {space ? ` Space used: ${formatBytes(space.used)} of ${formatBytes(space.quota)}.` : ""}
        </p>
        {list.length === 0 && (
          <p className="font-mono text-[11px] text-muted-foreground">No backups yet.</p>
        )}
        {list.map((m, i) => {
          const running = status.on && !m.endedAt && i === 0;
          const cut = !m.endedAt && !running;
          return (
            <div key={m.id} className="grid gap-1 rounded-sm bg-black/20 p-2" data-testid="rec-row">
              <div className="font-mono text-[11px]">
                {m.name || "Field"} · {new Date(m.startedAt).toLocaleString()}
              </div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {running
                  ? "recording now"
                  : cut
                    ? "cut short (still saved)"
                    : formatDuration((m.endedAt ?? m.startedAt) - m.startedAt)}{" "}
                · {formatBytes(m.bytes)}
                {m.parts > 1 ? ` · ${m.parts} parts` : ""}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={running}
                  className={cn("mk-button h-8 flex-1 rounded-[3px] text-xs")}
                  onClick={() => void save(m)}
                >
                  SAVE / SHARE
                </button>
                <button
                  type="button"
                  disabled={running}
                  className="mk-button h-8 rounded-[3px] px-3 text-xs"
                  onClick={() => void del(m)}
                >
                  DELETE
                </button>
              </div>
            </div>
          );
        })}
        {note && <p className="font-mono text-[11px] text-amber-400">{note}</p>}
      </div>
    </details>
  );
}

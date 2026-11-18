import { useCallback, useEffect, useState } from "react";

import {
  formatBytes,
  formatDuration,
  minutesOfSpace,
  saveRecording,
  spaceLeftText,
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
      data-testid="rec-chip"
      className="mk-button inline-flex items-center gap-1.5 rounded-[3px] px-2 py-1 font-mono text-[10px]"
      title="The reporter's phone is keeping a full-quality backup recording"
    >
      <span aria-hidden className="h-2 w-2 rounded-full bg-red-500" />
      REC
    </span>
  );
}

/** The director's REC control for one unit: starts or stops the backup on the reporter's phone. */
export function RecRemote({
  online,
  on,
  onToggle,
}: {
  online: boolean;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="mk-label text-[9px]">PHONE BACKUP</span>
      <button
        type="button"
        data-testid="rec-remote"
        disabled={!online}
        onClick={onToggle}
        title="Start or stop the full-quality backup recording on the reporter's phone"
        className={cn("mk-button h-8 rounded-[3px] px-3 text-xs", on && "mk-lit-program")}
      >
        {on ? "STOP REC" : "REC"}
      </button>
    </div>
  );
}

/** The reporter's own REC button: the backup records only when the reporter presses it, and stops only when pressed again. */
export function RecButton({
  on,
  disabled,
  onToggle,
}: {
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="rec-button"
      disabled={disabled}
      onClick={onToggle}
      className={cn("mk-button h-11 rounded-sm text-sm tracking-[0.15em]", on && "mk-lit-program")}
    >
      <span aria-hidden className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-red-500 align-middle" />
      {on ? "STOP REC" : "REC"}
    </button>
  );
}

/** How long the phone can keep recording at the current quality. Amber when it is getting short. */
export function RecSpace({ freeBytes, kbps }: { freeBytes: number | null; kbps: number }) {
  if (freeBytes === null) return null;
  const min = minutesOfSpace(freeBytes, kbps);
  return (
    <p
      data-testid="rec-space"
      className={cn(
        "text-center font-mono text-[10px]",
        min < 30 ? "text-amber-400" : "text-muted-foreground",
      )}
    >
      Space for about {spaceLeftText(min)} of backup at this quality
    </p>
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
}: {
  store: RecStore | null;
  status: RecStatus;
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
        <p className="font-mono text-[10px] text-muted-foreground">
          Press REC to keep a full-quality copy on your phone; it stops when you press STOP REC. The
          studio gets the live picture; this copy stays here. After the show, share it, then delete
          it to free space.
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

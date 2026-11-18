// Rows of a saved Custom design: one design, many sets of words. Tap a row to put it on air, step with
// Next / Back, queue rows in the Graphics Rundown, or paste them from a spreadsheet.
import { ArrowDown, ArrowUp, ListPlus, Play, SkipBack, SkipForward, Square, Trash2 } from "lucide-react";
import { useState } from "react";

import { applyRow, defaultsOf, fieldsOf, parseRows, rowStore, useDesignRows, type DesignRow } from "@/lib/mk/gfx-rows";
import { rundown } from "@/lib/mk/gfx-rundown";
import type { SavedGraphic } from "@/lib/mk/gfx-library";
import type { CustomEl } from "@/lib/mk/types";
import { engine, useSwitcher } from "@/lib/mk/use-switcher";
import { DesignLogos } from "@/components/mk/design-logos";
import { cn } from "@/lib/utils";

const field = "mk-field h-7 w-full min-w-0 rounded-[3px] px-1.5 text-[11px]";
const iconBtn = "mk-button flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px]";

export function DesignRows({
  design,
  draftElements,
  say,
  onChanged,
}: {
  design: SavedGraphic;
  onChanged?: ((item: SavedGraphic) => void) | undefined;
  /** What is in the editor right now, so "Add from editor" can capture its words as a row. */
  draftElements: CustomEl[];
  say: (m: string) => void;
}) {
  const rows = useDesignRows(design.id);
  const state = useSwitcher();
  const [cur, setCur] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);

  const els = (design.data as { elements: CustomEl[] }).elements;
  const fields = fieldsOf(els);
  const onAir = state.gfxActive[design.layer];

  if (!fields.length) {
    return (
      <div className="grid gap-1">
        <DesignLogos design={design} say={say} onChanged={onChanged} />
        <p className="font-mono text-[10px] text-muted-foreground">
          Rows need at least one text element with a field name. Name one in the editor, then Update this design.
        </p>
      </div>
    );
  }

  const air = async (row: DesignRow) => {
    setCur(row.id);
    const ok = await engine.airGraphic(design.layer, { elements: applyRow(els, row.values) } as never);
    if (ok) say(`On air: ${row.name}`);
  };

  const step = (d: 1 | -1) => {
    if (!rows.length) return;
    const i = rows.findIndex((r) => r.id === cur);
    const next = rows[i < 0 ? (d === 1 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, i + d))];
    if (next) void air(next);
  };

  const addFromEditor = () => {
    const values: Record<string, string> = {};
    for (const f of fields) values[f] = draftElements.find((e) => e.type === "text" && e.field.trim() === f)?.text ?? "";
    const r = rowStore.add(design.id, values[fields[0]!] || "New row", values);
    say(`Added row "${r.name}"`);
  };

  const addBlank = () => {
    const d = defaultsOf(els);
    rowStore.add(design.id, "New row", d);
  };

  const importPaste = () => {
    const list = parseRows(paste, fields);
    if (!list.length) {
      say("Nothing to add — paste one row per line");
      return;
    }
    const n = rowStore.addMany(design.id, list);
    say(`Added ${n} row${n > 1 ? "s" : ""}`);
    setPaste("");
    setShowPaste(false);
  };

  const toRundown = (list: DesignRow[]) => {
    const n = rundown.addDesignRows(design.id, list);
    say(n ? `Queued ${n} in the Graphics Rundown` : "Could not queue — save the design first");
  };

  return (
    <div className="grid gap-1 rounded-[3px] border border-white/10 bg-black/20 p-1.5">
      <DesignLogos design={design} say={say} onChanged={onChanged} />
      <div className="flex flex-wrap items-center gap-1">
        <span className="mk-label mr-auto text-[9px]">Rows · {rows.length}</span>
        <button type="button" className={iconBtn} aria-label="Back" title="Previous row on air" onClick={() => step(-1)}>
          <SkipBack className="h-3 w-3" />
        </button>
        <button type="button" className={cn(iconBtn, "w-auto gap-1 px-2 text-[10px]")} title="Next row on air" onClick={() => step(1)}>
          <SkipForward className="h-3 w-3" /> Next
        </button>
        <button
          type="button"
          disabled={!onAir}
          className={cn(iconBtn, "w-auto gap-1 px-2 text-[10px] disabled:opacity-40")}
          title="Take the custom graphic off air"
          onClick={() => {
            setCur(null);
            void engine.clearGraphic(design.layer);
          }}
        >
          <Square className="h-3 w-3" /> Clear
        </button>
      </div>

      <ul className="grid max-h-64 content-start gap-1 overflow-y-auto">
        {rows.length === 0 && <li className="font-mono text-[10px] text-muted-foreground">No rows yet. Type the words in the editor and press Add from editor, or paste from a sheet.</li>}
        {rows.map((r, i) => (
          <li key={r.id} className={cn("grid gap-1 rounded-[3px] bg-black/25 p-1", r.id === cur && onAir && "ring-1 ring-red-500")}>
            <div className="flex items-center gap-1">
              <button type="button" className={cn(iconBtn, "w-auto gap-1 px-2 text-[10px]", r.id === cur && onAir && "mk-lit-amber")} onClick={() => void air(r)} title="Put this row on air">
                <Play className="h-3 w-3" /> {i + 1}
              </button>
              <input className={field} value={r.name} aria-label="Row name" onChange={(e) => rowStore.patch(design.id, r.id, { name: e.target.value })} />
              <button type="button" className={iconBtn} aria-label="Move up" onClick={() => rowStore.move(design.id, r.id, -1)}>
                <ArrowUp className="h-3 w-3" />
              </button>
              <button type="button" className={iconBtn} aria-label="Move down" onClick={() => rowStore.move(design.id, r.id, 1)}>
                <ArrowDown className="h-3 w-3" />
              </button>
              <button type="button" className={iconBtn} aria-label="Queue in rundown" title="Queue in the Graphics Rundown" onClick={() => toRundown([r])}>
                <ListPlus className="h-3 w-3" />
              </button>
              <button type="button" className={iconBtn} aria-label="Delete row" onClick={() => rowStore.remove(design.id, r.id)}>
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {fields.map((f) => (
                <input
                  key={f}
                  className={field}
                  value={r.values[f] ?? ""}
                  placeholder={f}
                  title={f}
                  maxLength={500}
                  onChange={(e) => rowStore.patch(design.id, r.id, { values: { ...r.values, [f]: e.target.value } })}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-1">
        <button type="button" className="mk-button h-6 rounded-[3px] px-2 text-[10px]" onClick={addFromEditor}>
          Add from editor
        </button>
        <button type="button" className="mk-button h-6 rounded-[3px] px-2 text-[10px]" onClick={addBlank}>
          Add blank
        </button>
        <button type="button" className="mk-button h-6 rounded-[3px] px-2 text-[10px]" onClick={() => setShowPaste((v) => !v)}>
          Paste rows
        </button>
        <button type="button" disabled={!rows.length} className="mk-button ml-auto h-6 rounded-[3px] px-2 text-[10px] disabled:opacity-40" onClick={() => toRundown(rows)}>
          All → Rundown
        </button>
      </div>

      {showPaste && (
        <div className="grid gap-1">
          <p className="font-mono text-[9px] text-muted-foreground">One row per line, columns separated by tab or comma. Columns: {fields.join(", ")}. A first line of field names also works.</p>
          <textarea className="mk-field min-h-16 w-full rounded-[3px] px-1.5 py-1 text-[11px]" value={paste} onChange={(e) => setPaste(e.target.value)} />
          <button type="button" disabled={!paste.trim()} className="mk-button h-6 w-fit rounded-[3px] px-3 text-[10px] disabled:opacity-40" onClick={importPaste}>
            Add rows
          </button>
        </div>
      )}
    </div>
  );
}

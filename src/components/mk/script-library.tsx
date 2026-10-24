import { useState } from "react";

import { prompter, usePrompter } from "@/lib/mk/prompter";
import { scripts, useScripts } from "@/lib/mk/scripts";
import { cn } from "@/lib/utils";

const btn = "mk-button h-[22px] rounded-[3px] px-2 text-[10px]";
const when = (at: number) =>
  new Date(at).toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/** Saved scripts for the prompter: pick one to load it, save changes, keep the last versions. */
export function ScriptLibrary() {
  const lib = useScripts();
  const p = usePrompter();
  const [showHistory, setShowHistory] = useState(false);
  const active = lib.items.find((s) => s.id === lib.active) ?? null;
  const dirty = active !== null && active.text !== p.text;

  const pick = (id: string) => {
    if (dirty && !confirm("This script has unsaved changes. Load another and discard them?"))
      return;
    const s = lib.items.find((x) => x.id === id);
    scripts.setActive(s ? s.id : null);
    if (s) prompter.setText(s.text);
    setShowHistory(false);
  };

  const saveAs = () => {
    const name = prompt("Name for this script", active ? `${active.name} copy` : "");
    if (name === null) return;
    scripts.add(name, p.text);
  };

  const save = () => {
    if (active) scripts.save(active.id, p.text);
    else saveAs();
  };

  return (
    <div className="flex shrink-0 flex-col gap-1">
      <div className="flex items-center gap-1">
        <select
          className="mk-field h-[22px] min-w-0 flex-1 rounded-[3px] px-1 text-[10px]"
          value={lib.active ?? ""}
          onChange={(e) => pick(e.target.value)}
          aria-label="Saved scripts"
        >
          <option value="">
            {lib.items.length ? "— Unsaved script —" : "No saved scripts yet"}
          </option>
          {lib.items.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={cn(btn, dirty && "mk-lit-amber")}
          onClick={save}
          disabled={!p.text.trim() && !active}
          title={active ? "Save changes to this script" : "Save this script with a name"}
        >
          {dirty ? "SAVE ●" : "SAVE"}
        </button>
        <button
          type="button"
          className={btn}
          onClick={saveAs}
          disabled={!p.text.trim()}
          title="Save a copy under a new name"
        >
          SAVE AS
        </button>
      </div>
      {active && (
        <div className="flex items-center gap-1 font-mono text-[9px] text-engrave">
          <span className="min-w-0 flex-1 truncate">
            saved {when(active.updated)} · {active.versions.length} earlier version
            {active.versions.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => {
              const name = prompt("Rename script", active.name);
              if (name !== null) scripts.rename(active.id, name);
            }}
          >
            RENAME
          </button>
          <button
            type="button"
            className="hover:text-foreground"
            aria-pressed={showHistory}
            onClick={() => setShowHistory((v) => !v)}
          >
            HISTORY
          </button>
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() =>
              confirm(`Delete “${active.name}” and its earlier versions?`) &&
              scripts.remove(active.id)
            }
          >
            DELETE
          </button>
        </div>
      )}
      {active && showHistory && (
        <ul className="max-h-24 overflow-y-auto rounded-[3px] border border-white/10 text-[10px]">
          {active.versions.length === 0 && (
            <li className="p-1 text-engrave">
              No earlier versions yet. One is kept each time you save a change.
            </li>
          )}
          {active.versions.map((v) => (
            <li
              key={v.at}
              className="flex items-center gap-1 border-b border-white/5 px-1 py-0.5 last:border-0"
            >
              <span className="min-w-0 flex-1 truncate">
                {when(v.at)} · {words(v.text)} words
              </span>
              <button
                type="button"
                className="hover:text-foreground"
                title="Put this version in the editor (press SAVE to keep it)"
                onClick={() => {
                  prompter.setText(v.text);
                  setShowHistory(false);
                }}
              >
                RESTORE
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

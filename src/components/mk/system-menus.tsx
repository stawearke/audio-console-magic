import { Check, ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  loadMenus,
  setLayout,
  triggerMenu,
  type MenuItem,
  type SystemMenu,
} from "@/lib/mk/system-menu";
import { cn } from "@/lib/utils";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Items({
  items,
  depth,
  onRun,
}: {
  items: MenuItem[];
  depth: number;
  onRun: (path: string) => void;
}) {
  return (
    <ul className="grid gap-1">
      {items.map((item, i) => {
        if (item.separator)
          return <li key={`sep${i}`} className="my-1 h-px bg-border" aria-hidden />;
        const children = item.children ?? [];
        return (
          <li key={item.path ?? i} style={{ marginLeft: depth * 12 }}>
            {children.length ? (
              <>
                <div className="mk-label flex items-center gap-1 py-1 text-[9px]">
                  <ChevronRight className="h-3 w-3" /> {item.text}
                </div>
                <Items items={children} depth={depth + 1} onRun={onRun} />
              </>
            ) : (
              <button
                type="button"
                disabled={!item.enabled || !item.path}
                onClick={() => item.path && onRun(item.path)}
                className={cn(
                  "mk-button flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs",
                  item.checked && "mk-lit-program",
                )}
              >
                <span className="flex w-4 shrink-0 justify-center">
                  {item.checked ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.text}</span>
                {item.shortcut && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {item.shortcut}
                  </span>
                )}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function SystemMenus() {
  const [menus, setMenus] = useState<SystemMenu[] | null>(null);
  const [classic, setClassic] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const refresh = useCallback(async () => {
    try {
      const r = await loadMenus();
      setMenus(r.menus);
      setClassic(r.classic);
      setError("");
    } catch (e) {
      setMenus(null);
      setError(msg(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (path: string) => {
    setNote("");
    try {
      await triggerMenu(path);
      // Some items open a window; others change something shown here (e.g. the current profile).
      setTimeout(() => void refresh(), 700);
    } catch (e) {
      setError(msg(e));
    }
  };

  if (!menus)
    return (
      <div className="mk-panel mx-auto mt-6 grid max-w-xl gap-3 rounded-md p-4">
        <div className="text-sm text-foreground">System menus are only in MK VISION Studio</div>
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

  return (
    <div className="grid gap-3 p-3">
      {(error || note) && (
        <p className="rounded-sm border border-border p-2 font-mono text-[11px] text-foreground">
          {error || note}
        </p>
      )}
      <p className="font-mono text-[10px] text-muted-foreground">
        Everything OBS has in its menus lives here: profiles, scene collections, scripts and tools,
        settings, log files. Items open OBS&apos;s own windows on top of MK.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {menus.map((m) => (
          <section key={m.title} className="mk-panel grid content-start gap-2 rounded-md p-3">
            <div className="mk-label text-[9px]">{m.title.toUpperCase()}</div>
            <Items items={m.items} depth={0} onRun={(p) => void run(p)} />
          </section>
        ))}
        <section className="mk-panel grid content-start gap-2 rounded-md p-3">
          <div className="mk-label text-[9px]">LAYOUT</div>
          <button
            type="button"
            onClick={() =>
              void setLayout(classic ? "mk" : "classic")
                .then(() => {
                  setNote(
                    classic
                      ? "Back to the MK desk."
                      : "OBS panels are showing. Use View → MK VISION → MK VISION Desk to come back, or press the button again.",
                  );
                  setTimeout(() => void refresh(), 700);
                })
                .catch((e) => setError(msg(e)))
            }
            className="mk-button h-9 w-fit rounded-sm px-4 text-xs"
          >
            {classic ? "Return to the MK desk" : "Show OBS panels (advanced)"}
          </button>
          <p className="font-mono text-[10px] text-muted-foreground">
            Only for troubleshooting. MK does not need the OBS panels.
          </p>
        </section>
      </div>
    </div>
  );
}

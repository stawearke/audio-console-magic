import { createFileRoute } from "@tanstack/react-router";
import { Boxes, Layers3, PackagePlus, Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BACKUP_KEY, PROGRAM_KEY, SHOWS_KEY, loadShows, openBus } from "@/lib/broadcast/bus";
import { GRAPHIC_PACKAGES, makePackageItems } from "@/lib/broadcast/packages";
import { Graphic, ProgramView, SafeGuides, Stage } from "@/lib/broadcast/renderer";
import { makeItem, seedShows } from "@/lib/broadcast/seed";
import { FONTS, TEMPLATES, THEME_PRESETS, getTemplate } from "@/lib/broadcast/templates";
import { TRANSITIONS, type Item, type Layer, type Program, type Show, type Theme } from "@/lib/broadcast/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OnAir Studio — Live Broadcast Graphics Control" },
      { name: "description", content: "Design, preview and play live TV graphics: lower thirds, tickers, scoreboards and more, with a transparent OBS output." },
      { property: "og:title", content: "OnAir Studio — Live Broadcast Graphics" },
      { property: "og:description", content: "A control room for live television graphics with a transparent OBS output." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

const uid = () => crypto.randomUUID().slice(0, 8);
type Log = { t: string; msg: string };

function Studio() {
  const [shows, setShows] = useState<Show[] | null>(null);
  const [showId, setShowId] = useState("");
  const [selId, setSelId] = useState("");
  const [program, setProgram] = useState<Program>({});
  const [autoPlay, setAutoPlay] = useState(false);
  const [guides, setGuides] = useState(true);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("All");
  const [libraryView, setLibraryView] = useState<"packages" | "templates">("packages");
  const [outSeen, setOutSeen] = useState(0);
  const [now, setNow] = useState(0);
  const [logs, setLogs] = useState<Log[]>([]);
  const [flash, setFlash] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const past = useRef<Show[][]>([]);
  const future = useRef<Show[][]>([]);
  const timers = useRef<Partial<Record<Layer, ReturnType<typeof setTimeout>>>>({});
  const lastCmd = useRef(0);
  const busRef = useRef<ReturnType<typeof openBus> | null>(null);
  const stateRef = useRef({ program, preview: {} as Program });

  // load
  useEffect(() => {
    const s = loadShows() ?? seedShows();
    const firstShow = s[0];
    if (!firstShow) return;
    setShows(s);
    setShowId(firstShow.id);
    setSelId(firstShow.items[0]?.id ?? "");
    try { const st = JSON.parse(localStorage.getItem(PROGRAM_KEY) || "null"); if (st?.program) setProgram(st.program); } catch { /* */ }
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // persist + backup
  useEffect(() => {
    if (!shows) return;
    localStorage.setItem(SHOWS_KEY, JSON.stringify(shows));
  }, [shows]);
  useEffect(() => {
    const t = setInterval(() => { const v = localStorage.getItem(SHOWS_KEY); if (v) localStorage.setItem(BACKUP_KEY, v); }, 60000);
    return () => clearInterval(t);
  }, []);

  const log = useCallback((msg: string) => {
    setLogs((l) => [{ t: new Date().toLocaleTimeString(), msg }, ...l].slice(0, 60));
    setFlash(msg);
  }, []);

  const show = shows?.find((s) => s.id === showId);
  const sel = show?.items.find((i) => i.id === selId);
  const selTpl = sel ? getTemplate(sel.templateId) : undefined;
  const preview: Program = useMemo(() => (sel && selTpl && show ? { [selTpl.layer]: { item: sel, theme: show.theme, take: 1 } } : {}), [sel, selTpl, show]);

  // bus
  useEffect(() => {
    const bus = openBus((m) => {
      if (m.type === "hello" && m.mode === "program") setOutSeen(Date.now());
      if (m.type === "request") bus.send({ type: "state", ...stateRef.current });
    });
    busRef.current = bus;
    return () => bus.close();
  }, []);
  useEffect(() => {
    stateRef.current = { program, preview };
    const payload = { program, preview };
    try { localStorage.setItem(PROGRAM_KEY, JSON.stringify(payload)); } catch { /* */ }
    busRef.current?.send({ type: "state", ...payload });
  }, [program, preview]);

  // editing with undo
  const mutate = useCallback((fn: (s: Show[]) => Show[]) => {
    setShows((prev) => {
      if (!prev) return prev;
      past.current.push(prev);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
      return fn(prev);
    });
  }, []);
  const undo = () => { const p = past.current.pop(); if (p && shows) { future.current.push(shows); setShows(p); } };
  const redo = () => { const f = future.current.pop(); if (f && shows) { past.current.push(shows); setShows(f); } };
  const updShow = (patch: Partial<Show>) => mutate((ss) => ss.map((s) => (s.id === showId ? { ...s, ...patch } : s)));
  const updItem = (id: string, patch: Partial<Item>) => mutate((ss) => ss.map((s) => (s.id === showId ? { ...s, items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) } : s)));

  // playout
  const guard = () => { const n = Date.now(); if (n - lastCmd.current < 200) return false; lastCmd.current = n; return true; };
  const clearLayer = useCallback((layer: Layer) => {
    clearTimeout(timers.current[layer]);
    setProgram((p) => { const n = { ...p }; delete n[layer]; return n; });
  }, []);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = show?.items ?? [];
  const autoRef = useRef(autoPlay);
  autoRef.current = autoPlay;
  const takeItem = useCallback((item: Item, theme: Theme) => {
    const tpl = getTemplate(item.templateId);
    if (!tpl) return;
    const layer = tpl.layer;
    clearTimeout(timers.current[layer]);
    const take = Date.now();
    setProgram((p) => ({ ...p, [layer]: { item: structuredClone(item), theme, take } }));
    log(`TAKE ${item.name}`);
    if (item.durationSec > 0) {
      timers.current[layer] = setTimeout(() => {
        clearLayer(layer);
        if (autoRef.current) {
          const list = itemsRef.current;
          const idx = list.findIndex((i) => i.id === item.id);
          const next = list[idx + 1];
          if (next) { setSelId(next.id); setTimeout(() => takeItem(next, theme), item.animMs + 100); }
        }
      }, item.durationSec * 1000);
    }
  }, [clearLayer, log]);

  const take = () => { if (sel && show && guard()) takeItem(sel, show.theme); };
  const update = () => {
    if (!sel || !selTpl || !show || !guard()) return;
    const cur = program[selTpl.layer];
    if (!cur) return take();
    setProgram((p) => ({ ...p, [selTpl.layer]: { ...cur, item: structuredClone(sel), theme: show.theme } }));
    log(`UPDATE ${sel.name}`);
  };
  const clear = () => { if (selTpl && guard()) { clearLayer(selTpl.layer); log(`CLEAR ${selTpl.layer}`); } };
  const clearAll = () => { Object.keys(program).forEach((l) => clearLayer(l as Layer)); log("CLEAR ALL"); };
  const move = (d: number) => { const list = show?.items ?? []; const i = list.findIndex((x) => x.id === selId); const n = list[Math.max(0, Math.min(list.length - 1, i + d))]; if (n) setSelId(n.id); return n; };
  const takeNext = () => { if (!show || !guard()) return; const n = move(1); if (n && n.id !== selId) takeItem(n, show.theme); };
  const toggleLayer = (layer: Layer) => {
    if (!show) return;
    if (program[layer]) { clearLayer(layer); log(`CLEAR ${layer}`); return; }
    const it = show.items.find((i) => getTemplate(i.templateId)?.layer === layer);
    if (it) takeItem(it, show.theme);
  };

  // keyboard
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      if (e.key === "Escape") (e.target as HTMLElement).blur();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    const k = e.key;
    if (k === " " || k === "F1") { e.preventDefault(); take(); }
    else if (k === "u" || k === "F2") update();
    else if (k === "Escape" || k === "F3") clear();
    else if (k === "n" || k === "F4") takeNext();
    else if (k === "ArrowDown") { e.preventDefault(); move(1); }
    else if (k === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (k === "t") toggleLayer("ticker");
    else if (k === "l") toggleLayer("logo");
    else if (k === "x") clearAll();
  };
  useEffect(() => { const h = (e: KeyboardEvent) => keys.current(e); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);

  if (!shows || !show) return <div className="grid min-h-screen place-items-center font-mono text-muted-foreground">Loading studio…</div>;

  const connected = now - outSeen < 3000;
  const onAir = Object.keys(program).length > 0;
  const isSelLive = !!(selTpl && program[selTpl.layer]?.item.id === sel?.id);
  const tplList = TEMPLATES.filter((t) => (cat === "All" || t.category === cat) && t.name.toLowerCase().includes(query.toLowerCase()));

  const addTemplate = (id: string) => { const it = makeItem(id, uid()); updShow({ items: [...show.items, it] }); setSelId(it.id); };
  const addPackage = (packageId: string) => {
    const pack = GRAPHIC_PACKAGES.find((entry) => entry.id === packageId);
    if (!pack) return;
    const items = makePackageItems(pack, uid);
    mutate((allShows) => allShows.map((entry) => entry.id === showId ? { ...entry, theme: pack.theme, items: [...entry.items, ...items] } : entry));
    const firstItem = items[0];
    if (firstItem) setSelId(firstItem.id);
    log(`ADDED ${pack.name.toUpperCase()} PACKAGE`);
  };
  const dupItem = (it: Item) => { const c = { ...structuredClone(it), id: uid(), name: it.name + " copy" }; const idx = show.items.indexOf(it); const items = [...show.items]; items.splice(idx + 1, 0, c); updShow({ items }); };
  const delItem = (it: Item) => { if (confirm(`Delete "${it.name}"?`)) updShow({ items: show.items.filter((i) => i.id !== it.id) }); };
  const reorder = (from: string, to: string) => { const items = [...show.items]; const a = items.findIndex((i) => i.id === from); const b = items.findIndex((i) => i.id === to); if (a < 0 || b < 0) return; const moved = items.splice(a, 1)[0]; if (!moved) return; items.splice(b, 0, moved); updShow({ items }); };
  const newShow = () => { const name = prompt("Show name", "New Show"); const defaultTheme = THEME_PRESETS[0]?.theme; if (!name || !defaultTheme) return; const s: Show = { id: uid(), name, theme: defaultTheme, items: [] }; mutate((ss) => [...ss, s]); setShowId(s.id); };
  const renameShow = () => { const name = prompt("Rename show", show.name); if (name) updShow({ name }); };
  const dupShow = () => { const s = { ...structuredClone(show), id: uid(), name: show.name + " copy" }; mutate((ss) => [...ss, s]); setShowId(s.id); };
  const delShow = () => { if (shows.length < 2) return alert("Keep at least one show."); if (confirm(`Delete show "${show.name}"?`)) { const rest = shows.filter((s) => s.id !== showId); const firstRemaining = rest[0]; if (!firstRemaining) return; mutate(() => rest); setShowId(firstRemaining.id); } };
  const exportShow = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(show, null, 2)], { type: "application/json" })); a.download = `${show.name}.onair.json`; a.click(); };
  const importShow = (f: File) => f.text().then((t) => {
    try { const s = JSON.parse(t) as Show; if (!s.name || !Array.isArray(s.items) || !s.theme) throw 0; s.id = uid(); s.items = s.items.filter((i) => getTemplate(i.templateId)); mutate((ss) => [...ss, s]); setShowId(s.id); log(`Imported ${s.name}`); }
    catch { alert("That file is not a valid show export."); }
  });
  const outputUrl = typeof window !== "undefined" ? `${window.location.origin}/output` : "/output";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-sm">
      {/* Status bar */}
      <header className="flex h-12 shrink-0 items-center gap-4 border-b bg-panel px-4">
        <div className="font-display text-xl font-bold tracking-wider">ON<span className="text-primary">AIR</span> STUDIO</div>
        <select className="rounded-sm border bg-panel-raised px-2 py-1" value={showId} onChange={(e) => { setShowId(e.target.value); setSelId(shows.find((s) => s.id === e.target.value)?.items[0]?.id ?? ""); }}>
          {shows.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="flex gap-1 text-xs">
          {[["New", newShow], ["Rename", renameShow], ["Duplicate", dupShow], ["Export", exportShow], ["Delete", delShow]].map(([l, f]) => (
            <button key={l as string} onClick={f as () => void} className="rounded-sm px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">{l as string}</button>
          ))}
          <label className="cursor-pointer rounded-sm px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">Import<input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importShow(e.target.files[0])} /></label>
        </div>
        <a href="/audio" className="rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">Audio Console</a>
        <div className="ml-auto flex items-center gap-3 font-mono text-xs">
          <span className="max-w-64 truncate text-muted-foreground">{flash}</span>
          <span className={`flex items-center gap-1.5 rounded-sm px-2 py-1 ${connected ? "bg-ready/15 text-ready" : "bg-muted text-muted-foreground"}`}>
            <span className={`size-2 rounded-full ${connected ? "bg-ready" : "bg-muted-foreground"}`} />OUTPUT {connected ? "CONNECTED" : "NOT DETECTED"}
          </span>
          <span className={`rounded-sm px-3 py-1 font-display text-base font-bold tracking-widest ${onAir ? "bg-tally text-tally-foreground" : "bg-muted text-muted-foreground"}`}>ON AIR</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Library */}
        <aside className="flex w-72 shrink-0 flex-col border-r bg-panel">
          <div className="space-y-2 border-b p-3">
            <div className="flex items-center gap-2 font-display text-xs uppercase tracking-[.2em] text-muted-foreground"><Layers3 className="size-4 text-primary" />Graphics library</div>
            <div className="grid grid-cols-2 gap-1 rounded-sm bg-background p-1">
              <button onClick={() => setLibraryView("packages")} className={`flex items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs ${libraryView === "packages" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}><Boxes className="size-3.5" />Packages</button>
              <button onClick={() => setLibraryView("templates")} className={`flex items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs ${libraryView === "templates" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}><Layers3 className="size-3.5" />Singles</button>
            </div>
            {libraryView === "templates" && <>
              <label className="flex items-center gap-2 rounded-sm border bg-background px-2"><Search className="size-3.5 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates" className="min-w-0 flex-1 bg-transparent py-1.5 outline-none" /></label>
              <div className="flex gap-1">
                {["All", "News", "Sports", "General"].map((c) => (
                  <button key={c} onClick={() => setCat(c)} className={`rounded-sm px-2 py-0.5 text-xs ${cat === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{c}</button>
                ))}
              </div>
            </>}
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {libraryView === "packages" ? GRAPHIC_PACKAGES.map((pack) => {
              const sample = pack.items.find((item) => item.templateId === "headline") ?? pack.items[0];
              return (
                <article key={pack.id} className="overflow-hidden rounded-sm border bg-background transition-colors hover:border-primary">
                  {sample && <Stage className="stage-checker"><Graphic g={{ item: makeItem(sample.templateId, `preview-${pack.id}`, sample.data, sample.name), theme: pack.theme, take: 0 }} /></Stage>}
                  <div className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2"><div><div className="font-display text-base font-bold uppercase tracking-wider">{pack.name}</div><div className="mt-0.5 font-mono text-[10px] text-primary">{pack.items.length} COORDINATED GRAPHICS</div></div><Sparkles className="size-4 shrink-0 text-primary" /></div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{pack.description}</p>
                    <button onClick={() => addPackage(pack.id)} className="flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-3 py-2 font-display text-sm font-bold uppercase tracking-wider text-primary-foreground active:scale-[.98]"><PackagePlus className="size-4" />Add full package</button>
                  </div>
                </article>
              );
            }) : tplList.map((t) => (
                <button key={t.id} onClick={() => addTemplate(t.id)} title="Add to rundown" className="group block w-full overflow-hidden rounded-sm border bg-background text-left hover:border-primary">
                  <Stage className="stage-checker">
                    <Graphic g={{ item: makeItem(t.id, "thumb"), theme: show.theme, take: 0 }} />
                  </Stage>
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="truncate">{t.name}</span>
                    <span className="font-mono text-[10px] uppercase text-muted-foreground group-hover:text-primary">+ add</span>
                  </div>
                </button>
              ))}
          </div>
        </aside>

        {/* Center */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="grid shrink-0 grid-cols-2 gap-3 p-3">
            <Monitor label="PREVIEW" tone="cue" guides={guides}><ProgramView program={preview} /></Monitor>
            <Monitor label="PROGRAM" tone={onAir ? "tally" : "muted"} guides={guides}><ProgramView program={program} /></Monitor>
          </div>

          {/* Controls */}
          <div className="flex shrink-0 items-center gap-2 border-y bg-panel px-3 py-2">
            <CtlButton tone="tally" onClick={take} label="TAKE" hint="Space" />
            <CtlButton tone="cue" onClick={update} label="UPDATE" hint="U" />
            <CtlButton tone="muted" onClick={clear} label="CLEAR" hint="Esc" />
            <CtlButton tone="primary" onClick={takeNext} label="TAKE NEXT" hint="N" />
            <div className="mx-2 h-10 w-px bg-border" />
            <Toggle on={!!program.ticker} onClick={() => toggleLayer("ticker")} label="Ticker (T)" />
            <Toggle on={!!program.logo} onClick={() => toggleLayer("logo")} label="Logo (L)" />
            <Toggle on={autoPlay} onClick={() => setAutoPlay((a) => !a)} label="Auto play" />
            <Toggle on={guides} onClick={() => setGuides((g) => !g)} label="Safe guides" />
            <button onClick={clearAll} className="ml-auto rounded-sm border border-destructive/50 px-3 py-2 font-display font-bold tracking-wider text-destructive hover:bg-destructive hover:text-destructive-foreground">CLEAR ALL (X)</button>
          </div>

          {/* Rundown */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-3 py-2 font-display text-xs uppercase tracking-[.2em] text-muted-foreground">
              <span>Rundown — {show.items.length} items</span>
              <span className="font-mono normal-case tracking-normal">drag to reorder · ↑↓ select</span>
            </div>
            {show.items.length === 0 && <div className="p-6 text-center text-muted-foreground">Add a template from the library to start your rundown.</div>}
            {show.items.map((it, idx) => {
              const tpl = getTemplate(it.templateId);
              const live = tpl && program[tpl.layer]?.item.id === it.id;
              const beginsPackage = !!it.packageId && show.items[idx - 1]?.packageId !== it.packageId;
              return (
                <div key={it.id}>
                  {beginsPackage && <div className="flex items-center gap-2 border-b bg-primary/10 px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[.16em] text-primary"><Boxes className="size-3.5" />{it.packageName}</div>}
                  <div draggable onDragStart={() => setDragId(it.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragId && dragId !== it.id) reorder(dragId, it.id); setDragId(null); }}
                    onClick={() => setSelId(it.id)} onDoubleClick={() => takeItem(it, show.theme)}
                    className={`group flex cursor-pointer items-center gap-3 border-b px-3 py-2 ${it.id === selId ? "bg-accent" : "hover:bg-panel"} ${live ? "border-l-4 border-l-tally" : "border-l-4 border-l-transparent"}`}>
                  <span className="w-6 font-mono text-xs text-muted-foreground">{idx + 1}</span>
                  <span className="flex-1 truncate">{it.name}</span>
                  <span className="w-20 font-mono text-xs uppercase text-muted-foreground">{tpl?.layer}</span>
                  <span className="w-16 font-mono text-xs text-muted-foreground">{it.durationSec > 0 ? `${it.durationSec}s` : "HOLD"}</span>
                  {live && <span className="rounded-sm bg-tally px-1.5 py-0.5 font-mono text-[10px] text-tally-foreground">LIVE</span>}
                  <button onClick={(e) => { e.stopPropagation(); dupItem(it); }} className="text-xs text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100">Duplicate</button>
                  <button onClick={(e) => { e.stopPropagation(); delItem(it); }} className="text-xs text-destructive opacity-0 group-hover:opacity-100">Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        {/* Properties */}
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l bg-panel">
          <Section title="Properties">
            {sel && selTpl ? (
              <div className="space-y-3">
                <Lbl t="Item name"><input className="inp" value={sel.name} onChange={(e) => updItem(sel.id, { name: e.target.value })} /></Lbl>
                {selTpl.fields.map((f) => (
                  <Lbl key={f.key} t={f.label}>
                    {f.type === "textarea" ? (
                      <textarea rows={4} className="inp" value={sel.data[f.key] ?? ""} onChange={(e) => updItem(sel.id, { data: { ...sel.data, [f.key]: e.target.value } })} />
                    ) : (
                      <input type={f.type === "number" ? "number" : "text"} className="inp" value={sel.data[f.key] ?? ""} onChange={(e) => updItem(sel.id, { data: { ...sel.data, [f.key]: e.target.value } })} />
                    )}
                  </Lbl>
                ))}
                <div className="grid grid-cols-2 gap-2">
                  <Lbl t="Transition"><select className="inp" value={sel.transition} onChange={(e) => updItem(sel.id, { transition: e.target.value as Item["transition"] })}>{TRANSITIONS.map((t) => <option key={t}>{t}</option>)}</select></Lbl>
                  <Lbl t="Anim ms"><input type="number" min={100} max={3000} className="inp" value={sel.animMs} onChange={(e) => updItem(sel.id, { animMs: Math.max(100, Math.min(3000, Number(e.target.value) || 600)) })} /></Lbl>
                </div>
                <Lbl t="Duration (seconds, 0 = hold)"><input type="number" min={0} className="inp" value={sel.durationSec} onChange={(e) => updItem(sel.id, { durationSec: Math.max(0, Number(e.target.value) || 0) })} /></Lbl>
                {isSelLive && <p className="font-mono text-xs text-tally">This item is on air — press UPDATE to push edits.</p>}
                <div className="flex gap-2 text-xs"><button onClick={undo} className="rounded-sm bg-muted px-2 py-1">Undo ⌘Z</button><button onClick={redo} className="rounded-sm bg-muted px-2 py-1">Redo ⇧⌘Z</button></div>
              </div>
            ) : <p className="text-muted-foreground">Select a rundown item.</p>}
          </Section>

          <Section title="Show theme">
            <div className="mb-3 flex flex-wrap gap-1">
              {THEME_PRESETS.map((p) => (
                <button key={p.name} onClick={() => updShow({ theme: p.theme })} className="flex items-center gap-1 rounded-sm bg-muted px-2 py-1 text-xs hover:bg-accent">
                  <span className="size-3 rounded-full" style={{ background: p.theme.primary }} />{p.name}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["primary", "secondary", "accent", "text"] as const).map((k) => (
                <Lbl key={k} t={k}><input type="color" className="h-8 w-full cursor-pointer rounded-sm border bg-background" value={show.theme[k]} onChange={(e) => updShow({ theme: { ...show.theme, [k]: e.target.value } })} /></Lbl>
              ))}
            </div>
            <Lbl t="Font"><select className="inp" value={show.theme.font} onChange={(e) => updShow({ theme: { ...show.theme, font: e.target.value } })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></Lbl>
          </Section>

          <Section title="OBS output">
            <p className="mb-2 text-xs text-muted-foreground">Add a Browser Source in OBS, 1920 × 1080, with this address. Open it in the same browser profile as this studio.</p>
            <code className="block break-all rounded-sm bg-background p-2 font-mono text-xs">{outputUrl}</code>
            <div className="mt-2 flex gap-2 text-xs">
              <a href="/output" target="_blank" rel="noreferrer" className="text-primary hover:underline">Open program</a>
              <a href="/output?mode=preview" target="_blank" rel="noreferrer" className="text-primary hover:underline">Open preview</a>
              <a href="/output?key=green" target="_blank" rel="noreferrer" className="text-primary hover:underline">Green key</a>
            </div>
          </Section>

          <Section title="Log">
            <div className="max-h-40 space-y-0.5 overflow-y-auto font-mono text-[11px] text-muted-foreground">
              {logs.length === 0 ? "No commands yet." : logs.map((l, i) => <div key={i}><span className="text-foreground/50">{l.t}</span> {l.msg}</div>)}
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Monitor({ label, tone, guides, children }: { label: string; tone: "cue" | "tally" | "muted"; guides: boolean; children: ReactNode }) {
  const ring = tone === "tally" ? "border-tally" : tone === "cue" ? "border-cue" : "border-border";
  const tag = tone === "tally" ? "bg-tally text-tally-foreground" : tone === "cue" ? "bg-cue text-cue-foreground" : "bg-muted text-muted-foreground";
  return (
    <div className={`overflow-hidden rounded-sm border-2 ${ring}`}>
      <div className={`px-2 py-0.5 font-display text-xs font-bold tracking-[.25em] ${tag}`}>{label}</div>
      <Stage className="stage-checker">{children}{guides && <SafeGuides />}</Stage>
    </div>
  );
}

function CtlButton({ tone, onClick, label, hint }: { tone: "tally" | "cue" | "muted" | "primary"; onClick: () => void; label: string; hint: string }) {
  const cls = { tally: "bg-tally text-tally-foreground", cue: "bg-cue text-cue-foreground", muted: "bg-secondary text-secondary-foreground", primary: "bg-primary text-primary-foreground" }[tone];
  return (
    <button onClick={onClick} className={`flex h-14 min-w-28 flex-col items-center justify-center rounded-sm px-4 font-display text-xl font-bold tracking-wider transition-transform active:scale-95 ${cls}`}>
      {label}<span className="font-mono text-[10px] font-normal opacity-70">{hint}</span>
    </button>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} className={`rounded-sm border px-3 py-2 text-xs ${on ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b p-3">
      <div className="mb-3 font-display text-xs uppercase tracking-[.2em] text-muted-foreground">{title}</div>
      {children}
    </section>
  );
}

function Lbl({ t, children }: { t: string; children: ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs capitalize text-muted-foreground">{t}</span>{children}</label>;
}

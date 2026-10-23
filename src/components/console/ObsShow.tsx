import { useEffect, useRef, useState } from "react";
import { engine } from "@/lib/mk/use-switcher";
import type { ObsVoice } from "@/lib/mk/obs-voice";
import { SCENE_LINKS_KEY, SNAPSHOTS_KEY, SNAPSHOT_SLOTS, defaultLinks, loadLinks, sanitizeSnapshots, snapshotOf, type SceneLinks, type Snapshot } from "@/lib/obs-desk";
import { onAutoRecall, recallSnapshot } from "@/lib/obs-recall";
import { Toggle } from "./controls";
import { useObsInputs } from "./obs-inputs";

/** Show: save the whole OBS mix (levels, mutes, MN, EQ, voice chain) into a slot and bring it back later. */
export function ObsShow() {
  const { state, inputs, connected } = useObsInputs();
  const [links, setLinks] = useState<SceneLinks>(defaultLinks);
  const [slots, setSlots] = useState<(Snapshot | null)[]>(() => sanitizeSnapshots(null));
  const [sel, setSel] = useState(0);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try { setSlots(sanitizeSnapshots(JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) ?? "null"))); } catch { /* keep empty */ }
    setLinks(loadLinks());
    return onAutoRecall((e) => setMsg(`Scene "${e.scene}" came on: recalled "${e.name}" (${e.applied} input${e.applied === 1 ? "" : "s"})${e.missing.length ? `. Not in OBS right now: ${e.missing.join(", ")}.` : "."}`));
  }, []);
  const saveLinks = (next: SceneLinks) => {
    setLinks(next);
    try { localStorage.setItem(SCENE_LINKS_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  };
  const scenes = state.scenes.filter((n) => !/^MK /i.test(n));
  const linked = links.scenes[sel] ?? "";
  const sceneOptions = linked && !scenes.includes(linked) ? [...scenes, linked] : scenes;
  const persist = (next: (Snapshot | null)[]) => {
    setSlots(next);
    try { localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  };

  const save = async () => {
    const voices: Record<string, ObsVoice> = {};
    await Promise.all(inputs.map(async (c) => { voices[c.name] = await engine.readVoice(c.name); }));
    const snap = snapshotOf(name || slots[sel]?.name || `SNAPSHOT ${sel + 1}`, inputs, voices);
    persist(slots.map((s, i) => (i === sel ? snap : s)));
    setMsg(`Saved ${inputs.length} input${inputs.length === 1 ? "" : "s"} into slot ${sel + 1}.`);
  };
  const recall = () => {
    const snap = slots[sel];
    if (!snap) return;
    const plan = recallSnapshot(snap, inputs);
    setMsg(`Recalled "${snap.name}": ${plan.apply.length} input${plan.apply.length === 1 ? "" : "s"}${plan.missing.length ? `. Not in OBS right now: ${plan.missing.join(", ")}.` : "."}`);
  };
  const clear = () => { persist(slots.map((s, i) => (i === sel ? null : s))); setMsg(`Slot ${sel + 1} cleared.`); };
  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(slots, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "obs-mix-snapshots.json"; a.click();
    URL.revokeObjectURL(url);
  };
  const importJson = async (f: File | undefined) => {
    if (!f) return;
    try {
      const next = sanitizeSnapshots(JSON.parse(await f.text()));
      persist(next);
      setMsg(`Loaded ${next.filter(Boolean).length} snapshot${next.filter(Boolean).length === 1 ? "" : "s"} from ${f.name}.`);
    } catch {
      setMsg("That file is not a snapshots file.");
    }
  };

  return (
    <section className="mixer-surface p-3" aria-label="Show">
      <h3 className="module-title mb-1 text-[11px] font-bold uppercase tracking-[0.2em]">Show: mix snapshots</h3>
      <p className="label-text mb-3 max-w-3xl text-[10px] leading-relaxed">Saves every OBS input's level, mute, MN, EQ and voice chain. Recall puts them back. Snapshots stay on this computer; export a file to keep or move them.</p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4" role="group" aria-label="Snapshot slots">
        {Array.from({ length: SNAPSHOT_SLOTS }, (_, i) => (
          <button key={i} type="button" aria-pressed={sel === i} onClick={() => { setSel(i); setName(slots[i]?.name ?? ""); }} className="console-btn rounded px-2 py-2 text-left text-xs" style={sel === i ? { outline: "2px solid var(--c-voice)" } : undefined}>
            <span className="label-text block text-[10px]">Slot {i + 1}</span>
            <span className="block truncate font-bold uppercase tracking-widest">{slots[i]?.name ?? "Empty"}</span>
            <span className="label-text block truncate text-[10px]">{slots[i] ? `${Object.keys(slots[i]!.inputs).length} inputs` : ""}{links.scenes[i] ? ` · ${links.scenes[i]}` : ""}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input aria-label="Snapshot name" className="console-select rounded px-2 py-1.5 text-xs" placeholder={`Name for slot ${sel + 1}`} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        <Toggle on={false} onClick={() => void save()} title="Save the current OBS mix into the selected slot">Save</Toggle>
        <Toggle on={false} onClick={recall} title="Apply the selected slot to OBS">Recall</Toggle>
        <Toggle on={false} onClick={clear} title="Empty the selected slot">Clear</Toggle>
        <Toggle on={false} onClick={exportJson} title="Download all slots as a file">Export</Toggle>
        <Toggle on={false} onClick={() => file.current?.click()} title="Load slots from a file">Import</Toggle>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" aria-label="Import snapshots" onChange={(e) => { void importJson(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="label-text text-[11px]" htmlFor="obs-scene-link">Scene for slot {sel + 1}</label>
        <select id="obs-scene-link" aria-label="Scene for this slot" className="console-select rounded px-2 py-1.5 text-xs" value={linked} onChange={(e) => saveLinks({ ...links, scenes: links.scenes.map((s, i) => (i === sel ? e.target.value || null : s)) })}>
          <option value="">No scene</option>
          {sceneOptions.map((n) => <option key={n} value={n}>{scenes.includes(n) ? n : `${n} (not in OBS)`}</option>)}
        </select>
        <Toggle on={links.auto} onClick={() => saveLinks({ ...links, auto: !links.auto })} title="When OBS goes to a linked scene, bring back its mix by itself">Auto-recall</Toggle>
        <span className="label-text text-[10px]">{links.auto ? "ON: going to a linked scene recalls its mix." : "Off: scenes change nothing in the mix."}</span>
      </div>
      <p className="label-text mt-2 min-h-4 text-[11px]" role="status">{!connected ? "Connect to OBS to save or recall." : msg}</p>
    </section>
  );
}

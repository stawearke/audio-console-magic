import { useEffect, useRef, useState } from "react";
import { engine } from "@/lib/mk/use-switcher";
import type { ObsVoice } from "@/lib/mk/obs-voice";
import { SNAPSHOTS_KEY, SNAPSHOT_SLOTS, recallPlan, sanitizeSnapshots, snapshotOf, type Snapshot } from "@/lib/obs-desk";
import { Toggle } from "./controls";
import { useObsInputs } from "./obs-inputs";

/** Show: save the whole OBS mix (levels, mutes, MN, EQ, voice chain) into a slot and bring it back later. */
export function ObsShow() {
  const { inputs, connected } = useObsInputs();
  const [slots, setSlots] = useState<(Snapshot | null)[]>(() => sanitizeSnapshots(null));
  const [sel, setSel] = useState(0);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try { setSlots(sanitizeSnapshots(JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) ?? "null"))); } catch { /* keep empty */ }
  }, []);
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
    const plan = recallPlan(snap, inputs);
    for (const n of plan.apply) {
      const want = snap.inputs[n]!;
      const now = inputs.find((c) => c.name === n)!;
      void engine.setAudioVolume(n, want.db);
      if (now.muted !== want.muted) void engine.toggleAudioMute(n);
      if (now.stream !== want.stream) void engine.toggleAudioStream(n);
      engine.setEq(n, want.eq);
      if (want.voice) engine.setVoice(n, want.voice);
    }
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
            <span className="label-text block text-[10px]">{slots[i] ? `${Object.keys(slots[i]!.inputs).length} inputs` : ""}</span>
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
      <p className="label-text mt-2 min-h-4 text-[11px]" role="status">{!connected ? "Connect to OBS to save or recall." : msg}</p>
    </section>
  );
}

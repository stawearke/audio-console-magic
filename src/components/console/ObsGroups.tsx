import { useEffect, useRef, useState } from "react";
import { engine } from "@/lib/mk/use-switcher";
import { GROUPS_KEY, groupMuted, memberTarget, sanitizeGroups, defaultGroups, type ObsGroup } from "@/lib/obs-desk";
import { Fader, Toggle } from "./controls";
import { useObsInputs } from "./obs-inputs";

/** Groups (Mixer 2): one fader and one mute for several OBS inputs. OBS has no groups, so this desk does the moving. */
export function ObsGroups() {
  const { inputs, connected } = useObsInputs();
  const [groups, setGroups] = useState<ObsGroup[]>(defaultGroups);
  const bases = useRef<Record<string, Record<string, number>>>({});
  useEffect(() => {
    try { setGroups(sanitizeGroups(JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "null"))); } catch { /* keep defaults */ }
  }, []);
  const update = (id: string, patch: Partial<ObsGroup>) =>
    setGroups((all) => {
      const next = all.map((g) => (g.id === id ? { ...g, ...patch } : g));
      try { localStorage.setItem(GROUPS_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });

  const move = (g: ObsGroup, offset: number) => {
    // Remember where every member was when the fader left 0, so the group moves as a block and returns exactly.
    if (g.offset === 0 || !bases.current[g.id]) bases.current[g.id] = Object.fromEntries(inputs.filter((c) => g.members.includes(c.name)).map((c) => [c.name, c.db]));
    const base = bases.current[g.id]!;
    for (const n of g.members) if (n in base) void engine.setAudioVolume(n, memberTarget(base[n]!, offset));
    update(g.id, { offset });
  };
  const toggleMute = (g: ObsGroup) => {
    const mute = !groupMuted(g, inputs);
    for (const n of g.members) {
      const c = inputs.find((x) => x.name === n);
      if (c && c.muted !== mute) void engine.toggleAudioMute(n);
    }
  };
  const toggleMember = (g: ObsGroup, name: string) => {
    delete bases.current[g.id];
    update(g.id, { members: g.members.includes(name) ? g.members.filter((m) => m !== name) : [...g.members, name], offset: 0 });
  };

  if (!connected) return <section className="mixer-surface p-6" aria-label="Groups"><p className="label-text text-xs">Connect to OBS to use groups.</p></section>;
  return (
    <section className="mixer-surface p-3" aria-label="Groups">
      <h3 className="module-title mb-1 text-[11px] font-bold uppercase tracking-[0.2em]">Mixer 2: groups</h3>
      <p className="label-text mb-3 max-w-3xl text-[10px] leading-relaxed">Tick the OBS inputs that belong to a group. The group fader moves them together (double-click to return to 0) and the group mute mutes them all. Groups are saved on this computer.</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {groups.map((g) => (
          <div key={g.id} className="channel-strip flex flex-col items-center gap-2 rounded-md p-2" aria-label={g.name}>
            <input aria-label={`${g.id} name`} className="console-select w-full rounded px-2 py-1 text-center text-xs font-bold uppercase tracking-widest" value={g.name} maxLength={24} onChange={(e) => update(g.id, { name: e.target.value })} />
            <Fader value={g.offset} label={`${g.name} fader`} hideLabel onChange={(v) => move(g, v)} />
            <span className="label-text text-[10px]">{g.offset > 0 ? "+" : ""}{g.offset.toFixed(1)} dB · {g.members.length} input{g.members.length === 1 ? "" : "s"}</span>
            <Toggle on={groupMuted(g, inputs)} onClick={() => toggleMute(g)} title="Mute or unmute every input in this group">Mute</Toggle>
            <div className="flex w-full flex-col gap-1">
              {inputs.map((c) => (
                <label key={c.name} className="label-text flex items-center gap-2 text-[11px]">
                  <input type="checkbox" checked={g.members.includes(c.name)} onChange={() => toggleMember(g, c.name)} />
                  <span className="truncate" title={c.name}>{c.name}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

import { useMemo, useRef, useState } from "react";
import { Download, Upload, Pencil, MousePointer2, Undo2, Check, RotateCcw, WandSparkles, Volume2, Crosshair, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SPEAKER_TYPES, area, balanceAt, coverage, defaultPlan, inside, readPlan, recommend, validArea, type Point, type Speaker, type SpeakerKind } from "@/lib/speaker-planner";

export function SpeakerPlanner() {
  const [plan, setPlan] = useState(defaultPlan);
  const [kind, setKind] = useState<SpeakerKind>("wide");
  const [count, setCount] = useState(2);
  const [mode, setMode] = useState<"select" | "draw" | "balance">("select");
  const [draft, setDraft] = useState<Point[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [probe, setProbe] = useState<Point | null>(null);
  const [error, setError] = useState("");
  const [heat, setHeat] = useState(true);
  const drag = useRef<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const stats = useMemo(() => coverage(plan), [plan]);
  const speaker = plan.speakers.find(s => s.id === selected);
  const scale = 480 / Math.max(plan.width, plan.depth);
  const offset = 35;
  const sx = (x: number) => offset + x * scale;
  const sy = (y: number) => offset + y * scale;
  const patch = (id: string, change: Partial<Speaker>) => setPlan(p => ({ ...p, speakers: p.speakers.map(s => s.id === id ? { ...s, ...change } : s) }));
  const coordinate = (e: React.PointerEvent<SVGSVGElement>): Point => {
    const m = e.currentTarget.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const pos = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: Math.round(Math.max(0, Math.min(plan.width, (pos.x - offset) / scale)) * 10) / 10, y: Math.round(Math.max(0, Math.min(plan.depth, (pos.y - offset) / scale)) * 10) / 10 };
  };
  const resize = (key: "width" | "depth", value: number) => {
    const v = Math.max(2, Math.min(100, value));
    const axis = key === "width" ? "x" : "y";
    setPlan(p => ({ ...p, [key]: v, polygon: p.polygon.map(q => ({ ...q, [axis]: q[axis] * v / p[key] })), speakers: p.speakers.map(s => ({ ...s, [axis]: s[axis] * v / p[key] })) }));
    setProbe(null); setDraft([]); setMode("select");
  };
  const generate = () => { setPlan(p => ({ ...p, speakers: recommend(p, kind, count) })); setSelected("sp1"); setError(""); setProbe(null); };
  const finish = () => {
    if (!validArea(draft)) { setError("Draw a non-crossing area of at least 1 m² with three or more corners."); return; }
    setPlan(p => ({ ...p, polygon: draft, speakers: [] })); setDraft([]); setSelected(null); setProbe(null); setMode("select"); setError("");
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "VOXONE-speaker-plan.json"; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const numberInput = (label: string, value: number, min: number, max: number, update: (n: number) => void, step = 0.1) => <label className="planner-field"><span>{label}</span><input type="number" aria-label={label} className="console-select" min={min} max={max} step={step} value={value} onChange={e => { const n = e.target.valueAsNumber; if (Number.isFinite(n)) update(Math.max(min, Math.min(max, n))); }} /></label>;
  return <section className="speaker-planner" aria-label="Speaker placement planner">
    <header className="planner-heading"><div><span className="desk-caption">SYSTEM DESIGN / TOP VIEW</span><h2>Speaker placement</h2></div><div className="flex gap-2">
      <Button className="console-btn" variant="ghost" onClick={() => file.current?.click()}><Upload />Open plan</Button>
      <Button className="console-btn" variant="ghost" onClick={download}><Download />Save plan</Button>
      <input ref={file} type="file" className="hidden" accept=".json,application/json" aria-label="Import speaker plan" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { setPlan(readPlan(JSON.parse(await f.text()))); setMode("select"); setSelected(null); setDraft([]); setProbe(null); setError(""); } catch (err) { setError(err instanceof Error ? err.message : "Could not open this plan."); } e.target.value = ""; }} />
    </div></header>
    <div className="planner-layout">
      <aside className="planner-settings">
        <h3>AREA</h3><div className="planner-fields">{numberInput("Width · m", plan.width, 2, 100, n => resize("width", n))}{numberInput("Depth · m", plan.depth, 2, 100, n => resize("depth", n))}</div>
        <div className="planner-area-readout"><span>Audience area</span><strong>{area(plan.polygon).toFixed(1)} m²</strong></div>
        <h3>SPEAKER SYSTEM</h3>
        <label className="planner-field"><span>Speaker type</span><select className="console-select" aria-label="Speaker type" value={kind} onChange={e => setKind(e.target.value as SpeakerKind)}>{Object.entries(SPEAKER_TYPES).map(([k, s]) => <option key={k} value={k}>{s.name}</option>)}</select></label>
        <div className="planner-fields">{numberInput("Speaker count", count, 1, 16, setCount, 1)}{numberInput("Height · m", plan.height, 1.2, 10, n => setPlan(p => ({ ...p, height: n })))}</div>
        {numberInput("SPL at 1 m · dB", plan.reference, 40, 130, n => setPlan(p => ({ ...p, reference: n })), 1)}
        <Button className="console-btn planner-generate" variant="ghost" onClick={generate} disabled={mode === "draw"}><WandSparkles />Suggest placement</Button>
        <h3>SELECTED SPEAKER</h3>
        {speaker ? <div className="space-y-3">
          <label className="planner-field"><span>Name</span><input className="console-select" aria-label="Speaker name" value={speaker.name} maxLength={40} onChange={e => patch(speaker.id, { name: e.target.value })} /></label>
          <label className="planner-field"><span>Type</span><select className="console-select" aria-label="Selected speaker type" value={speaker.kind} onChange={e => { const k = e.target.value as SpeakerKind; const t = SPEAKER_TYPES[k]; patch(speaker.id, { kind: k, beam: t.beam, reach: t.reach }); }}>{Object.entries(SPEAKER_TYPES).map(([k, t]) => <option key={k} value={k}>{t.name}</option>)}</select></label>
          <div className="planner-fields">{numberInput("X · m", speaker.x, 0, plan.width, n => patch(speaker.id, { x: n }))}{numberInput("Y · m", speaker.y, 0, plan.depth, n => patch(speaker.id, { y: n }))}{numberInput("Aim · °", speaker.aim, -180, 180, n => patch(speaker.id, { aim: n }), 1)}{numberInput("Coverage · °", speaker.beam, 10, 360, n => patch(speaker.id, { beam: n }), 1)}{numberInput("Throw · m", speaker.reach, 1, 100, n => patch(speaker.id, { reach: n }))}{numberInput("Level · dB", speaker.gain, -24, 12, n => patch(speaker.id, { gain: n }))}{numberInput("Delay · ms", speaker.delay, 0, 500, n => patch(speaker.id, { delay: n }))}</div>
          <Button variant="ghost" className="console-btn" onClick={() => { setPlan(p => ({ ...p, speakers: p.speakers.filter(s => s.id !== speaker.id) })); setSelected(null); }}><Trash2 />Remove speaker</Button>
        </div> : <span className="label-text text-xs">No speaker selected</span>}
      </aside>
      <div className="planner-main">
        <div className="planner-tools" role="group" aria-label="Floor plan tools">
          <Button variant="ghost" className="console-btn" title="Select and move speakers" aria-label="Select and move speakers" data-on={mode === "select"} onClick={() => { setMode("select"); setDraft([]); }}><MousePointer2 /></Button>
          <Button variant="ghost" className="console-btn" data-on={mode === "draw"} onClick={() => { setDraft([]); setMode("draw"); setError(""); }}><Pencil />Draw area</Button>
          {mode === "draw" && <><Button variant="ghost" className="console-btn" title="Undo corner" aria-label="Undo corner" disabled={!draft.length} onClick={() => setDraft(p => p.slice(0, -1))}><Undo2 /></Button><Button variant="ghost" className="console-btn" onClick={finish}><Check />Finish area</Button></>}
          <Button variant="ghost" className="console-btn" data-on={heat} aria-pressed={heat} onClick={() => setHeat(!heat)}><Volume2 />Coverage</Button>
          <Button variant="ghost" className="console-btn" data-on={mode === "balance"} disabled={!plan.speakers.length} onClick={() => setMode(mode === "balance" ? "select" : "balance")}><Crosshair />Balance point</Button>
          <Button variant="ghost" className="console-btn" title="Reset floor plan" aria-label="Reset floor plan" onClick={() => { setPlan(defaultPlan()); setProbe(null); setSelected(null); setDraft([]); setMode("select"); setError(""); }}><RotateCcw /></Button>
        </div>
        <div className="planner-mode" role="status">{mode === "draw" ? `DRAWING · ${draft.length} corners` : mode === "balance" ? "BALANCE POINT · awaiting location" : "FLOOR PLAN · meters"}<span>FRONT / STAGE ↑</span></div>
        {error && <p role="alert" className="error-box p-3 text-xs">{error}</p>}
        <svg className="planner-map" role="img" aria-label="Audience floor plan and speaker coverage" viewBox={`0 0 ${plan.width * scale + 70} ${plan.depth * scale + 70}`} onPointerDown={e => {
          const p = coordinate(e);
          if (mode === "draw") setDraft(d => [...d, p]);
          if (mode === "balance") { if (!inside(p, plan.polygon)) { setError("Choose a balance point inside the audience area."); return; } setPlan(current => ({ ...current, speakers: balanceAt(current, p) })); setProbe(p); setMode("select"); setError(""); }
        }} onPointerMove={e => { if (drag.current) patch(drag.current, coordinate(e)); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          <defs><pattern id="speaker-grid" width={scale} height={scale} patternUnits="userSpaceOnUse" x={offset} y={offset}><path d={`M ${scale} 0 L 0 0 0 ${scale}`} className="planner-grid" fill="none" /></pattern><clipPath id="audience-clip"><polygon points={plan.polygon.map(p => `${sx(p.x)},${sy(p.y)}`).join(" ")} /></clipPath></defs>
          <rect x={offset} y={offset} width={plan.width * scale} height={plan.depth * scale} fill="url(#speaker-grid)" />
          <polygon points={plan.polygon.map(p => `${sx(p.x)},${sy(p.y)}`).join(" ")} className="planner-audience" />
          {heat && !!plan.speakers.length && <g clipPath="url(#audience-clip)">{stats.points.map((p, i) => { const level = stats.levels[i] ?? 0; const max = Math.max(...stats.levels); const diff = max - level; return <rect key={i} x={sx(p.x) - 240 / 32} y={sy(p.y) - 240 / 32} width={480 / 32 + 1} height={480 / 32 + 1} className={`planner-heat ${diff < 6 ? "heat-high" : diff < 12 ? "heat-mid" : "heat-low"}`} />; })}</g>}
          {plan.speakers.map(s => <g key={s.id} transform={`translate(${sx(s.x)} ${sy(s.y)}) rotate(${-s.aim})`}>
            {s.beam === 360 ? <circle r={s.reach * scale} className="planner-beam" /> : <path d={`M 0 0 L ${-Math.sin(s.beam / 2 * Math.PI / 180) * s.reach * scale} ${Math.cos(s.beam / 2 * Math.PI / 180) * s.reach * scale} A ${s.reach * scale} ${s.reach * scale} 0 ${s.beam > 180 ? 1 : 0} 0 ${Math.sin(s.beam / 2 * Math.PI / 180) * s.reach * scale} ${Math.cos(s.beam / 2 * Math.PI / 180) * s.reach * scale} Z`} className="planner-beam" />}
          </g>)}
          {plan.speakers.map(s => <g key={s.id} className="planner-speaker" data-selected={selected === s.id} transform={`translate(${sx(s.x)} ${sy(s.y)})`} role="button" tabIndex={0} aria-label={`Select ${s.name}`} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(s.id); } }} onPointerDown={e => { if (mode !== "select") return; e.stopPropagation(); setSelected(s.id); drag.current = s.id; e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId); }}>
            <g transform={`rotate(${-s.aim})`}><rect x={-8} y={-11} width={16} height={22} rx={2} /><circle r={4} /><path d="M -4 15 L 0 21 L 4 15" /></g><text x={14} y={4}>{s.name}</text>
          </g>)}
          {mode === "draw" && <><polyline points={draft.map(p => `${sx(p.x)},${sy(p.y)}`).join(" ")} className="planner-draft" />{draft.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={4} className="planner-corner" />)}</>}
          {probe && <g transform={`translate(${sx(probe.x)} ${sy(probe.y)})`} className="planner-probe"><circle r={8} /><path d="M -13 0 H 13 M 0 -13 V 13" /><text x={16} y={4}>ALIGN</text></g>}
          <text x={sx(plan.width / 2)} y={22} textAnchor="middle" className="planner-axis">{plan.width} m</text><text x={sx(plan.width / 2)} y={sy(plan.depth) + 24} textAnchor="middle" className="planner-axis">BACK / AUDIENCE · {plan.depth} m deep</text>
        </svg>
        <div className="planner-stats"><div><span>Within nominal beam / throw</span><strong>{stats.percent}%</strong></div><div><span>Estimated level spread · P10–P90</span><strong>{stats.spread.toFixed(1)} dB</strong></div><div><span>Speakers</span><strong>{plan.speakers.length}</strong></div></div>
        <div className="planner-legend"><span className="legend-high">0–6 dB below peak</span><span className="legend-mid">6–12 dB</span><span className="legend-low">12+ dB</span></div>
      </div>
    </div>
    {!!plan.speakers.length && <div className="planner-results"><h3>PLACEMENT & BALANCE · {probe ? `Aligned at ${probe.x}, ${probe.y} m` : "Starting settings"}</h3><div className="overflow-x-auto"><table><thead><tr><th>Speaker</th><th>Position · m</th><th>Aim</th><th>Level trim</th><th>Delay</th></tr></thead><tbody>{plan.speakers.map(s => <tr key={s.id}><td>{s.name}</td><td>{s.x.toFixed(1)}, {s.y.toFixed(1)}</td><td>{s.aim.toFixed(0)}°</td><td>{s.gain.toFixed(1)} dB</td><td>{s.delay.toFixed(1)} ms</td></tr>)}</tbody></table></div></div>}
    <p className="planner-disclaimer">Planning estimates only · Generic speaker presets, not manufacturer specifications. Free-field model; reflections, obstacles, phase interference and subwoofer interactions are not simulated. Delay is aligned at one point, not the whole room. Verify with a measurement microphone before setting a physical speaker processor. No settings are applied to your live mix.</p>
  </section>;
}
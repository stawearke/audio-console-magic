import { Settings2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AD_ENTERS,
  AD_LAYOUTS,
  AD_ORDERS,
  AD_STYLES,
  ANCHORS,
  ANCHOR_GLYPH,
  DEFAULT_AD_BOX,
  DEFAULT_AD_TRIM,
  DEFAULT_MAIN_BOX,
  computeAdTargets,
  type Anchor,
  type AdConfig,
  type AdPreset,
} from "@/lib/mk/fx";
import { engine, useSwitcher } from "@/lib/mk/use-switcher";
import { cn } from "@/lib/utils";

const PROGRAM_SIZE_CHOICES = [1, 0.75, 0.6, 0.5, 0.35];
const AD_SIZE_CHOICES = [0.15, 0.2, 0.25, 0.3, 0.35, 0.4];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const fieldClass =
  "h-8 w-full min-w-0 rounded-sm border border-border bg-input px-2 font-mono text-xs text-foreground outline-none focus:border-ring";

const sameAd = (a: AdConfig, b: AdConfig) => JSON.stringify(a) === JSON.stringify(b);

function Choices<T extends string | number>({
  items,
  value,
  onPick,
  label,
}: {
  items: { id: T; text: string; hint?: string }[];
  value: T;
  onPick: (id: T) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {items.map((it) => (
        <button
          key={String(it.id)}
          type="button"
          title={it.hint}
          onClick={() => onPick(it.id)}
          className={cn("mk-button h-7 min-w-[2.5rem] rounded-[3px] px-2 font-mono text-[10px]", value === it.id && "mk-lit-amber")}
        >
          {it.text}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="mk-label text-[9px]">{label}</span>
      {children}
    </div>
  );
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const NUDGE_STEPS = [0.1, 0.5, 1, 5];

/** One calibration row: slider + exact number box (in %). */
function CalRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number; // fraction
  min: number; // percent
  max: number; // percent
  onChange: (fraction: number) => void;
}) {
  const percent = Math.round(value * 1000) / 10;
  return (
    <div className="grid grid-cols-[3.4rem_1fr_4.2rem] items-center gap-2">
      <span className="mk-label text-[9px]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.1}
        value={Math.min(max, Math.max(min, percent))}
        onChange={(e) => onChange(round3(Number(e.target.value) / 100))}
        aria-label={label}
        className="h-4 w-full"
      />
      <input
        type="number"
        step={0.1}
        value={percent}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(round3(v / 100));
        }}
        aria-label={`${label} percent`}
        className={cn(fieldClass, "h-7 px-1 text-right")}
      />
    </div>
  );
}

/** Mini 16:9 screen showing where the picture and the advertisement sit. Drag it to move (X / Y). */
function CalPreview({ draft, onDrag, target }: { draft: AdConfig; onDrag: (patch: Partial<AdConfig>) => void; target: "ad" | "program" }) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; cfg: AdConfig } | null>(null);
  const W = 1920;
  const H = 1080;
  const { end } = computeAdTargets(draft, W, H);
  const place = (r: { x: number; y: number; sx: number; sy: number; bw?: number | undefined; bh?: number | undefined }) => ({
    left: `${(r.x / W) * 100}%`,
    top: `${(r.y / H) * 100}%`,
    width: `${((r.bw ?? W * r.sx) / W) * 100}%`,
    height: `${((r.bh ?? H * r.sy) / H) * 100}%`,
  });
  const pgm = (
    <div key="pgm" className="absolute flex items-center justify-center border border-sky-300/70 bg-sky-500/30 font-mono text-[8px] text-sky-100" style={place(end.main)}>
      PGM
    </div>
  );
  const ad = (
    <div key="ad" className="absolute flex items-center justify-center border border-amber bg-amber/30 font-mono text-[8px] text-amber" style={place(end.ad)}>
      AD
    </div>
  );
  return (
    <div
      ref={ref}
      role="application"
      aria-label="Drag to move"
      title="Drag to move the advertisement or the program picture (pick which below)"
      className="relative aspect-video w-full cursor-move touch-none overflow-hidden rounded-sm border border-white/15 bg-black/60"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY, cfg: draft };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        const rect = ref.current?.getBoundingClientRect();
        if (!s || !rect || !rect.width) return;
        const dx = (e.clientX - s.x) / rect.width;
        const dy = (e.clientY - s.y) / rect.height;
        if (target === "program" && s.cfg.main) onDrag({ main: { ...s.cfg.main, x: round3(s.cfg.main.x + dx), y: round3(s.cfg.main.y + dy) } });
        else if (s.cfg.look === "overlay") onDrag({ box: { ...s.cfg.box, x: round3(s.cfg.box.x + dx), y: round3(s.cfg.box.y + dy) } });
        else onDrag({ trim: { dx: round3(s.cfg.trim.dx + dx), dy: round3(s.cfg.trim.dy + dy) } });
      }}
      onPointerUp={() => {
        start.current = null;
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      {draft.look === "frame" ? [ad, pgm] : [pgm, ad]}
    </div>
  );
}

/** Corner / edge spots for the overlay advertisement (2 % margin). */
function boxAt(anchor: Anchor, box: AdConfig["box"]): AdConfig["box"] {
  const m = 0.02;
  const x = anchor.endsWith("l") ? m : anchor.endsWith("r") ? 1 - box.w - m : (1 - box.w) / 2;
  const y = anchor.startsWith("t") ? m : anchor.startsWith("b") ? 1 - box.h - m : (1 - box.h) / 2;
  return { ...box, x: round3(x), y: round3(y) };
}

/**
 * Squeeze Merge editor for the Transitions panel. Changes are a DRAFT until SAVE is pressed, so nothing
 * moves on air by accident. SAVE writes the preset (name + every setting) to the saved config; it is
 * still there after a reload, and the preset in use stays selected.
 */
export function SqueezeMergeEditor({ presets, adActive, sqmOn, busy }: { presets: AdPreset[]; adActive: number; sqmOn: boolean; busy: boolean }) {
  const state = useSwitcher();
  const connected = state.status === "connected";
  const camScenes = state.config.camScenes.filter((s): s is string => !!s);

  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(adActive);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<AdConfig | null>(null);
  const [sources, setSources] = useState<{ name: string; kind: "scene" | "input" }[]>([]);

  const saved = presets[sel];
  const [step, setStep] = useState(0.5);
  const [lockRatio, setLockRatio] = useState(true);
  const [lockMain, setLockMain] = useState(true);
  const [dragTarget, setDragTarget] = useState<"ad" | "program">("ad");
  const liveCalib = sqmOn && sel === adActive;

  // Load the chosen preset into the draft whenever the dialog opens or another preset is picked.
  useEffect(() => {
    if (!open) return;
    const p = presets[sel] ?? presets[0];
    if (!p) return;
    setName(p.name);
    setDraft({ ...p.ad });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sel]);

  // Opening the editor starts on the preset that is in use.
  useEffect(() => {
    if (open) setSel(adActive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !connected) return;
    let alive = true;
    void engine.listSources().then((list) => alive && setSources(list));
    return () => {
      alive = false;
    };
  }, [open, connected]);

  const options = useMemo(() => sources.filter((s) => !camScenes.includes(s.name)), [sources, camScenes]);
  const dirty = !!draft && !!saved && (!sameAd(draft, saved.ad) || name.trim() !== saved.name);

  const edit = (patch: Partial<AdConfig>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  /** Calibration: updates the draft AND the saved preset at once; when it is the one in use and on air, OBS follows live. */
  const calib = (patch: Partial<AdConfig>) => {
    edit(patch);
    if (sel === adActive) void engine.calibrateAd(patch);
    else void engine.editAdPreset(sel, patch);
  };

  const nudge = (sx: number, sy: number) => {
    if (!draft) return;
    const d = step / 100;
    if (draft.look === "overlay") calib({ box: { ...draft.box, x: round3(draft.box.x + sx * d), y: round3(draft.box.y + sy * d) } });
    else calib({ trim: { dx: round3(draft.trim.dx + sx * d), dy: round3(draft.trim.dy + sy * d) } });
  };

  const resetCalib = () => {
    if (!draft) return;
    if (draft.look === "overlay") calib({ box: { ...DEFAULT_AD_BOX } });
    else calib({ trim: { ...DEFAULT_AD_TRIM } });
  };

  const pickPreset = (i: number) => {
    if (dirty && !window.confirm("You have unsaved changes on this Squeeze Merge. Switch anyway?")) return;
    setSel(i);
  };

  const save = async () => {
    if (!draft) return;
    await engine.saveAdPreset(sel, name, draft);
  };

  const saveAsNew = async () => {
    if (!draft) return;
    const base = (name.trim() || "Squeeze Merge").replace(/ copy$/i, "");
    const idx = await engine.saveAdPresetAs(`${base} copy`, draft);
    setSel(idx);
  };

  const remove = async () => {
    if (presets.length <= 1) return;
    if (!window.confirm(`Delete "${saved?.name}"?`)) return;
    await engine.removeAdPreset(sel);
    setSel(0);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Set up, save and pick your Squeeze Merge looks"
        aria-label="Squeeze Merge settings"
        className="mk-button flex h-5 min-w-0 items-center justify-center gap-1 rounded-[3px] px-1 font-mono text-[8px]"
      >
        <Settings2 className="h-3 w-3" />
        SQZ MERGE SETUP
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="mk-chassis max-h-[92dvh] max-w-md overflow-y-auto p-3 sm:p-4">
          <DialogHeader>
            <DialogTitle className="mk-label text-foreground">Squeeze Merge</DialogTitle>
            <DialogDescription className="font-mono text-[10px]">
              Set it up here, press SAVE, and it is kept (also after a reload). The one marked IN USE is what the SQZ MERGE button plays.
            </DialogDescription>
          </DialogHeader>

          {draft && saved && (
            <div className="grid gap-2.5">
              <div className="flex items-center gap-1">
                <select
                  value={sel}
                  onChange={(e) => pickPreset(Number(e.target.value))}
                  className={fieldClass}
                  aria-label="Squeeze Merge preset"
                >
                  {presets.map((p, i) => (
                    <option key={i} value={i}>
                      {p.name}
                      {i === adActive ? " — IN USE" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={sel === adActive || sqmOn || busy}
                  title={sqmOn || busy ? "Take SQZ MERGE out first" : "Use this one on the switcher"}
                  onClick={() => void engine.selectAdPreset(sel)}
                  className={cn("mk-button h-8 shrink-0 rounded-[3px] px-2 font-mono text-[9px]", sel === adActive && "mk-lit-amber")}
                >
                  {sel === adActive ? "IN USE" : "USE"}
                </button>
              </div>

              <Field label="Name">
                <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} className={fieldClass} aria-label="Preset name" />
              </Field>

              <Field label="Advertisement">
                <select
                  value={draft.scene ?? ""}
                  onChange={(e) => edit({ scene: e.target.value || null })}
                  className={fieldClass}
                  aria-label="Advertisement source"
                >
                  <option value="">— advertisement: none —</option>
                  {options.some((s) => s.kind === "scene") && (
                    <optgroup label="Scenes">
                      {options
                        .filter((s) => s.kind === "scene")
                        .map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  {options.some((s) => s.kind === "input") && (
                    <optgroup label="Image / video / graphic sources">
                      {options
                        .filter((s) => s.kind === "input")
                        .map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  {draft.scene && !options.some((s) => s.name === draft.scene) && (
                    <option value={draft.scene}>
                      {draft.scene}
                      {connected ? " (not found)" : ""}
                    </option>
                  )}
                </select>
              </Field>

              <Field label="Look">
                <Choices
                  label="Look"
                  items={[
                    { id: "frame" as const, text: "FRAME", hint: "Ad fills the screen behind; the picture shrinks into a spot" },
                    { id: "strip" as const, text: "STRIP", hint: "Ad is a bar beside the picture" },
                    { id: "overlay" as const, text: "OVERLAY", hint: "Ad sits IN FRONT of the picture like a PIP / DSK; the picture is not squeezed" },
                  ]}
                  value={draft.look}
                  onPick={(look) => edit({ look })}
                />
              </Field>

              {draft.look === "frame" ? (
                <Field label="Picture sits">
                  <div className="grid w-fit grid-cols-3 gap-0.5" role="group" aria-label="Where the program picture sits">
                    {ANCHORS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => edit({ anchor: a })}
                        className={cn("mk-button h-7 w-9 rounded-[2px] px-0 font-mono text-[10px]", draft.anchor === a && "mk-lit-amber")}
                      >
                        {ANCHOR_GLYPH[a]}
                      </button>
                    ))}
                  </div>
                </Field>
              ) : draft.look === "strip" ? (
                <Field label="Ad side">
                  <Choices label="Ad side" items={AD_LAYOUTS.map((l) => ({ id: l.id, text: l.label }))} value={draft.layout} onPick={(layout) => edit({ layout })} />
                </Field>
              ) : (
                <Field label="Ad sits">
                  <div className="grid w-fit grid-cols-3 gap-0.5" role="group" aria-label="Where the advertisement sits">
                    {ANCHORS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => calib({ box: boxAt(a, draft.box) })}
                        className="mk-button h-7 w-9 rounded-[2px] px-0 font-mono text-[10px]"
                      >
                        {ANCHOR_GLYPH[a]}
                      </button>
                    ))}
                  </div>
                </Field>
              )}

              {draft.look !== "overlay" && (
                <Field label="Ad size">
                  <Choices
                    label="Ad size"
                    items={AD_SIZE_CHOICES.map((v) => ({ id: v, text: pct(v) }))}
                    value={AD_SIZE_CHOICES.find((v) => Math.abs(v - draft.size) < 0.01) ?? -1}
                    onPick={(size) => calib({ size })}
                  />
                </Field>
              )}

              <Field label={liveCalib ? "Calibration — moves live on air, saved as you go" : "Calibration — saved as you go"}>
                <div className="grid gap-1.5 rounded-sm border border-white/10 p-1.5">
                  <CalPreview draft={draft} onDrag={calib} target={dragTarget} />
                  {draft.look === "overlay" ? (
                    <>
                      <CalRow label="X" value={draft.box.x} min={-20} max={100} onChange={(x) => calib({ box: { ...draft.box, x } })} />
                      <CalRow label="Y" value={draft.box.y} min={-20} max={100} onChange={(y) => calib({ box: { ...draft.box, y } })} />
                      <CalRow
                        label="WIDTH"
                        value={draft.box.w}
                        min={3}
                        max={150}
                        onChange={(w) => calib({ box: lockRatio ? { ...draft.box, w, h: w } : { ...draft.box, w } })}
                      />
                      <CalRow
                        label="HEIGHT"
                        value={draft.box.h}
                        min={3}
                        max={150}
                        onChange={(h) => calib({ box: lockRatio ? { ...draft.box, w: h, h } : { ...draft.box, h } })}
                      />
                      <label className="flex items-center gap-1.5 font-mono text-[10px]">
                        <input type="checkbox" checked={lockRatio} onChange={(e) => setLockRatio(e.target.checked)} />
                        Keep 16:9 (width and height move together)
                      </label>
                    </>
                  ) : (
                    <>
                      <CalRow label="PIC X" value={draft.trim.dx} min={-50} max={50} onChange={(dx) => calib({ trim: { ...draft.trim, dx } })} />
                      <CalRow label="PIC Y" value={draft.trim.dy} min={-50} max={50} onChange={(dy) => calib({ trim: { ...draft.trim, dy } })} />
                      <CalRow label="AD SIZE" value={draft.size} min={10} max={60} onChange={(size) => calib({ size: Math.min(0.6, Math.max(0.1, size)) })} />
                    </>
                  )}
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="mk-label text-[9px]">Nudge</span>
                    <Choices label="Nudge step" items={NUDGE_STEPS.map((v) => ({ id: v, text: `${v}%` }))} value={step} onPick={setStep} />
                  </div>
                  <div className="flex items-center gap-1">
                    {(
                      [
                        ["◀", -1, 0],
                        ["▲", 0, -1],
                        ["▼", 0, 1],
                        ["▶", 1, 0],
                      ] as const
                    ).map(([glyph, dx, dy]) => (
                      <button
                        key={glyph}
                        type="button"
                        onClick={() => nudge(dx, dy)}
                        aria-label={`Nudge ${glyph}`}
                        className="mk-button h-8 w-10 rounded-[3px] px-0 font-mono text-xs"
                      >
                        {glyph}
                      </button>
                    ))}
                    <button type="button" onClick={resetCalib} className="mk-button ml-auto h-8 rounded-[3px] px-2 font-mono text-[9px]" title="Back to the default position">
                      RESET
                    </button>
                  </div>
                </div>
              </Field>

              <Field label="Program size — the picture squeezes too">
                <div className="grid gap-1.5 rounded-sm border border-white/10 p-1.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => calib({ main: null })}
                      title={draft.look === "overlay" ? "Program stays full screen under the ad" : "Program takes what the ad leaves (1 − ad size)"}
                      className={cn("mk-button h-7 rounded-[3px] px-2 font-mono text-[10px]", !draft.main && "mk-lit-amber")}
                    >
                      AUTO
                    </button>
                    <button
                      type="button"
                      onClick={() => calib({ main: draft.main ?? { ...DEFAULT_MAIN_BOX } })}
                      title="Choose the program size and position yourself, in every look"
                      className={cn("mk-button h-7 rounded-[3px] px-2 font-mono text-[10px]", !!draft.main && "mk-lit-amber")}
                    >
                      CUSTOM
                    </button>
                    {draft.main && (
                      <Choices
                        label="Program size"
                        items={PROGRAM_SIZE_CHOICES.map((v) => ({ id: v, text: pct(v) }))}
                        value={PROGRAM_SIZE_CHOICES.find((v) => Math.abs(v - (draft.main?.w ?? 0)) < 0.01) ?? -1}
                        onPick={(v) => {
                          const m = draft.main!;
                          calib({ main: { x: Math.min(m.x, round3(1 - v)), y: Math.min(m.y, round3(1 - v)), w: v, h: v } });
                        }}
                      />
                    )}
                  </div>
                  {draft.main && (
                    <>
                      <CalRow label="PGM X" value={draft.main.x} min={-20} max={100} onChange={(x) => calib({ main: { ...draft.main!, x } })} />
                      <CalRow label="PGM Y" value={draft.main.y} min={-20} max={100} onChange={(y) => calib({ main: { ...draft.main!, y } })} />
                      <CalRow
                        label="PGM W"
                        value={draft.main.w}
                        min={5}
                        max={100}
                        onChange={(w) => calib({ main: lockMain ? { ...draft.main!, w, h: w } : { ...draft.main!, w } })}
                      />
                      <CalRow
                        label="PGM H"
                        value={draft.main.h}
                        min={5}
                        max={100}
                        onChange={(h) => calib({ main: lockMain ? { ...draft.main!, w: h, h } : { ...draft.main!, h } })}
                      />
                      <label className="flex items-center gap-1.5 font-mono text-[10px]">
                        <input type="checkbox" checked={lockMain} onChange={(e) => setLockMain(e.target.checked)} />
                        Keep 16:9 (width and height move together)
                      </label>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="mk-label text-[9px]">Drag in preview moves</span>
                        <Choices
                          label="Drag target"
                          items={[
                            { id: "ad" as const, text: "AD" },
                            { id: "program" as const, text: "PROGRAM" },
                          ]}
                          value={dragTarget}
                          onPick={setDragTarget}
                        />
                      </div>
                    </>
                  )}
                </div>
              </Field>

              <Field label="Motion">
                <Choices label="Motion" items={AD_STYLES.map((s) => ({ id: s.id, text: s.label, hint: s.hint }))} value={draft.style} onPick={(style) => edit({ style })} />
              </Field>

              <Field label="Enter from — where the ad comes in">
                <Choices label="Enter from" items={AD_ENTERS.map((s) => ({ id: s.id, text: s.label, hint: s.hint }))} value={draft.enter} onPick={(enter) => edit({ enter })} />
              </Field>

              <Field label="Order — who moves first">
                <Choices label="Order" items={AD_ORDERS.map((s) => ({ id: s.id, text: s.label, hint: s.hint }))} value={draft.order} onPick={(order) => edit({ order })} />
              </Field>

              <Field label="Fit or fill">
                <Choices
                  label="Fit or fill"
                  items={[
                    { id: "fit" as const, text: "FIT", hint: "Whole ad visible" },
                    { id: "fill" as const, text: "FILL", hint: "Ad covers its area (cropped)" },
                  ]}
                  value={draft.fit}
                  onPick={(fit) => edit({ fit })}
                />
              </Field>

              <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2">
                <span className={cn("mr-auto font-mono text-[10px]", dirty ? "text-amber" : "text-muted-foreground")}>
                  {dirty ? "Unsaved changes" : "All saved"}
                </span>
                <button
                  type="button"
                  disabled={presets.length <= 1}
                  onClick={() => void remove()}
                  className="mk-button h-8 rounded-[3px] px-2 font-mono text-[9px]"
                  title="Delete this Squeeze Merge"
                >
                  DELETE
                </button>
                <button
                  type="button"
                  onClick={() => void saveAsNew()}
                  className="mk-button h-8 rounded-[3px] px-2 font-mono text-[9px]"
                  title="Keep these settings as a new Squeeze Merge"
                >
                  SAVE AS NEW
                </button>
                <button
                  type="button"
                  disabled={!dirty}
                  onClick={() => void save()}
                  className={cn("mk-button h-8 rounded-[3px] px-5 text-xs text-foreground", dirty && "mk-lit-amber")}
                >
                  SAVE
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

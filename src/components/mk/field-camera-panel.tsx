import type { FieldCaps, FieldCtl, FieldFacing, FieldRange } from "@/lib/mk/field-link";
import { cn } from "@/lib/utils";

const btn = "mk-button h-8 rounded-[3px] px-3 text-[11px]";
const MODE_LABEL: Record<string, string> = { continuous: "AUTO", "single-shot": "LOCK", manual: "MANUAL" };

const clamp = (v: number, r: FieldRange) => Math.min(r.max, Math.max(r.min, v));
const snap = (v: number, r: FieldRange) => clamp(Math.round((v - r.min) / r.step) * r.step + r.min, r);

function Slider({ label, value, text, range, onChange, onNudge }: { label: string; value: number; text: string; range: FieldRange; onChange: (v: number) => void; onNudge?: (dir: -1 | 1) => void }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between">
        <span className="mk-label text-[9px]">{label}</span>
        <span className="font-mono text-[11px] text-foreground">{text}</span>
      </div>
      <div className="flex items-center gap-2">
        {onNudge && (
          <button type="button" className={cn(btn, "h-7 w-8 px-0")} aria-label={`${label} down`} onClick={() => onNudge(-1)}>
            −
          </button>
        )}
        <input
          type="range"
          className="mk-range min-w-0 flex-1"
          min={range.min}
          max={range.max}
          step={range.step}
          value={clamp(value, range)}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {onNudge && (
          <button type="button" className={cn(btn, "h-7 w-8 px-0")} aria-label={`${label} up`} onClick={() => onNudge(1)}>
            +
          </button>
        )}
      </div>
    </div>
  );
}

function Modes({ label, modes, value, onPick }: { label: string; modes: string[]; value: string | undefined; onPick: (m: string) => void }) {
  return (
    <div className="grid gap-1">
      <span className="mk-label text-[9px]">{label}</span>
      <div className="flex flex-wrap gap-2">
        {modes.map((m) => (
          <button key={m} type="button" aria-pressed={value === m} className={cn(btn, value === m && "mk-lit-preview")} onClick={() => onPick(m)}>
            {MODE_LABEL[m] ?? m.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The director's remote for one field phone: zoom, torch, focus, exposure, white balance, front/back camera, and the
 * mic's sound processing. Only what that phone really offers is shown (read from the phone itself).
 * `ctl` is what is set now; `onChange` gets only what just changed.
 */
export function FieldCameraPanel({ caps, ctl, online, onChange }: { caps: FieldCaps | null; ctl: FieldCtl; online: boolean; onChange: (patch: FieldCtl) => void }) {
  const facing: FieldFacing = ctl.facing ?? "environment";
  const mic = caps?.mic ?? {};
  const hasCam = !!caps && !!(caps.zoom || caps.torch || caps.focus || caps.exposure || caps.exposureComp || caps.wb || caps.colorTemp);
  const hasMic = Object.keys(mic).length > 0;

  const reset = () => {
    if (!caps) return;
    const p: FieldCtl = {};
    if (caps.zoom) p.zoom = clamp(1, caps.zoom);
    if (caps.torch) p.torch = false;
    if (caps.focus?.includes("continuous")) p.focus = "continuous";
    if (caps.exposure?.includes("continuous")) p.exposure = "continuous";
    if (caps.exposureComp) p.exposureComp = clamp(0, caps.exposureComp);
    if (caps.wb?.includes("continuous")) p.wb = "continuous";
    onChange(p);
  };

  return (
    <div className="grid gap-3 rounded-[3px] border border-white/10 p-2">
      <div className="flex items-center gap-2">
        <span className="mk-label text-[9px]">CAMERA + MIC (remote control of the reporter's phone)</span>
        {hasCam && (
          <button type="button" disabled={!online} className={cn(btn, "ml-auto h-6 px-2 text-[10px]")} onClick={reset} title="Zoom 1×, torch off, everything back to automatic">
            RESET
          </button>
        )}
      </div>

      {!online && <p className="font-mono text-[10px] text-muted-foreground">The controls appear when the reporter's phone is online with the link open.</p>}

      {online && caps?.flip && (
        <div className="grid gap-1">
          <span className="mk-label text-[9px]">WHICH CAMERA</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["environment", "BACK CAMERA"],
                ["user", "FRONT (SELFIE)"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={facing === id} className={cn(btn, "h-9", facing === id && "mk-lit-preview")} onClick={() => facing !== id && onChange({ facing: id })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {online && caps?.zoom && (
        <Slider
          label="ZOOM"
          value={ctl.zoom ?? caps.zoom.min}
          text={`${(ctl.zoom ?? caps.zoom.min).toFixed(1)}×`}
          range={caps.zoom}
          onChange={(v) => onChange({ zoom: snap(v, caps.zoom!) })}
          onNudge={(d) => onChange({ zoom: snap((ctl.zoom ?? caps.zoom!.min) + d * Math.max(caps.zoom!.step, 0.5), caps.zoom!) })}
        />
      )}

      {online && caps?.torch && (
        <button type="button" aria-pressed={!!ctl.torch} className={cn(btn, "h-9 w-full", ctl.torch && "mk-lit-amber")} onClick={() => onChange({ torch: !ctl.torch })}>
          TORCH (PHONE LIGHT) {ctl.torch ? "ON" : "OFF"}
        </button>
      )}

      {online && caps?.focus && caps.focus.length > 1 && <Modes label="FOCUS" modes={caps.focus} value={ctl.focus} onPick={(m) => onChange({ focus: m })} />}

      {online && caps?.exposure && caps.exposure.length > 1 && <Modes label="EXPOSURE" modes={caps.exposure} value={ctl.exposure} onPick={(m) => onChange({ exposure: m })} />}
      {online && caps?.exposureComp && (
        <Slider
          label="BRIGHTNESS (EXPOSURE COMPENSATION)"
          value={ctl.exposureComp ?? 0}
          text={`${(ctl.exposureComp ?? 0) > 0 ? "+" : ""}${(ctl.exposureComp ?? 0).toFixed(1)} EV`}
          range={caps.exposureComp}
          onChange={(v) => onChange({ exposureComp: snap(v, caps.exposureComp!) })}
        />
      )}

      {online && caps?.wb && caps.wb.length > 1 && (
        <Modes
          label="WHITE BALANCE"
          modes={caps.wb}
          value={ctl.wb}
          onPick={(m) => onChange({ wb: m, ...(m === "manual" && caps.colorTemp && ctl.colorTemp === undefined ? { colorTemp: snap((caps.colorTemp.min + caps.colorTemp.max) / 2, caps.colorTemp) } : {}) })}
        />
      )}
      {online && caps?.colorTemp && ctl.wb === "manual" && (
        <Slider label="COLOUR TEMPERATURE" value={ctl.colorTemp ?? caps.colorTemp.min} text={`${Math.round(ctl.colorTemp ?? caps.colorTemp.min)} K`} range={caps.colorTemp} onChange={(v) => onChange({ colorTemp: snap(v, caps.colorTemp!) })} />
      )}

      {online && caps && !hasCam && (
        <p className="font-mono text-[10px] text-muted-foreground">
          This phone's browser does not allow remote zoom, focus or exposure (iPhone / Safari). Android with Chrome allows most of them. The reporter can still zoom with their own camera by pinching.
        </p>
      )}

      {online && hasMic && (
        <div className="grid gap-1">
          <span className="mk-label text-[9px]">PHONE MIC PROCESSING (off = raw, clean sound for your mixer)</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ["echoCancellation", "ECHO CANCEL"],
                ["noiseSuppression", "NOISE REDUCE"],
                ["autoGainControl", "AUTO GAIN"],
              ] as const
            )
              .filter(([k]) => mic[k])
              .map(([k, label]) => (
                <button key={k} type="button" aria-pressed={!!ctl[k]} className={cn(btn, ctl[k] && "mk-lit-preview")} onClick={() => onChange({ [k]: !ctl[k] })}>
                  {label} {ctl[k] ? "ON" : "OFF"}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

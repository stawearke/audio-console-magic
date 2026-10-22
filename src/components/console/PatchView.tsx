import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HUES, type Route } from "@/lib/mixer-state";
import { useDesk } from "./desk-context";
import { KIND_ICON } from "./Strips";

const KIND = { mic: "Microphone", file: "Audio file", desktop: "Desktop audio", gen: "Generator" } as const;

// Patch bay: where each channel gets its signal and where it goes.
export function PatchView() {
  const d = useDesk();
  return <div>
    <div className="routing-bar mb-3 grid gap-4 rounded-md p-4 md:grid-cols-2">
      <label className="label-text text-[10px] uppercase tracking-widest">Program output
        <select aria-label="Program output" className="console-select mt-2 block w-full rounded p-2 text-xs" value={d.programOut} onChange={(e) => d.setProgramOut(e.target.value)}>
          <option value="default">Default output · OBS application capture</option>
          {d.outputs.filter((o) => o.deviceId !== "default").map((o) => <option key={o.deviceId} value={o.deviceId}>{o.label || "Audio output"}</option>)}
        </select>
      </label>
      <label className="label-text text-[10px] uppercase tracking-widest">Monitor (headphones) output
        <select aria-label="Monitor output" className="console-select mt-2 block w-full rounded p-2 text-xs" value={d.monitorOut} onChange={(e) => d.setMonitorOut(e.target.value)}>
          <option value="off">Off</option>
          {d.outputs.filter((o) => o.deviceId !== "default").map((o) => <option key={o.deviceId} value={o.deviceId}>{o.label || "Audio output"}</option>)}
        </select>
      </label>
    </div>
    <div className="patch-table" role="table" aria-label="Channel patch">
      <div className="patch-row patch-head" role="row"><span>#</span><span>Name</span><span>Source</span><span>Input device</span><span>Type</span><span>Output</span><span>Colour</span><span /></div>
      {d.mixer.channels.map((ch, i) => {
        const Icon = KIND_ICON[ch.kind];
        return <div key={ch.id} className="patch-row" role="row" data-selected={d.selected.includes(ch.id)} style={{ ["--channel-color" as string]: `oklch(0.78 0.14 ${ch.hue})` }}>
          <button type="button" className="patch-num" onClick={() => d.select(ch.id)} aria-label={`Select channel ${i + 1}`}>{String(i + 1).padStart(2, "0")}</button>
          <input aria-label={`Channel ${i + 1} name`} className="console-select rounded px-2 py-1 text-xs" value={ch.name} maxLength={14} onChange={(e) => d.patch(ch.id, { name: e.target.value.toUpperCase() })} />
          <span className="flex items-center gap-1.5 text-xs"><Icon className="size-3.5" />{KIND[ch.kind]}</span>
          {ch.kind === "mic"
            ? <select aria-label={`Channel ${i + 1} input device`} className="console-select rounded px-2 py-1 text-xs" value={ch.deviceId} onChange={(e) => d.patch(ch.id, { deviceId: e.target.value })}>
              <option value="">Default mic</option>
              {d.inputs.filter((x) => x.deviceId !== "default").map((x) => <option key={x.deviceId} value={x.deviceId}>{x.label || "Mic"}</option>)}
            </select>
            : <span className="label-text text-xs">{ch.kind === "file" ? d.files[ch.id] || "No file loaded" : ch.kind === "desktop" ? "Shared tab or screen" : `${ch.gen.type} ${ch.gen.type === "sine" ? `${ch.gen.freq} Hz` : ""}`}</span>}
          <select aria-label={`Channel ${i + 1} type`} className="console-select rounded px-2 py-1 text-xs" value={ch.stereo ? "stereo" : "mono"} onChange={(e) => d.patch(ch.id, { stereo: e.target.value === "stereo" })}>
            <option value="mono">Mono</option><option value="stereo">Stereo</option>
          </select>
          <select aria-label={`Channel ${i + 1} output`} className="console-select rounded px-2 py-1 text-xs" value={ch.route} onChange={(e) => d.patch(ch.id, { route: e.target.value as Route })}>
            <option value="master">Master</option><option value="g1">Group 1</option><option value="g2">Group 2</option>
          </select>
          <button type="button" className="hue-dot" aria-label={`Change channel ${i + 1} colour`} onClick={() => d.patch(ch.id, { hue: HUES[(HUES.indexOf(ch.hue) + 1) % HUES.length] ?? 195 })} />
          <Button variant="ghost" size="icon" className="console-btn size-7" aria-label={`Remove channel ${i + 1}`} disabled={d.mixer.channels.length <= 1} onClick={() => d.removeChannel(ch.id)}><Trash2 /></Button>
        </div>;
      })}
    </div>
  </div>;
}

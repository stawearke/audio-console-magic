import { engine } from "@/lib/mk/use-switcher";
import type { AudioChannel, MonitorType } from "@/lib/mk/types";
import { Toggle } from "./controls";
import { useObsInputs } from "./obs-inputs";

const MONITORS: Array<[MonitorType, string]> = [["none", "Off"], ["monitorOnly", "Monitor only"], ["monitorAndOutput", "Monitor + output"]];
const trackOn = (c: AudioChannel, n: number) => c.tracks?.[n - 1] ?? (n === 1 ? c.stream : n === 2 ? c.pre : false);

/** Where each OBS input goes: the six OBS audio tracks and the OBS PC's own monitoring. */
export function ObsPatch() {
  const { inputs, connected } = useObsInputs();
  return (
    <section className="mixer-surface p-3" aria-label="Patch">
      <h3 className="module-title mb-2 text-[11px] font-bold uppercase tracking-[0.2em]">Patch: inputs to OBS tracks</h3>
      <p className="label-text mb-3 max-w-3xl text-[10px] leading-relaxed">
        Track 1 is the final mix (MN): YouTube and the recording. Track 2 is the pre-listen mix and is driven by the Monitor section of MK VISION, so it is shown but not switchable here.
        Tracks 3 to 6 are free: send an input to its own track to record it separately (set the tracks in OBS under Settings → Output → Recording).
      </p>
      {!connected || inputs.length === 0 ? (
        <p className="label-text text-xs">{connected ? "OBS reports no audio inputs." : "Connect to OBS to patch inputs."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-y-1 text-left text-xs">
            <thead>
              <tr className="label-text text-[10px] uppercase tracking-widest">
                <th className="px-2 font-semibold">Input</th>
                <th className="px-2 font-semibold">Track 1 · MN</th>
                <th className="px-2 font-semibold">Track 2 · Pre</th>
                {[3, 4, 5, 6].map((n) => <th key={n} className="px-2 font-semibold">Track {n}</th>)}
                <th className="px-2 font-semibold">Monitoring</th>
              </tr>
            </thead>
            <tbody>
              {inputs.map((c) => (
                <tr key={c.name} className="channel-strip">
                  <td className="max-w-[16rem] truncate px-2 py-1 font-bold uppercase tracking-widest" title={c.name}>{c.name}</td>
                  <td className="px-2"><Toggle on={trackOn(c, 1)} onClick={() => void engine.toggleAudioStream(c.name)} title="On the final mix">{trackOn(c, 1) ? "On" : "Off"}</Toggle></td>
                  <td className="label-text px-2" title="Managed by the Monitor section">{trackOn(c, 2) ? "On" : "Off"}</td>
                  {[3, 4, 5, 6].map((n) => (
                    <td key={n} className="px-2"><Toggle on={trackOn(c, n)} onClick={() => void engine.toggleAudioTrack(c.name, n)} title={`Send ${c.name} to OBS track ${n}`}>{trackOn(c, n) ? "On" : "Off"}</Toggle></td>
                  ))}
                  <td className="px-2">
                    <select aria-label={`Monitoring of ${c.name}`} className="console-select rounded px-2 py-1 text-xs" value={c.monitor} onChange={(e) => void engine.setAudioMonitor(c.name, e.target.value as MonitorType)}>
                      {MONITORS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

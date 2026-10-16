import { auxLabel } from "@/lib/aux-labels";
import { useDesk } from "./desk-context";
import { DcaStrip, GroupStrip, MasterStrip, ReturnStrip } from "./Strips";

// Second fader page: subgroups, DCAs, effect returns and master.
export function Mixer2() {
  const d = useDesk();
  const { mixer } = d;
  return <section className="mixer-surface">
    <div className="mixer-bank" role="group" aria-label="Groups, DCAs and returns">
      {mixer.groups.map((g) => <GroupStrip key={g.id} g={g} />)}
      {mixer.dcas.map((x, i) => <DcaStrip key={i} i={i} dca={x} />)}
      <ReturnStrip tag="AUX1" name={auxLabel(0)} note="Reverb return" value={mixer.fx.reverb.level} onChange={(v) => d.patchFx("reverb", { level: v })} />
      <ReturnStrip tag="AUX2" name={auxLabel(1)} note="Delay return" value={mixer.fx.delay.level} onChange={(v) => d.patchFx("delay", { level: v })} />
      <ReturnStrip tag="AUX3" name={auxLabel(2)} note="Headphone mix" value={mixer.fx.monitor.level} onChange={(v) => d.patchFx("monitor", { level: v })} />
      <MasterStrip />
    </div>
  </section>;
}

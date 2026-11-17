import {
  autoNote,
  formatNet,
  signalOf,
  type FieldNet,
  type SignalLevel,
} from "@/lib/mk/field-health";
import { cn } from "@/lib/utils";

/**
 * Connection-health display for field units. The phone and the director's unit card both use these,
 * so the bars, colours and numbers always match (they come from the same `signalOf`).
 */

const COLOR: Record<SignalLevel, string> = {
  good: "bg-emerald-400",
  fair: "bg-yellow-400",
  poor: "bg-amber-500",
  bad: "bg-red-500",
};

const TEXT: Record<SignalLevel, string> = {
  good: "text-emerald-400",
  fair: "text-yellow-400",
  poor: "text-amber-400",
  bad: "text-red-400",
};

/** Four bars. Empty and grey when there is no measurement. */
export function SignalBars({
  net,
  large = false,
  className,
}: {
  net: FieldNet | null;
  large?: boolean;
  className?: string;
}) {
  const sig = net ? signalOf(net) : null;
  return (
    <span
      role="img"
      aria-label={sig ? `Signal ${sig.level}` : "Signal unknown"}
      className={cn("inline-flex items-end gap-[2px]", large ? "h-6 gap-[3px]" : "h-3", className)}
    >
      {[1, 2, 3, 4].map((i) => {
        const on = !!sig && i <= sig.bars;
        return (
          <span
            key={i}
            data-on={on}
            className={cn(
              "rounded-[1px]",
              large ? "w-1.5" : "w-[3px]",
              on && sig ? COLOR[sig.level] : "bg-white/20",
            )}
            style={{ height: `${i * 25}%` }}
          />
        );
      })}
    </span>
  );
}

/** Small chip for the unit card's header: bars and the word. Nothing until there is a measurement. */
export function SignalChip({ net }: { net: FieldNet | null }) {
  if (!net) return null;
  const sig = signalOf(net);
  return (
    <span
      className="mk-button inline-flex items-center gap-1.5 rounded-[3px] px-2 py-1 font-mono text-[10px]"
      title={`Uplink: ${formatNet(net)}`}
    >
      <SignalBars net={net} />
      <span className={TEXT[sig.level]}>{sig.label}</span>
    </span>
  );
}

/** The unit card's line: signal, numbers, and what Auto is doing. Shown while the unit is live. */
export function UplinkLine({
  net,
  auto,
  topKbps,
  live,
}: {
  net: FieldNet | null;
  auto: boolean;
  topKbps: number;
  live: boolean;
}) {
  if (!live) return null;
  if (!net)
    return (
      <span className="font-mono text-[10px] text-muted-foreground" data-testid="uplink">
        Uplink: waiting for numbers from the phone…
      </span>
    );
  const sig = signalOf(net);
  const note = autoNote(net, auto, topKbps);
  return (
    <span
      className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] text-muted-foreground"
      data-testid="uplink"
    >
      <SignalBars net={net} />
      <span className={TEXT[sig.level]}>{sig.label}</span>
      <span>{formatNet(net)}</span>
      {note && <span className={note.lowered ? "text-amber-400" : undefined}>{note.text}</span>}
    </span>
  );
}

const HINT: Partial<Record<SignalLevel, string>> = {
  poor: "Weak signal. Move to open ground or near a window.",
  bad: "Very weak signal. The picture is being reduced to keep it live. Move to open ground if you can.",
};

/** The reporter's own indicator: big bars, the word, the numbers, and a hint when the signal is weak. */
export function ReporterSignal({
  net,
  auto,
  topKbps,
}: {
  net: FieldNet | null;
  auto: boolean;
  topKbps: number;
}) {
  if (!net)
    return (
      <div
        className="flex items-center justify-center gap-3 text-center font-mono text-[11px] text-muted-foreground"
        data-testid="reporter-signal"
      >
        <SignalBars net={null} large />
        <span>Checking your signal…</span>
      </div>
    );
  const sig = signalOf(net);
  const note = autoNote(net, auto, topKbps);
  const hint = HINT[sig.level];
  return (
    <div className="grid gap-1 text-center" data-testid="reporter-signal">
      <div className="flex items-center justify-center gap-3">
        <SignalBars net={net} large />
        <span className={cn("font-mono text-sm font-bold tracking-[0.15em]", TEXT[sig.level])}>
          {sig.label}
        </span>
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">{formatNet(net)}</p>
      {note?.lowered && <p className="font-mono text-[11px] text-amber-400">{note.text}</p>}
      {hint && <p className="text-xs text-amber-300">{hint}</p>}
    </div>
  );
}

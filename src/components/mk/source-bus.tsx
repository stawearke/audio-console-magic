import { BusButton } from "@/components/mk/bus-button";
import { CAM_COUNT, camLabel, type CamIndex } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

interface SourceBusProps {
  kind: "program" | "preview";
  active: CamIndex | null;
  camScenes: (string | null)[];
  onSelect: (cam: CamIndex) => void;
}

const isField = (scene: string | null) => !!scene && /^FIELD\b/i.test(scene);

export function SourceBus({ kind, active, camScenes, onSelect }: SourceBusProps) {
  // Only mapped sources get a button, so the bus grows when a field source is added and shrinks again.
  // Nothing mapped yet: show the first 8 so the operator can see what to set up.
  const mapped = Array.from({ length: CAM_COUNT }, (_, i) => i).filter((i) => !!camScenes[i]);
  const shown = mapped.length ? mapped : Array.from({ length: 8 }, (_, i) => i);
  return (
    <section className="mk-panel flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1">
      <div className="flex w-[4.2rem] shrink-0 items-center gap-1.5">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            kind === "program" ? "bg-program shadow-[0_0_7px_var(--color-program)]" : "bg-preview shadow-[0_0_7px_var(--color-preview)]",
          )}
        />
        <h2 className="mk-label text-[9px] text-foreground">{kind === "program" ? "Program" : "Preview"}</h2>
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fit,minmax(4.25rem,1fr))] gap-1">
        {shown.map((index) => (
          <BusButton
            key={index}
            label={camLabel(index)}
            scene={camScenes[index] ?? null}
            field={isField(camScenes[index] ?? null)}
            lit={active === index ? kind : null}
            onSelect={() => onSelect(index)}
          />
        ))}
      </div>
    </section>
  );
}

// Logo slots of a saved Custom design: every image element with a field name (Logo, Sponsor...).
// Change one here and the saved design itself is updated, so every row and rundown item shows the new logo.
import { Upload, X } from "lucide-react";

import { gfxLibrary, type SavedGraphic } from "@/lib/mk/gfx-library";
import { fileToLogo } from "@/lib/mk/graphics";
import type { CustomEl } from "@/lib/mk/types";

export function DesignLogos({
  design,
  say,
  onChanged,
}: {
  design: SavedGraphic;
  say: (m: string) => void;
  /** Called with the updated design so an open editor can reload it. */
  onChanged?: ((item: SavedGraphic) => void) | undefined;
}) {
  const els = (design.data as { elements: CustomEl[] }).elements;
  const slots = els.filter((e) => e.type === "image" && e.field.trim());
  if (!slots.length) return null;

  const set = (id: string, image: string | null) => {
    const item = gfxLibrary.update(design.id, { elements: els.map((e) => (e.id === id ? { ...e, image } : e)) });
    if (item) onChanged?.(item);
  };

  return (
    <div className="grid gap-1">
      <span className="mk-label text-[9px]">Logos</span>
      <div className="grid grid-cols-2 gap-1">
        {slots.map((e) => (
          <span key={e.id} className="flex h-7 min-w-0 items-center gap-1">
            <label className="mk-button flex h-7 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 rounded-[3px] px-1.5 text-[10px] normal-case">
              <Upload className="h-3 w-3 shrink-0" />
              <span className="truncate">{e.image ? `Change ${e.field}` : `Add ${e.field}`}</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (ev) => {
                  const f = ev.target.files?.[0];
                  ev.target.value = "";
                  if (!f) return;
                  try {
                    set(e.id, await fileToLogo(f, 1024));
                    say(`${e.field} updated`);
                  } catch {
                    say("That file is not a valid image");
                  }
                }}
              />
            </label>
            {e.image && (
              <button type="button" aria-label={`Remove ${e.field}`} className="mk-button flex h-7 w-7 items-center justify-center rounded-[3px]" onClick={() => set(e.id, null)}>
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

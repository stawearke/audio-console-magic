// Fill-in fields of the Custom graphic: what the crew edits live, without opening the editor.
import { Upload, X } from "lucide-react";

import { fileToLogo } from "@/lib/mk/graphics";
import type { CustomEl } from "@/lib/mk/types";

export function CustomFields({
  elements,
  onChange,
  say,
  title = true,
}: {
  elements: CustomEl[];
  onChange: (els: CustomEl[]) => void;
  say: (m: string) => void;
  title?: boolean;
}) {
  const fields = elements.filter((e) => e.field.trim() && (e.type === "text" || e.type === "image"));
  if (!fields.length) return null;
  const patch = (id: string, p: Partial<CustomEl>) => onChange(elements.map((e) => (e.id === id ? { ...e, ...p } : e)));
  return (
    <div className="col-span-2 grid gap-1">
      {title && <span className="mk-label text-[9px]">Fill in</span>}
      <div className="grid grid-cols-2 gap-1">
        {fields.map((e) =>
          e.type === "text" ? (
            <input
              key={e.id}
              className="mk-field h-6 min-w-0 rounded-[3px] px-1.5 text-[11px]"
              value={e.text}
              maxLength={500}
              placeholder={e.field}
              title={e.field}
              onChange={(ev) => patch(e.id, { text: ev.target.value })}
            />
          ) : (
            <span key={e.id} className="flex h-6 min-w-0 items-center gap-1">
              <span className="mk-button flex h-6 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 rounded-[3px] px-1.5 text-[10px] normal-case">
                <Upload className="h-3 w-3 shrink-0" />
                <span className="truncate">{e.image ? `Change ${e.field}` : e.field}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={async (ev) => {
                    const f = ev.target.files?.[0];
                    ev.target.value = "";
                    if (!f) return;
                    try {
                      patch(e.id, { image: await fileToLogo(f, 1024) });
                    } catch {
                      say("That file is not a valid image");
                    }
                  }}
                />
              </span>
              {e.image && (
                <button type="button" aria-label={`Remove ${e.field}`} className="mk-button flex h-6 w-6 items-center justify-center rounded-[3px]" onClick={() => patch(e.id, { image: null })}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

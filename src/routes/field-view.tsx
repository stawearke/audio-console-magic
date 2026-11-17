import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { useFieldViewer } from "@/lib/mk/field-units";

export const Route = createFileRoute("/field-view")({
  validateSearch: (s: Record<string, unknown>) => ({
    room: typeof s["room"] === "string" ? s["room"] : "",
    unit: Math.max(1, Math.min(99, Number(s["unit"]) || 1)),
    status: s["status"] === true || String(s["status"]) === "1" || s["status"] === "true",
  }),
  head: () => ({ meta: [{ title: "Field feed — MK VISION" }] }),
  component: FieldView,
});

/**
 * The picture of one field unit, full frame, nothing else. This is what OBS loads as a browser source:
 * the director never opens it by hand. It stays black while the unit is offline, so nothing odd can go to air.
 * Add `&status=1` to the address to see what it is doing (for testing in a normal browser).
 */
function FieldView() {
  const { room, unit, status } = Route.useSearch();
  const { state, stream } = useFieldViewer(room, unit, true);
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.srcObject = stream;
    if (!stream) return;
    el.muted = false;
    el.play().then(
      () => setMuted(false),
      () => {
        // A normal browser blocks sound until a tap. OBS does not.
        el.muted = true;
        setMuted(true);
        void el.play().catch(() => {});
      },
    );
  }, [stream]);

  return (
    <div
      className="fixed inset-0 bg-black"
      onClick={() => {
        const el = video.current;
        if (el && muted) {
          el.muted = false;
          setMuted(false);
        }
      }}
    >
      <video ref={video} autoPlay playsInline className="h-full w-full object-contain" />
      {(status || muted) && (
        <div className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 font-mono text-[11px] text-white">
          {!room ? "No room in this link" : muted ? "Tap for sound" : `FIELD ${unit} · ${state.link.toUpperCase()}`}
          {status && state.error ? ` · ${state.error}` : ""}
        </div>
      )}
    </div>
  );
}

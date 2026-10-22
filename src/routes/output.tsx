import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { openBus, readState } from "@/lib/broadcast/bus";
import { ProgramView, Stage } from "@/lib/broadcast/renderer";
import type { Program } from "@/lib/broadcast/types";

export const Route = createFileRoute("/output")({
  validateSearch: (s: Record<string, unknown>) => ({ mode: s["mode"] === "preview" ? "preview" : "program", key: s["key"] === "green" ? "green" : undefined }),
  head: () => ({
    meta: [
      { title: "OnAir Output — Transparent 1920×1080" },
      { name: "description", content: "Transparent program output for OBS Browser Source." },
      { property: "og:title", content: "OnAir Output" },
      { property: "og:description", content: "Transparent program output for OBS Browser Source." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Output,
});

function Output() {
  const { mode, key } = Route.useSearch();
  const [program, setProgram] = useState<Program>({});
  useEffect(() => {
    document.documentElement.classList.add("obs-output");
    const init = readState();
    setProgram(mode === "preview" ? init.preview : init.program); // recover last valid output
    const bus = openBus((m) => {
      if (m.type === "state") setProgram(mode === "preview" ? m.preview : m.program);
    });
    bus.send({ type: "request" });
    const hb = setInterval(() => bus.send({ type: "hello", mode }), 1000);
    bus.send({ type: "hello", mode });
    return () => { clearInterval(hb); bus.close(); document.documentElement.classList.remove("obs-output"); };
  }, [mode]);
  return (
    <div className="onair-root" style={{ position: "fixed", inset: 0, background: key === "green" ? "#00ff00" : "transparent" }}>
      <Stage fit="contain">
        <ProgramView program={program} />
      </Stage>
    </div>
  );
}

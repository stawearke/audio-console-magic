import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { StudioManager } from "@/components/mk/studio-manager";

export const Route = createFileRoute("/studio")({
  head: () => ({ meta: [{ title: "Studio — MK VISION" }] }),
  component: StudioPage,
});

function StudioPage() {
  return (
    <div className="mk-chassis min-h-[100dvh] pb-10">
      <header className="mk-chassis flex items-center gap-3 border-b border-border px-3 py-2">
        <Link
          to="/"
          className="mk-button flex h-9 items-center gap-2 rounded-sm px-3 text-xs"
          aria-label="Back to switcher"
        >
          <ArrowLeft className="h-4 w-4" /> Switcher
        </Link>
        <h1 className="text-base tracking-[0.2em] text-foreground">
          STUDIO · SCENES &amp; SOURCES
        </h1>
        <span className="mk-label ml-auto text-[9px]">By Konchella</span>
      </header>
      <StudioManager />
    </div>
  );
}

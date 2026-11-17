import { createFileRoute } from "@tanstack/react-router";

import { FieldUnit } from "@/components/mk/field-unit";

export const Route = createFileRoute("/field")({
  head: () => ({ meta: [{ title: "Field Unit — MK VISION" }] }),
  component: FieldPage,
});

function FieldPage() {
  return (
    <div className="mk-chassis min-h-[100dvh] pb-10">
      <header className="mk-chassis flex items-center gap-3 border-b border-border px-3 py-2">
        <h1 className="text-base tracking-[0.2em] text-foreground">FIELD UNIT</h1>
        <span className="mk-label ml-auto text-[9px]">By Konchella</span>
      </header>
      <FieldUnit />
    </div>
  );
}

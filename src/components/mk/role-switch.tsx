import { useState } from "react";

import { ROLES, ROLE_LABEL, roleLink, setRole, useRole } from "@/lib/mk/roles";
import { useSync } from "@/lib/mk/shared";
import { cn } from "@/lib/utils";

/** Which desk this screen is (Director / Graphics / Sound) + whether the shared setup is in step with OBS. */
export function RoleSwitch() {
  const role = useRole();
  const sync = useSync();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roleLink(role === "director" ? "graphics" : role));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const lamp =
    sync.state === "ok"
      ? "bg-preview shadow-[0_0_6px_var(--color-preview)]"
      : sync.state === "busy"
        ? "animate-pulse bg-amber"
        : sync.state === "error"
          ? "bg-program"
          : "bg-led-off";
  const lampText =
    sync.state === "ok"
      ? "Shared setup in step with OBS"
      : sync.state === "busy"
        ? "Syncing shared setup…"
        : sync.state === "error"
          ? "Shared setup could not reach OBS"
          : "Not syncing (not connected to OBS)";

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <div className="flex gap-0.5" role="group" aria-label="Desk">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            aria-pressed={role === r}
            className={cn(
              "mk-button h-7 rounded-[3px] px-2 text-[9px] tracking-[0.12em] uppercase",
              role === r && "text-foreground",
            )}
          >
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>
      <span className={cn("h-2 w-2 rounded-full", lamp)} title={lampText} aria-label={lampText} />
      <button
        type="button"
        onClick={() => void copy()}
        className="mk-button hidden h-7 rounded-[3px] px-2 text-[9px] tracking-[0.12em] lg:block"
        title="Copy the link that opens a crew member straight into a desk"
      >
        {copied ? "COPIED" : "DESK LINK"}
      </button>
    </div>
  );
}

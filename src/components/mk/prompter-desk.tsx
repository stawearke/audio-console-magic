import { RoleSwitch } from "@/components/mk/role-switch";
import { PrompterTab } from "@/components/mk/tools-hub";
import type { ConnectionStatus } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

const TEXT: Record<ConnectionStatus, string> = {
  connected: "OBS CONNECTED",
  connecting: "CONNECTING",
  disconnected: "OBS DISCONNECTED",
  error: "CONNECTION ERROR",
};

/**
 * The prompter operator's whole screen: script, play / pause, speed, size and the output window. Nothing
 * else of the switcher is on it. Several screens can follow the same script because they share one OBS WebSocket.
 */
export function PrompterDesk({
  status,
  message,
  locked,
}: {
  status: ConnectionStatus;
  message: string;
  locked: boolean;
}) {
  return (
    <div className="mk-chassis flex h-[100dvh] flex-col overflow-hidden">
      <header className="mk-chassis flex h-10 shrink-0 items-center gap-2 border-b border-white/10 px-2">
        <h1 className="shrink-0 text-base leading-none font-bold tracking-[0.22em] text-foreground">
          PROMPTER
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {!locked && <RoleSwitch />}
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              status === "connected" && "bg-preview shadow-[0_0_6px_var(--color-preview)]",
              status === "connecting" && "animate-pulse bg-amber",
              status === "disconnected" && "bg-led-off",
              status === "error" && "bg-program",
            )}
          />
          <span className="mk-label text-[9px] whitespace-nowrap">
            {TEXT[status]}
            {message ? ` · ${message}` : ""}
          </span>
        </div>
      </header>
      <main className="min-h-0 flex-1 p-1.5">
        <PrompterTab />
      </main>
    </div>
  );
}

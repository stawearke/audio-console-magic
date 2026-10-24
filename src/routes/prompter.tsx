import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { PrompterView } from "@/components/mk/prompter-view";
import {
  PROMPTER_CHANNEL,
  cleanPrompter,
  prompter,
  prompterRelayUp,
  prompterStore,
  usePrompter,
} from "@/lib/mk/prompter";
import { useSwitcher } from "@/lib/mk/use-switcher";

export const Route = createFileRoute("/prompter")({
  head: () => ({ meta: [{ title: "Prompter — MK VISION" }] }),
  component: PrompterOutput,
});

/**
 * Teleprompter output. Open it on the prompter screen (drag the window there, press F or
 * double-click for full screen). It mirrors the switcher window; keys here control playback.
 */
function PrompterOutput() {
  // Connects to OBS too (this browser's saved OBS settings), so the output follows a prompter desk on ANY PC.
  const sw = useSwitcher();
  const state = usePrompter();
  const [linked, setLinked] = useState(false);
  const ch = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel(PROMPTER_CHANNEL);
    ch.current = c;
    c.onmessage = (e: MessageEvent) => {
      if (e.data?.type === "state") {
        prompterStore.apply(cleanPrompter(e.data.state, prompterStore.get()));
        setLinked(true);
      }
    };
    c.postMessage({ type: "hello" });
    return () => {
      c.close();
      ch.current = null;
    };
  }, []);

  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const send = (cmd: string) => {
      // Over OBS: change our own copy, it is sent to every desk. Same browser only: ask the switcher window.
      if (prompterRelayUp()) {
        if (cmd === "toggle") prompter.toggle();
        else if (cmd === "top") prompter.top();
        else if (cmd === "back") prompter.nudge(-3);
        else if (cmd === "fwd") prompter.nudge(3);
        else if (cmd === "faster") prompter.setSpeed(prompterStore.get().speed + 1);
        else if (cmd === "slower") prompter.setSpeed(prompterStore.get().speed - 1);
      } else ch.current?.postMessage({ type: "cmd", cmd });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") send("toggle");
      else if (e.key === "ArrowUp") send("back");
      else if (e.key === "ArrowDown") send("fwd");
      else if (e.key === "ArrowRight" || e.key === "+") send("faster");
      else if (e.key === "ArrowLeft" || e.key === "-") send("slower");
      else if (e.key === "Home") send("top");
      else if (e.key === "f" || e.key === "F") fullscreen();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  return (
    <div
      className="h-[100dvh] bg-black"
      style={{ cursor: state.playing ? "none" : "default" }}
      onDoubleClick={fullscreen}
    >
      <PrompterView
        state={state}
        full
        onEnd={(em) =>
          prompterRelayUp() ? prompter.ended(em) : ch.current?.postMessage({ type: "ended", em })
        }
      />
      {!linked && state.text === "" && (
        <p className="pointer-events-none fixed inset-x-0 bottom-4 text-center font-mono text-xs text-white/50">
          {sw.status === "connected"
            ? "Waiting for the prompter desk…"
            : "Waiting for the prompter desk… keep the switcher window open (same browser), or connect this browser to OBS in Settings."}
        </p>
      )}
    </div>
  );
}

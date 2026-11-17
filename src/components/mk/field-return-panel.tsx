import { useState } from "react";

import { CUE_MAX } from "@/lib/mk/field-link";
import { cn } from "@/lib/utils";

const btn = "mk-button h-8 rounded-[3px] px-3 text-[11px]";

/** One-tap cues the director sends most. */
export const QUICK_CUES = ["STAND BY", "YOU ARE LIVE IN 10", "WRAP UP", "SPEAK UP", "MOVE CLOSER", "LOOK AT THE CAMERA", "HOLD THE SHOT STILL", "BACK TO STUDIO"] as const;

/**
 * The director's way back to the reporter: written cues that fill the phone screen (with a "seen" tick when the
 * reporter taps OK) and talkback straight into their ear. The red / green tally frame on the phone follows the
 * switcher by itself.
 */
export function FieldReturnPanel({
  online,
  talking,
  ack,
  onCue,
  onTalk,
}: {
  online: boolean;
  talking: boolean;
  /** Number of the last cue the reporter tapped OK on. */
  ack: number;
  /** Sends a cue; returns its number, or 0 when it could not be sent. */
  onCue: (text: string) => number;
  onTalk: (on: boolean) => Promise<string | null>;
}) {
  const [text, setText] = useState("");
  const [last, setLast] = useState<{ text: string; seq: number } | null>(null);
  const [note, setNote] = useState("");

  const send = (t: string) => {
    const seq = onCue(t);
    if (seq) {
      setLast({ text: t.trim(), seq });
      setNote("");
      setText("");
    } else setNote("Not sent: the reporter's phone is offline.");
  };

  const talk = async () => {
    setNote((await onTalk(!talking)) ?? "");
  };

  return (
    <div className="grid gap-2 rounded-[3px] border border-white/10 p-2">
      <span className="mk-label text-[9px]">TALK TO THE REPORTER</span>

      <button
        type="button"
        disabled={!online && !talking}
        aria-pressed={talking}
        className={cn(btn, "h-10 w-full font-bold tracking-[0.1em]", talking && "mk-lit-program")}
        onClick={() => void talk()}
        title="Your microphone goes to the reporter's ear. They must wear headphones."
      >
        {talking ? "TALKING TO REPORTER · TAP TO STOP" : "TALK (YOUR VOICE IN THEIR EAR)"}
      </button>

      <div className="flex flex-wrap gap-2">
        {QUICK_CUES.map((c) => (
          <button key={c} type="button" disabled={!online} className={cn(btn, "h-7 px-2 text-[10px]")} onClick={() => send(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && text.trim() && send(text)}
          maxLength={CUE_MAX}
          placeholder="Write a cue for the phone screen"
          className="mk-field h-8 min-w-0 flex-1 rounded-[3px] px-2 text-sm"
          aria-label="Cue text"
        />
        <button type="button" disabled={!online || !text.trim()} className={btn} onClick={() => send(text)}>
          SEND
        </button>
      </div>

      {last && (
        <span className={cn("font-mono text-[10px]", ack === last.seq ? "text-emerald-400" : "text-muted-foreground")}>
          “{last.text}” · {ack === last.seq ? "seen by the reporter ✓" : "sent, waiting for the reporter to tap OK"}
        </span>
      )}
      {note && <span className="font-mono text-[10px] text-amber-400">{note}</span>}
    </div>
  );
}

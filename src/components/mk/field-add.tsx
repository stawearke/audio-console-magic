import { useState } from "react";

import { FIELD_FIRST_SLOT } from "@/lib/mk/field-units";
import { engine } from "@/lib/mk/use-switcher";

const field = "mk-button h-9 w-full rounded-sm px-2 text-xs text-foreground";

/** Adds a field feed as scene "FIELD n" on the next free CAM slot from CAM 9. Studio cameras are not touched. */
export function FieldAdd() {
  const [mode, setMode] = useState<"media" | "web">("media");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const add = async () => {
    setBusy(true);
    setNote("");
    try {
      const scene = await engine.addFieldSource(mode, url, { fromSlot: FIELD_FIRST_SLOT });
      setNote(`Added ${scene}. It is on the source bus now.`);
      setUrl("");
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mk-panel grid gap-2 rounded-md p-2">
      <div className="mk-label text-[9px]">ADD FIELD SOURCE</div>
      <div className="flex flex-wrap gap-2">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "media" | "web")}
          className={`${field} max-w-[15rem]`}
        >
          <option value="media">SRT / RTMP / video URL</option>
          <option value="web">Web page (WebRTC link)</option>
        </select>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={
            mode === "media"
              ? "srt://server:8890?streamid=read:field1"
              : "https://relay.example.com/field1?controls=false&muted=false&autoplay=true&user=studio&pass=…"
          }
          className={`${field} min-w-[14rem] flex-1`}
        />
        <button
          type="button"
          disabled={busy || !url.trim()}
          onClick={() => void add()}
          className="mk-button h-9 rounded-sm px-4 text-xs"
        >
          Add
        </button>
      </div>
      {note && <p className="font-mono text-[10px] text-muted-foreground">{note}</p>}
    </div>
  );
}

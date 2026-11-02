import { Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { loadConfig } from "@/lib/mk/config";

interface EngineInfo {
  crew: boolean;
  lan: string[];
  crewPort: number;
}

const DESKS = [
  { role: "graphics", label: "Graphics desk" },
  { role: "sound", label: "Sound desk" },
  { role: "prompter", label: "Prompter" },
  { role: "director", label: "Second Director" },
];

function readEngine(): EngineInfo | null {
  try {
    const raw = window.localStorage.getItem("mkvision.engine.v1");
    return raw ? (JSON.parse(raw) as EngineInfo) : null;
  } catch {
    return null;
  }
}

/** Director's PC only: links that crew open in any browser on the same network. */
export function ShareDesk() {
  const [info, setInfo] = useState<EngineInfo | null>(null);
  const [copied, setCopied] = useState("");

  useEffect(() => setInfo(readEngine()), []);

  // Only the installed app publishes this; a normal browser has nothing to share.
  if (!info)
    return (
      <p className="text-xs text-engrave">
        Open this inside MK VISION Studio to share the desk with your crew.
      </p>
    );

  if (!info.crew)
    return (
      <p className="text-xs text-engrave">
        Crew access is off. In MK VISION Studio choose View → MK VISION → Allow crew on this
        network, then close and reopen the app. Windows may ask to allow network access the first
        time. Choose Private networks.
      </p>
    );

  if (!info.lan.length)
    return (
      <p className="text-xs text-engrave">
        No network address found. Connect this PC to the same Wi-Fi or cable network as your crew.
      </p>
    );

  const cfg = loadConfig();
  const link = (ip: string, role: string) =>
    `http://${ip}:${info.crewPort}/#mkport=${cfg.port}${cfg.password ? `&mkpw=${encodeURIComponent(cfg.password)}` : ""}&role=${role}`;

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      window.prompt("Copy this link", text);
    }
  };

  return (
    <div className="grid gap-2">
      <p className="font-mono text-[10px] text-muted-foreground">
        Send each person their link. They open it in a browser on the same network and land on their
        desk with nothing to type. Anyone with a link can control the show, so only share it with
        your crew.
      </p>
      {info.lan.map((ip) => (
        <div key={ip} className="grid gap-1">
          <div className="mk-label text-[9px]">THIS PC · {ip}</div>
          {DESKS.map((d) => (
            <div key={d.role} className="flex items-center gap-2">
              <span className="w-32 shrink-0 text-xs text-foreground">{d.label}</span>
              <input
                readOnly
                value={link(ip, d.role)}
                onFocus={(e) => e.currentTarget.select()}
                className="mk-button h-8 min-w-0 flex-1 rounded-sm px-2 font-mono text-[10px] text-foreground"
                aria-label={`${d.label} link`}
              />
              <button
                type="button"
                onClick={() => void copy(link(ip, d.role), ip + d.role)}
                className="mk-button flex h-8 items-center gap-1 rounded-sm px-2 text-xs"
              >
                <Copy className="h-3.5 w-3.5" /> {copied === ip + d.role ? "Copied" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

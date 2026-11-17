import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AitumClient, type AitumOutput } from "@/lib/mk/aitum";
import { cn } from "@/lib/utils";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Multistream for the OBS version of the app: drives the Aitum Multistream plugin. */
export function ObsMultistream() {
  const ref = useRef<AitumClient | null>(null);
  const [status, setStatus] = useState<"connecting" | "ready" | "noplugin" | "error">("connecting");
  const [error, setError] = useState("");
  const [outs, setOuts] = useState<AitumOutput[]>([]);
  const [live, setLive] = useState<Record<string, boolean>>({});
  const [main, setMain] = useState(false);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError("");
    const c = new AitumClient();
    try {
      await ref.current?.disconnect();
      ref.current = c;
      c.onClose = () => {
        setStatus("error");
        setError("Connection to OBS lost.");
      };
      await c.connect();
      if (!(await c.available())) return setStatus("noplugin");
      c.onOutput((name, on) => setLive((l) => ({ ...l, [name]: on })));
      setOuts(await c.outputs());
      setMain(await c.mainLive());
      setStatus("ready");
    } catch (e) {
      setStatus("error");
      setError(msg(e));
    }
  }, []);

  useEffect(() => {
    void connect();
    return () => {
      void ref.current?.disconnect();
    };
  }, [connect]);

  useEffect(() => {
    if (status !== "ready") return;
    const id = setInterval(
      () =>
        void ref.current
          ?.mainLive()
          .then(setMain)
          .catch(() => {}),
      2000,
    );
    return () => clearInterval(id);
  }, [status]);

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(msg(e));
    }
  };

  const c = ref.current;
  if (status !== "ready" || !c) {
    return (
      <div className="mk-panel mx-auto mt-6 grid max-w-xl gap-3 rounded-md p-4">
        <div className="text-sm text-foreground">
          {status === "connecting" && "Connecting to OBS…"}
          {status === "noplugin" && "Install the Aitum Multistream plugin in OBS"}
          {status === "error" && "Cannot reach OBS"}
        </div>
        {status === "noplugin" && (
          <p className="font-mono text-[10px] text-muted-foreground">
            Free plugin: aitum.tv/multistream. Install it, restart OBS, then in its dock add one
            output per destination (YouTube, Facebook, Twitch… server + stream key). Come back and
            press Try again: they appear here with Start / Stop buttons.
          </p>
        )}
        {error && <p className="font-mono text-[11px] text-muted-foreground">{error}</p>}
        <button
          type="button"
          onClick={() => void connect()}
          className="mk-button flex h-9 w-fit items-center gap-2 rounded-sm px-3 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-3 p-3">
      <section className="mk-panel grid gap-2 rounded-md p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mk-label text-[9px]">MAIN STREAM</div>
          <span
            className={cn(
              "mk-button flex h-7 items-center rounded-sm px-3 text-[11px]",
              main && "mk-lit-program",
            )}
          >
            {main ? "LIVE" : "OFF"}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => void run(() => Promise.all(outs.map((o) => c.start(o.name))))}
              className="mk-button h-9 rounded-sm px-4 text-xs"
            >
              Start all
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Stop every extra destination? The main stream keeps running."))
                  void run(() => Promise.all(outs.map((o) => c.stop(o.name))));
              }}
              className="mk-button h-9 rounded-sm px-4 text-xs"
            >
              Stop all
            </button>
            <button
              type="button"
              onClick={() => void run(async () => setOuts(await c.outputs()))}
              aria-label="Refresh destinations"
              className="mk-button flex h-9 w-9 items-center justify-center rounded-sm"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">
          Destinations come from the Aitum Multistream dock in OBS (add or edit server and key
          there). Each one needs its own upload speed, and its own encode unless it shares the main
          encoder.
        </p>
      </section>

      {error && (
        <p className="rounded-sm border border-border p-2 font-mono text-[11px] text-foreground">
          {error}
        </p>
      )}

      <ul className="grid gap-2">
        {outs.map((o) => {
          const on = live[o.name];
          return (
            <li
              key={`${o.vertical}-${o.name}`}
              className="mk-panel flex flex-wrap items-center gap-2 rounded-md p-3"
            >
              <span className="text-sm text-foreground">{o.name}</span>
              {o.vertical && <span className="mk-label text-[9px]">VERTICAL</span>}
              <span
                className={cn(
                  "mk-button flex h-7 items-center rounded-sm px-3 font-mono text-[10px]",
                  on && "mk-lit-program",
                )}
              >
                {on === undefined ? "—" : on ? "LIVE" : "OFF"}
              </span>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => void run(() => c.start(o.name))}
                  className="mk-button h-9 rounded-sm px-4 text-xs"
                >
                  Start
                </button>
                <button
                  type="button"
                  onClick={() => void run(() => c.stop(o.name))}
                  className="mk-button h-9 rounded-sm px-4 text-xs"
                >
                  Stop
                </button>
              </div>
            </li>
          );
        })}
        {!outs.length && (
          <li className="font-mono text-[11px] text-muted-foreground">
            No destinations in Aitum yet. Add them in the Aitum Multistream dock in OBS, then
            refresh.
          </li>
        )}
      </ul>
    </div>
  );
}

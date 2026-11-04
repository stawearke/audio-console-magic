import { useCallback, useEffect, useRef, useState } from "react";
import { isEmbedded, useEmbedded } from "@/lib/mk/cloud";

interface Dev {
  name: string;
  id: string;
}
interface Chan {
  channel: number;
  kind: "input" | "output";
  name?: string;
  deviceId?: string;
}
interface Reply {
  inputs: Dev[];
  outputs: Dev[];
  channels: Chan[];
}

interface MonReply {
  devices: Dev[];
  currentId: string;
  currentName: string;
}

const DISABLED = "disabled";
const SLOT_LABEL: Record<number, string> = {
  1: "Desktop audio 1",
  2: "Desktop audio 2",
  3: "Mic / Aux 1",
  4: "Mic / Aux 2",
  5: "Mic / Aux 3",
  6: "Mic / Aux 4",
};

let tokenCache = "";
async function getToken(): Promise<string> {
  if (tokenCache) return tokenCache;
  const r = await fetch("/mk-config.json", { cache: "no-store" });
  if (!r.ok) throw new Error("The built-in engine did not answer.");
  const c = (await r.json()) as { token?: string };
  if (!c.token) throw new Error("This app version has no device bridge.");
  tokenCache = c.token;
  return tokenCache;
}

async function api<T>(route: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const init: RequestInit = {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-MK-Token": token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    cache: "no-store",
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(`/mk-api/${route}`, init);
  if (!r.ok) throw new Error(`Device bridge error (${r.status}).`);
  return (await r.json()) as T;
}

/** Audio devices: any USB / system audio device OBS can capture, put on an always-live channel. */
export function ObsDevices() {
  const embedded = useEmbedded();
  const [data, setData] = useState<Reply | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(0);
  const [mon, setMon] = useState<MonReply | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<Reply>("audio-devices");
      const all = [...r.inputs, ...r.outputs].map((d) => d.id);
      if (seen.current === null) seen.current = new Set(all);
      else {
        const added = all.filter((id) => !seen.current!.has(id));
        if (added.length) setFresh((f) => new Set([...f, ...added]));
        all.forEach((id) => seen.current!.add(id));
      }
      setData(r);
      setMon(await api<MonReply>("monitor-devices"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the devices.");
    }
  }, []);

  useEffect(() => {
    if (!isEmbedded()) return;
    void load();
    const t = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 3000);
    return () => window.clearInterval(t);
  }, [load]);

  const assign = async (ch: Chan, deviceId: string, devices: Dev[]) => {
    setBusy((n) => n + 1);
    try {
      const label = devices.find((d) => d.id === deviceId)?.name ?? "";
      await api("audio-device", { channel: ch.channel, deviceId, label });
      setFresh((f) => {
        const n = new Set(f);
        n.delete(deviceId);
        return n;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the device.");
    } finally {
      setBusy((n) => n - 1);
    }
  };

  const setMonitor = async (deviceId: string) => {
    setBusy((n) => n + 1);
    try {
      await api("monitor-device", { deviceId });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the monitoring device.");
    } finally {
      setBusy((n) => n - 1);
    }
  };

  if (!embedded) {
    return (
      <section className="mixer-surface p-3" aria-label="Devices">
        <p className="label-text text-xs">Devices are managed inside MK VISION Studio.</p>
      </section>
    );
  }

  return (
    <section className="mixer-surface p-3" aria-label="Devices">
      <h3 className="module-title mb-2 text-[11px] font-bold uppercase tracking-[0.2em]">
        Devices: audio inputs on the engine
      </h3>
      <p className="label-text mb-3 max-w-3xl text-[10px] leading-relaxed">
        Pick any audio device the engine can see (USB interfaces, mixers, headsets, virtual cables) for a channel. Channels here
        are always live, whatever scene is on air, and appear in the Mixer straight away. Plug a device in and it shows up
        within a few seconds, marked NEW.
      </p>
      {error && <p className="mb-2 text-xs text-amber">{error}</p>}
      {mon && (
        <div className="channel-strip mb-3 flex flex-col gap-1 p-2">
          <span className="text-[11px] font-bold uppercase tracking-widest">Monitoring output (Main / Solo)</span>
          <span className="label-text text-[10px]">Where pre-listen and monitored channels are heard on this PC.</span>
          <select
            aria-label="Monitoring output device"
            className="console-select rounded px-2 py-1 text-xs"
            value={mon.currentId}
            disabled={busy > 0}
            onChange={(e) => void setMonitor(e.target.value)}
          >
            {!mon.devices.some((d) => d.id === mon.currentId) && <option value={mon.currentId}>(device not connected)</option>}
            {mon.devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {!data ? (
        <p className="label-text text-xs">Reading devices…</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {data.channels.map((ch) => {
            const devices = ch.kind === "output" ? data.outputs : data.inputs;
            const current = ch.deviceId || DISABLED;
            const known = devices.some((d) => d.id === current);
            return (
              <div key={ch.channel} className="channel-strip flex flex-col gap-1 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-widest">{SLOT_LABEL[ch.channel]}</span>
                  <span className="label-text truncate text-[10px]" title={ch.name}>
                    {ch.name ? `Mixer: ${ch.name}` : "Empty"}
                  </span>
                </div>
                <select
                  aria-label={`Device for ${SLOT_LABEL[ch.channel]}`}
                  className="console-select rounded px-2 py-1 text-xs"
                  value={current}
                  disabled={busy > 0}
                  onChange={(e) => void assign(ch, e.target.value, devices)}
                >
                  <option value={DISABLED}>Disabled</option>
                  {!known && current !== DISABLED && <option value={current}>(device not connected)</option>}
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {fresh.has(d.id) ? "NEW · " : ""}
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

import { Eye, EyeOff, Plus, Trash2, Radio, Pencil, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  PRESETS,
  StudioClient,
  presetForKind,
  type DeviceOption,
  type SourcePreset,
  type StudioItem,
} from "@/lib/mk/obs-studio";
import { cn } from "@/lib/utils";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function SourceRow({
  client,
  item,
  onToggle,
  onRemove,
  onError,
}: {
  client: StudioClient;
  item: StudioItem;
  onToggle: () => void;
  onRemove: () => void;
  onError: (m: string) => void;
}) {
  const preset = presetForKind(item.kind);
  const [options, setOptions] = useState<DeviceOption[]>([]);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!preset?.prop) return;
    let alive = true;
    void (async () => {
      try {
        setValue(await client.setting(item.source, preset.prop!));
        if (preset.mode === "list") {
          const list = await client.devices(item.source, preset.prop!);
          if (alive) setOptions(list);
        }
      } catch {
        /* a source with no such property: leave the field empty */
      }
    })();
    return () => {
      alive = false;
    };
  }, [client, item.source, preset]);

  const save = async (v: string) => {
    setValue(v);
    try {
      await client.setSetting(item.source, preset!.prop!, v);
    } catch (e) {
      onError(msg(e));
    }
  };

  return (
    <li className="mk-panel flex flex-wrap items-center gap-2 rounded-md p-2">
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.enabled ? "Hide in this scene" : "Show in this scene"}
        className={cn(
          "mk-button flex h-8 w-8 items-center justify-center rounded-sm",
          item.enabled && "mk-lit-program",
        )}
      >
        {item.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
      <div className="min-w-[8rem] flex-1">
        <div className="text-sm text-foreground">{item.source}</div>
        <div className="mk-label text-[9px]">{presetForKind(item.kind)?.label ?? item.kind}</div>
      </div>
      {preset?.prop && preset.mode === "list" && (
        <select
          value={value}
          onChange={(e) => void save(e.target.value)}
          className="mk-button h-8 max-w-[18rem] rounded-sm px-2 text-xs text-foreground"
          aria-label="Device"
        >
          {!options.some((o) => o.value === value) && (
            <option value={value}>{value || "Choose…"}</option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.name}
            </option>
          ))}
        </select>
      )}
      {preset?.prop && preset.mode === "text" && (
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void save(value)}
          className="mk-button h-8 w-64 max-w-full rounded-sm px-2 text-xs text-foreground"
          aria-label={preset.prop}
          placeholder={preset.prop}
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove from this scene"
        className="mk-button flex h-8 w-8 items-center justify-center rounded-sm"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

export function StudioManager() {
  const clientRef = useRef<StudioClient | null>(null);
  const [status, setStatus] = useState<"connecting" | "ready" | "error">("connecting");
  const [error, setError] = useState("");
  const [scenes, setScenes] = useState<string[]>([]);
  const [program, setProgram] = useState("");
  const [selected, setSelected] = useState("");
  const [items, setItems] = useState<StudioItem[]>([]);
  const [kinds, setKinds] = useState<string[]>([]);
  const [allInputs, setAllInputs] = useState<string[]>([]);
  const [newScene, setNewScene] = useState("");
  const [presetId, setPresetId] = useState(PRESETS[0]?.id ?? "");
  const [sourceName, setSourceName] = useState("");
  const [existing, setExisting] = useState("");

  const refreshScenes = useCallback(async () => {
    const c = clientRef.current;
    if (!c) return;
    const { names, program: p } = await c.scenes();
    setScenes(names);
    setProgram(p);
    setSelected((cur) => (cur && names.includes(cur) ? cur : p || names[0] || ""));
  }, []);

  const refreshItems = useCallback(async (scene: string) => {
    const c = clientRef.current;
    if (!c || !scene) return setItems([]);
    setItems(await c.items(scene));
    setAllInputs(await c.inputs());
  }, []);

  const fail = useCallback((m: string) => setError(m), []);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError("");
    const c = new StudioClient();
    try {
      await clientRef.current?.disconnect();
      clientRef.current = c;
      c.onClose = () => {
        setStatus("error");
        setError("Connection to OBS lost.");
      };
      await c.connect();
      c.on("SceneListChanged", () => void refreshScenes().catch(() => {}));
      c.on("CurrentProgramSceneChanged", () => void refreshScenes().catch(() => {}));
      setKinds(await c.kinds());
      await refreshScenes();
      setStatus("ready");
    } catch (e) {
      setStatus("error");
      setError(msg(e));
    }
  }, [refreshScenes]);

  useEffect(() => {
    void connect();
    return () => {
      void clientRef.current?.disconnect();
    };
  }, [connect]);

  useEffect(() => {
    if (status === "ready") void refreshItems(selected).catch((e) => fail(msg(e)));
  }, [status, selected, refreshItems, fail]);

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(msg(e));
    }
  };

  const c = clientRef.current;
  const available: SourcePreset[] = PRESETS.filter((p) => kinds.includes(p.kind));
  const preset = available.find((p) => p.id === presetId) ?? available[0];
  const inScene = new Set(items.map((i) => i.source));

  if (status !== "ready" || !c) {
    return (
      <div className="mk-panel mx-auto mt-6 grid max-w-xl gap-3 rounded-md p-4">
        <div className="text-sm text-foreground">
          {status === "connecting" ? "Connecting to OBS…" : "Cannot reach OBS"}
        </div>
        {error && <p className="font-mono text-[11px] text-muted-foreground">{error}</p>}
        <p className="font-mono text-[10px] text-muted-foreground">
          In OBS turn on Tools → WebSocket Server Settings, then check the host, port and password
          in MK Settings.
        </p>
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
    <div className="grid gap-3 p-3 md:grid-cols-[18rem_1fr]">
      {/* ---- scenes */}
      <section className="mk-panel grid content-start gap-2 rounded-md p-2">
        <div className="mk-label text-[9px]">SCENES</div>
        <ul className="grid gap-1">
          {scenes.map((s) => (
            <li key={s} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSelected(s)}
                className={cn(
                  "mk-button flex h-8 min-w-0 flex-1 items-center rounded-sm px-2 text-left text-xs",
                  s === selected && "mk-lit-amber",
                )}
              >
                <span className="truncate">{s}</span>
              </button>
              <button
                type="button"
                aria-label={`Put ${s} on air`}
                title="Put on air"
                onClick={() => void run(() => c.goLive(s))}
                className={cn(
                  "mk-button flex h-8 w-8 items-center justify-center rounded-sm",
                  s === program && "mk-lit-program",
                )}
              >
                <Radio className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Rename ${s}`}
                onClick={() => {
                  const n = window.prompt("Rename scene", s)?.trim();
                  if (n && n !== s)
                    void run(async () => {
                      await c.renameScene(s, n);
                      if (selected === s) setSelected(n);
                      await refreshScenes();
                    });
                }}
                className="mk-button flex h-8 w-8 items-center justify-center rounded-sm"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${s}`}
                onClick={() => {
                  if (window.confirm(`Delete scene “${s}”?`))
                    void run(async () => {
                      await c.removeScene(s);
                      await refreshScenes();
                    });
                }}
                className="mk-button flex h-8 w-8 items-center justify-center rounded-sm"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-1">
          <input
            value={newScene}
            onChange={(e) => setNewScene(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && document.getElementById("mk-add-scene")?.click()}
            placeholder="New scene name"
            className="mk-button h-8 min-w-0 flex-1 rounded-sm px-2 text-xs text-foreground"
          />
          <button
            id="mk-add-scene"
            type="button"
            disabled={!newScene.trim()}
            onClick={() =>
              void run(async () => {
                const n = newScene.trim();
                await c.createScene(n);
                setNewScene("");
                await refreshScenes();
                setSelected(n);
              })
            }
            className="mk-button flex h-8 items-center gap-1 rounded-sm px-2 text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </section>

      {/* ---- sources of the selected scene */}
      <section className="grid content-start gap-2">
        <div className="mk-label text-[9px]">SOURCES IN “{selected || "—"}”</div>
        {error && (
          <p className="rounded-sm border border-border p-2 font-mono text-[11px] text-foreground">
            {error}
          </p>
        )}
        <ul className="grid gap-1.5">
          {items.map((i) => (
            <SourceRow
              key={i.id}
              client={c}
              item={i}
              onError={fail}
              onToggle={() =>
                void run(async () => {
                  await c.setEnabled(selected, i.id, !i.enabled);
                  await refreshItems(selected);
                })
              }
              onRemove={() => {
                if (
                  window.confirm(
                    `Remove “${i.source}” from this scene? The source itself stays in OBS.`,
                  )
                )
                  void run(async () => {
                    await c.removeItem(selected, i.id);
                    await refreshItems(selected);
                  });
              }}
            />
          ))}
          {!items.length && (
            <li className="font-mono text-[11px] text-muted-foreground">
              No sources in this scene yet.
            </li>
          )}
        </ul>

        <div className="mk-panel grid gap-2 rounded-md p-2">
          <div className="mk-label text-[9px]">ADD A NEW SOURCE</div>
          <div className="flex flex-wrap gap-1">
            <select
              value={preset?.id ?? ""}
              onChange={(e) => setPresetId(e.target.value)}
              className="mk-button h-8 rounded-sm px-2 text-xs text-foreground"
              aria-label="Source type"
            >
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <input
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="Name, e.g. Camera 1"
              className="mk-button h-8 min-w-[10rem] flex-1 rounded-sm px-2 text-xs text-foreground"
            />
            <button
              type="button"
              disabled={!preset || !sourceName.trim() || !selected}
              onClick={() =>
                void run(async () => {
                  await c.createSource(selected, sourceName.trim(), preset!.kind);
                  setSourceName("");
                  await refreshItems(selected);
                })
              }
              className="mk-button flex h-8 items-center gap-1 rounded-sm px-3 text-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            After adding, choose the device or type the file / address on the new row.
          </p>
        </div>

        <div className="mk-panel grid gap-2 rounded-md p-2">
          <div className="mk-label text-[9px]">ADD A SOURCE THAT ALREADY EXISTS</div>
          <div className="flex gap-1">
            <select
              value={existing}
              onChange={(e) => setExisting(e.target.value)}
              className="mk-button h-8 min-w-0 flex-1 rounded-sm px-2 text-xs text-foreground"
              aria-label="Existing source"
            >
              <option value="">Choose a source…</option>
              {allInputs
                .filter((n) => !inScene.has(n))
                .map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={!existing || !selected}
              onClick={() =>
                void run(async () => {
                  await c.addExisting(selected, existing);
                  setExisting("");
                  await refreshItems(selected);
                })
              }
              className="mk-button flex h-8 items-center gap-1 rounded-sm px-3 text-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

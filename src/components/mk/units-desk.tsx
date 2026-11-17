import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

import { FieldCameraPanel } from "@/components/mk/field-camera-panel";
import { FieldReturnPanel } from "@/components/mk/field-return-panel";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_FIELD_FPS, DEFAULT_FIELD_ORIENT, DEFAULT_FIELD_QUALITY, fieldKbps, FIELD_FPS, FIELD_KBPS, FIELD_QUALITY, reporterUrl, viewerUrl, type FieldCtl, type FieldSetup } from "@/lib/mk/field-link";
import { FIELD_FIRST_SLOT, fieldUnits, setupOf, useFieldUnits, useFieldViewer, useThrottledCtl, type FieldUnitInfo } from "@/lib/mk/field-units";
import { engine, useSwitcher } from "@/lib/mk/use-switcher";
import { camLabel } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

const input = "mk-field h-9 min-w-0 rounded-[3px] px-2 text-sm";
const btn = "mk-button h-8 rounded-[3px] px-3 text-[11px]";
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const CHIP: Record<string, { text: string; cls: string }> = {
  connecting: { text: "CHECKING", cls: "mk-button" },
  offline: { text: "OFFLINE", cls: "mk-button" },
  standby: { text: "ONLINE · STANDBY", cls: "mk-lit-preview" },
  live: { text: "LIVE", cls: "mk-lit-program" },
};

/** Director's field page: add a unit (name + place), send its link, it appears as the next CAM (5, 6, 7…). */
export function UnitsDesk() {
  const { room, base, units } = useFieldUnits();
  const sw = useSwitcher();
  const [name, setName] = useState("");
  const [loc, setLoc] = useState("");
  const [note, setNote] = useState("");
  const [qr, setQr] = useState<FieldUnitInfo | null>(null);
  const connected = sw.status === "connected" && !sw.demo;
  const [roomReady, setRoomReady] = useState(false);

  // One room for everybody: it lives in OBS. The first desk to connect saves its room there,
  // every other device and address then adopts it, so links and OBS sources can never drift apart.
  useEffect(() => {
    if (!connected || !room) {
      setRoomReady(false);
      return;
    }
    let alive = true;
    void (async () => {
      const inObs = await engine.getFieldRoom();
      if (!alive) return;
      if (inObs && inObs !== room) fieldUnits.setRoom(inObs);
      else if (!inObs) await engine.setFieldRoom(room).catch(() => {});
      if (alive) setRoomReady(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, room === ""]);

  // Only units switched to FADER mode need re-syncing when new scenes appear in OBS.
  const sceneCount = sw.scenes.length;
  useEffect(() => {
    if (connected) void engine.syncFieldAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, sceneCount]);

  const newRoom = async () => {
    if (!confirm("New room code? Links already sent stop working, and the OBS sources are re-pointed for you.")) return;
    fieldUnits.newRoom();
    const next = fieldUnits.snapshot().room;
    await engine.setFieldRoom(next).catch(() => {});
    for (const u of fieldUnits.snapshot().units)
      await engine.setFieldUrl(u.n, viewerUrl(fieldUnits.snapshot().base, next, u.n)).catch(() => {});
  };
  const insecure = base !== "" && !base.startsWith("https://");

  const sceneOf = (n: number) => sw.config.camScenes.find((s) => s && new RegExp(`^FIELD ${n}\\b`, "i").test(s)) ?? null;
  const camOf = (n: number) => {
    const scene = sceneOf(n);
    return scene ? sw.config.camScenes.indexOf(scene) : -1;
  };

  const toSwitcher = async (u: FieldUnitInfo) => {
    try {
      await engine.addFieldSource("web", viewerUrl(base, room, u.n), {
        n: u.n,
        label: u.name || u.loc,
        fromSlot: FIELD_FIRST_SLOT,
      });
      // Every field gets its OWN fader in the audio mixer (and OBS). The feed is kept active in your other
      // scenes (far off canvas, never seen) so its sound keeps flowing whichever scene is on air.
      await engine.setFieldAudioAlways(u.n, true);
      setNote("");
    } catch (e) {
      setNote(`FIELD ${u.n}: ${msg(e)}`);
    }
  };

  const cleanScenes = async () => {
    if (!confirm("Remove the field feeds from all your other scenes and use GLOBAL audio (Desktop Audio)?")) return;
    try {
      await engine.makeAllFieldAudioGlobal(units.map((x) => x.n));
      setNote("Done. The field feeds are only in their own FIELD scenes now.");
    } catch (e) {
      setNote(msg(e));
    }
  };

  // Units added by an older version were set to GLOBAL (no strip of their own): switch them all to own faders.
  const ownFaders = async () => {
    try {
      for (const x of units) if (camOf(x.n) >= 0) await engine.setFieldAudioAlways(x.n, true);
      setNote("Done. Every field unit now has its own fader in the Audio mixer.");
    } catch (e) {
      setNote(msg(e));
    }
  };

  const add = async () => {
    const u = fieldUnits.add(name, loc);
    setName("");
    setLoc("");
    if (connected) await toSwitcher(u);
    else setNote("Unit added. It joins the switcher as soon as OBS is connected (press Add to switcher).");
  };

  return (
    <div className="mx-auto grid max-w-3xl gap-3 p-3">
      <div className="mk-panel grid gap-2 rounded-md p-3">
        <div className="mk-label text-[9px]">ADD FIELD UNIT</div>
        <div className="flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Ryan)" maxLength={30} className={cn(input, "w-40 flex-1")} />
          <input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Location (e.g. Kisumu, county offices)" maxLength={50} className={cn(input, "w-56 flex-[2]")} onKeyDown={(e) => e.key === "Enter" && void add()} />
          <button type="button" className="mk-button h-9 rounded-[3px] px-5 text-xs font-bold" onClick={() => void add()}>
            ADD
          </button>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">
          Each unit gets a link to send to the reporter, and becomes the next free camera from CAM {FIELD_FIRST_SLOT + 1} (CAM 9). No scene mapping.
        </p>
        {!connected && (
          <p className="font-mono text-[10px] text-amber-400">OBS is not connected, so units cannot join the switcher yet. Links still work.</p>
        )}
        {note && <p className="font-mono text-[10px] text-amber-400">{note}</p>}
      </div>

      {units.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={!connected} className="mk-button h-9 rounded-[3px] px-4 text-xs" onClick={() => void ownFaders()}>
            GIVE EVERY FIELD ITS OWN FADER
          </button>
          <button type="button" disabled={!connected} className="mk-button h-9 rounded-[3px] px-4 text-xs" onClick={() => void cleanScenes()}>
            ALL FIELD SOUND GLOBAL (DESKTOP AUDIO)
          </button>
        </div>
      )}

      {units.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No field units yet. Add the first one above.</p>}

      {units.map((u) => (
        <UnitCard key={u.n} u={u} room={room} base={base} cam={camOf(u.n)} connected={connected && roomReady} onAdd={() => void toSwitcher(u)} onQr={() => setQr(u)} />
      ))}

      <details className="mk-panel rounded-md p-3 text-xs">
        <summary className="mk-label cursor-pointer text-[9px]">LINK SETTINGS</summary>
        <div className="mt-2 grid gap-2">
          <label className="grid gap-1">
            <span className="mk-label text-[9px]">APP ADDRESS (what reporters open, must be https)</span>
            <input value={base} onChange={(e) => fieldUnits.setBase(e.target.value)} className={input} />
          </label>
          {insecure && (
            <p className="font-mono text-[10px] text-amber-400">
              This address is not https, so a phone camera will not start from it. Open this page from the https address of your app, or paste it here.
            </p>
          )}
          <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
            Room code: {room}
            <button
              type="button"
              className={btn}
              onClick={() => void newRoom()}
            >
              New room code
            </button>
          </div>
        </div>
      </details>

      <Dialog open={!!qr} onOpenChange={(o) => !o && setQr(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>FIELD {qr?.n} · {qr?.name}</DialogTitle>
            <DialogDescription>Scan with the reporter's phone camera.</DialogDescription>
          </DialogHeader>
          {qr && <Qr text={reporterUrl(base, room, qr.n, qr.name, qr.loc)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Qr({ text }: { text: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(text, { margin: 1, width: 320 }).then((d) => alive && setSrc(d));
    return () => {
      alive = false;
    };
  }, [text]);
  return src ? <img src={src} alt="QR code" className="mx-auto h-64 w-64 rounded bg-white p-2" /> : null;
}

function UnitCard({
  u,
  room,
  base,
  cam,
  connected,
  onAdd,
  onQr,
}: {
  u: FieldUnitInfo;
  room: string;
  base: string;
  cam: number;
  connected: boolean;
  onAdd: () => void;
  onQr: () => void;
}) {
  const [watch, setWatch] = useState(false);
  // The torch is never remembered: a light that switches itself on at the next session would surprise the reporter.
  const { torch: _torch, ...rememberedCtl } = u.ctl ?? {};
  const { state, stream, setSetup, setCtl, setTally, cue, talk } = useFieldViewer(room, u.n, watch, setupOf(u), rememberedCtl);
  const sendCtl = useThrottledCtl(setCtl);
  const sw = useSwitcher();
  const inputName = `FIELD ${u.n} feed`;
  const always = sw.config.fieldAudioAlways.includes(inputName);
  const strip = sw.audio.find((c) => c.name === inputName);
  // What the director has chosen (portrait, 1080p HQ, 30 fps, automatic bitrate until changed).
  const wantOrient = u.orient ?? DEFAULT_FIELD_ORIENT;
  const wantRes = u.quality ?? DEFAULT_FIELD_QUALITY;
  const wantFps = u.fps ?? DEFAULT_FIELD_FPS;
  const wantKbps = u.kbps ?? 0;
  const pick = (patch: Partial<FieldSetup>) => {
    fieldUnits.update(u.n, {
      ...(patch.res !== undefined ? { quality: patch.res } : {}),
      ...(patch.fps !== undefined ? { fps: patch.fps } : {}),
      ...(patch.orient !== undefined ? { orient: patch.orient } : {}),
      ...(patch.kbps !== undefined ? { kbps: patch.kbps } : {}),
    });
    setSetup(patch);
  };
  const online = state.link !== "offline" && state.link !== "connecting";
  // The reporter's phone shows a red frame while this unit is on air and a green one while it is next.
  const tallyNow = cam < 0 ? "off" : sw.program === cam ? "program" : sw.preview === cam ? "preview" : "off";
  useEffect(() => {
    setTally(tallyNow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tallyNow, state.link]);
  // What the director set wins (so a dragged slider never jumps back); otherwise what the phone reports.
  const [torch, setTorch] = useState<boolean | undefined>(undefined);
  const ctlNow: FieldCtl = { ...state.ctl, ...rememberedCtl, ...((torch ?? state.ctl.torch) !== undefined ? { torch: (torch ?? state.ctl.torch) as boolean } : {}) };
  const pickCtl = (patch: FieldCtl) => {
    const { torch: t, ...keep } = patch;
    if (t !== undefined) setTorch(t);
    // A new camera has its own zoom / focus / light: forget the old camera's values.
    const switching = patch.facing && patch.facing !== (u.ctl?.facing ?? "environment");
    if (switching) setTorch(false);
    const base = switching ? {} : (u.ctl ?? {});
    fieldUnits.update(u.n, { ctl: { ...base, ...keep } });
    sendCtl(patch);
  };
  const sendingShort = FIELD_QUALITY.find((x) => x.id === state.quality)?.short ?? state.quality;
  const video = useRef<HTMLVideoElement>(null);
  const [copied, setCopied] = useState(false);
  const [obsUrl, setObsUrl] = useState<string | null | undefined>(undefined);
  const [fixing, setFixing] = useState(false);
  const link = reporterUrl(base, room, u.n, u.name, u.loc);
  const wanted = viewerUrl(base, room, u.n);
  const chip = CHIP[state.link] ?? CHIP["offline"]!;

  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream, watch]);

  // What OBS actually loads for this unit, compared with what it should load.
  useEffect(() => {
    if (!connected || cam < 0) {
      setObsUrl(undefined);
      return;
    }
    let alive = true;
    void engine.getFieldUrl(u.n).then((x) => alive && setObsUrl(x));
    return () => {
      alive = false;
    };
  }, [connected, cam, u.n, wanted]);
  const obsWrong = obsUrl !== undefined && obsUrl !== wanted;
  const fixObs = async () => {
    setFixing(true);
    try {
      await engine.setFieldUrl(u.n, wanted);
      setObsUrl(wanted);
    } catch {
      /* the button stays, try again */
    } finally {
      setFixing(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link", link);
    }
  };
  const share = async () => {
    const text = `${u.name ? `${u.name}, ` : ""}open this link to go live${u.loc ? ` from ${u.loc}` : ""}: ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        /* cancelled: fall through to WhatsApp */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  return (
    <div className="mk-panel grid gap-2 rounded-md p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mk-button rounded-[3px] px-2 py-1 font-mono text-[11px]">FIELD {u.n}</span>
        <span className={cn("rounded-[3px] px-2 py-1 font-mono text-[10px]", chip.cls)}>{chip.text}</span>
        {state.link !== "offline" && state.link !== "connecting" && (
          <span className="mk-button rounded-[3px] px-2 py-1 font-mono text-[10px]">
            {state.orient === "portrait" ? "PORTRAIT 9:16" : "LANDSCAPE 16:9"}
          </span>
        )}
        {online && state.battery && (
          <span className={cn("mk-button rounded-[3px] px-2 py-1 font-mono text-[10px]", state.battery.level < 20 && !state.battery.charging && "mk-lit-amber")} title="The reporter's phone battery">
            BATT {state.battery.level}%{state.battery.charging ? " CHG" : ""}
          </span>
        )}
        {state.link === "live" && (
          <span className="relative h-2 w-20 overflow-hidden rounded bg-black/40" role="meter" aria-label="Reporter mic level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.level * 100)} title="The reporter's mic level">
            <span className="absolute inset-y-0 left-0 bg-emerald-400" style={{ width: `${Math.min(100, state.level * 140)}%` }} />
          </span>
        )}
        {cam >= 0 ? (
          <span className="mk-button rounded-[3px] px-2 py-1 font-mono text-[11px]">on {camLabel(cam)}</span>
        ) : (
          <button type="button" disabled={!connected} className={cn(btn, "h-7")} onClick={onAdd}>
            Add to switcher
          </button>
        )}
        <button
          type="button"
          className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => confirm(`Remove FIELD ${u.n}? (The OBS scene stays; delete it in OBS if you want it gone.)`) && fieldUnits.remove(u.n)}
        >
          Remove
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={u.name} onChange={(e) => fieldUnits.update(u.n, { name: e.target.value })} placeholder="Name" maxLength={30} className={cn(input, "w-40 flex-1")} />
        <input value={u.loc} onChange={(e) => fieldUnits.update(u.n, { loc: e.target.value })} placeholder="Location" maxLength={50} className={cn(input, "w-56 flex-[2]")} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => void share()}>
          Send link
        </button>
        <button type="button" className={btn} onClick={() => void copy()}>
          {copied ? "Copied" : "Copy link"}
        </button>
        <button type="button" className={btn} onClick={onQr}>
          QR
        </button>
        <button type="button" className={cn(btn, watch && "mk-lit-preview")} onClick={() => setWatch((w) => !w)} title="Watch the feed here (uses the reporter's data)">
          {watch ? "Hide monitor" : "Monitor"}
        </button>
        {cam >= 0 && (
          <>
            <button type="button" className={btn} onClick={() => void engine.selectPreview(cam)}>
              PREVIEW
            </button>
            <button type="button" className={cn(btn, "font-bold")} onClick={() => void engine.selectProgram(cam)}>
              TAKE
            </button>
          </>
        )}
      </div>

      <div className="grid gap-2 rounded-[3px] border border-white/10 p-2">
        <span className="mk-label text-[9px]">PICTURE (the director controls the reporter's phone)</span>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["portrait", "PORTRAIT 9:16", "Phone default"],
              ["landscape", "LANDSCAPE 16:9", "Forces the phone sideways"],
            ] as const
          ).map(([id, label, hint]) => (
            <button
              key={id}
              type="button"
              aria-pressed={wantOrient === id}
              className={cn("mk-button flex h-12 flex-col items-center justify-center rounded-[3px] px-2 text-[11px]", wantOrient === id && "mk-lit-preview")}
              onClick={() => pick({ orient: id })}
            >
              <span className="font-bold tracking-[0.1em]">{label}</span>
              <span className="font-mono text-[9px] opacity-70">{hint}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="grid gap-1">
            <span className="mk-label text-[9px]">RESOLUTION</span>
            <select value={wantRes} onChange={(e) => pick({ res: e.target.value })} className={cn(input, "w-full")}>
              {FIELD_QUALITY.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="mk-label text-[9px]">FRAME RATE</span>
            <select value={wantFps} onChange={(e) => pick({ fps: Number(e.target.value) })} className={cn(input, "w-full")}>
              {FIELD_FPS.map((f) => (
                <option key={f} value={f}>
                  {f} fps
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="mk-label text-[9px]">BITRATE</span>
            <select value={wantKbps} onChange={(e) => pick({ kbps: Number(e.target.value) })} className={cn(input, "w-full")}>
              {FIELD_KBPS.map((k) => (
                <option key={k} value={k}>
                  {k === 0 ? `Auto · ${(fieldKbps(wantRes, wantFps) / 1000).toFixed(1)} Mbps` : `${k / 1000} Mbps`}
                </option>
              ))}
            </select>
          </label>
        </div>
        {online && state.quality && (
          <span className="font-mono text-[10px] text-muted-foreground">
            Reporter sending: {sendingShort}
            {state.fps > 0 ? ` · ${state.fps} fps` : ""}
            {state.kbps > 0 ? ` · ${(state.kbps / 1000).toFixed(1)} Mbps` : ""} · {state.orient === "portrait" ? "portrait" : "landscape"}
          </span>
        )}
        {online && state.held && state.held !== state.orient && (
          <span className="font-mono text-[10px] text-amber-400">
            The phone is held {state.held === "portrait" ? "upright" : "sideways"}. The reporter has been asked to {state.orient === "landscape" ? "turn it sideways" : "hold it upright"}.
          </span>
        )}
      </div>

      <FieldReturnPanel online={online} talking={state.talking} ack={state.ack} onCue={cue} onTalk={talk} />

      <FieldCameraPanel caps={state.caps} ctl={ctlNow} online={online} onChange={pickCtl} />

      <div className="grid gap-2 rounded-[3px] border border-white/10 p-2">
        <div className="grid gap-1">
          <span className="mk-label text-[9px]">AUDIO</span>
          <button
            type="button"
            disabled={!connected || cam < 0}
            className={cn(btn, "w-full", always && "mk-lit-preview")}
            onClick={() => void engine.setFieldAudioAlways(u.n, !always)}
            title="OWN FADER: this unit has its own strip in the Audio mixer and in OBS (the feed is kept active in every scene, off canvas). GLOBAL: sound plays out of the PC and is only heard through Desktop Audio, with no fader of its own."
          >
            {always ? "OWN FADER · own strip in the Audio mixer" : "GLOBAL · no fader of its own (tap for own fader)"}
          </button>
          {strip && (
            <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
              Also on track
              {[3, 4, 5, 6].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={cn(btn, "h-6 px-2", strip.tracks?.[t - 1] && "mk-lit-preview")}
                  onClick={() => void engine.toggleAudioTrack(inputName, t)}
                  title={`Record this unit's sound alone on OBS audio track ${t}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {watch && (
        <div className="relative overflow-hidden rounded bg-black">
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            className={cn(
              "object-contain",
              state.orient === "portrait" ? "mx-auto block aspect-[9/16] h-80 w-auto max-w-full" : "aspect-video w-full",
            )}
          />
          {!stream && (
            <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-white/60">
              {state.link === "live" ? "Connecting the picture…" : "Waiting for the reporter to go live"}
            </span>
          )}
        </div>
      )}
      {cam >= 0 && obsUrl !== undefined && (
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
          {obsWrong ? (
            <>
              <span className="text-amber-400">The OBS source loads a different link, so it will be black on air.</span>
              <button type="button" disabled={fixing} className={cn(btn, "h-7 mk-lit-amber")} onClick={() => void fixObs()}>
                {fixing ? "Fixing…" : "Fix OBS link"}
              </button>
            </>
          ) : (
            <span className="text-muted-foreground">
              OBS link OK · full HD{state.orient === "portrait" ? " · tall picture sits centred in the frame" : ""}
            </span>
          )}
        </div>
      )}
      {state.error && <p className="font-mono text-[10px] text-amber-400">{state.error}</p>}
    </div>
  );
}

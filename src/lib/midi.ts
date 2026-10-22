import { useEffect, useRef, useState } from "react";

export type MidiInfo = { id: string; name: string };
export type MidiStatus = "off" | "unsupported" | "denied" | "ready";

// Listens for control-change messages from one MIDI input (or all inputs when inputId is empty).
export function useMidi(on: boolean, inputId: string, onCc: (cc: number, value: number) => void) {
  const [inputs, setInputs] = useState<MidiInfo[]>([]);
  const [status, setStatus] = useState<MidiStatus>("off");
  const cb = useRef(onCc);
  cb.current = onCc;

  useEffect(() => {
    if (!on) { setStatus("off"); return; }
    if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) { setStatus("unsupported"); return; }
    let access: MIDIAccess | null = null;
    let cancelled = false;
    const handler = (e: MIDIMessageEvent) => {
      const d = e.data;
      if (!d || d.length < 3) return;
      if (((d[0] ?? 0) & 0xf0) === 0xb0) cb.current(d[1] ?? 0, d[2] ?? 0);
    };
    const attach = () => {
      if (!access) return;
      const list: MidiInfo[] = [];
      access.inputs.forEach((inp) => {
        list.push({ id: inp.id, name: inp.name || "MIDI input" });
        inp.onmidimessage = !inputId || inp.id === inputId ? handler : null;
      });
      setInputs(list);
    };
    navigator.requestMIDIAccess().then((a) => {
      if (cancelled) return;
      access = a; a.onstatechange = attach; attach(); setStatus("ready");
    }).catch(() => { if (!cancelled) setStatus("denied"); });
    return () => {
      cancelled = true;
      if (access) { access.onstatechange = null; access.inputs.forEach((inp) => { inp.onmidimessage = null; }); }
    };
  }, [on, inputId]);

  return { inputs, status };
}

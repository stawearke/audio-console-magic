import { useEffect, useRef, useState } from "react";

import { AlertGate, alertRank, type AirAlert } from "./field-health";

/** The director's on-air alert: a debounced hook for the unit card and the optional beep. */

/** Debounced alert for one unit: pass the raw condition (`airAlertOf`), get what to show. Re-checks twice a second. */
export function useAirAlert(raw: AirAlert | null): AirAlert | null {
  const gate = useRef(new AlertGate());
  const rawNow = useRef(raw);
  rawNow.current = raw;
  const [shown, setShown] = useState<AirAlert | null>(null);
  useEffect(() => {
    const tick = () => setShown(gate.current.feed(rawNow.current, performance.now()));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, []);
  return shown;
}

/** Beep when the alert starts or gets worse (poor -> bad -> not sending), never repeatedly, and only if switched on. */
export function useAlertBeep(alert: AirAlert | null, enabled: boolean) {
  const prev = useRef<AirAlert | null>(null);
  useEffect(() => {
    if (enabled && alertRank(alert) > alertRank(prev.current)) playAlertBeep(alert as AirAlert);
    prev.current = alert;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert]);
}

let ctx: AudioContext | null = null;

/** One low beep for a weak signal, three sharp ones for bad or not sending. Silent if the browser has no audio or has not allowed it yet. */
export function playAlertBeep(kind: AirAlert) {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    ctx ??= new Ctx();
    void ctx.resume();
    const tones = kind === "poor" ? [660] : [880, 660, 880];
    tones.forEach((hz, i) => {
      const t = ctx!.currentTime + i * 0.24;
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      osc.connect(gain);
      gain.connect(ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch {
    /* no sound is better than an error */
  }
}

const SOUND_KEY = "mk-field-alert-sound";

/** On unless the director switched it off. */
export function loadAlertSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveAlertSound(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

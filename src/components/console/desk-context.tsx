import { createContext, useContext } from "react";
import type { AudioEngine } from "@/lib/audio-engine";
import type { Channel, Dca, Desk, Dsp, Fx, Group, Master, Mixer, SourceKind } from "@/lib/mixer-state";
import type { MidiInfo, MidiStatus } from "@/lib/midi";
import type { ScenesApi } from "@/lib/scenes";

export type View = "mixer" | "mixer2" | "channel" | "fx" | "show" | "patch" | "setup" | "speakers" | "obs" | "obsch" | "obsgrp" | "obspatch" | "obsshow";

export type DeskApi = {
  mixer: Mixer;
  setMixer: (f: (m: Mixer) => Mixer) => void;
  getEngine: () => AudioEngine;
  selected: string[];
  primary: Channel;
  select: (id: string, additive?: boolean) => void;
  view: View; setView: (v: View) => void;
  active: Record<string, boolean>;
  files: Record<string, string>;
  inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[];
  programOut: string; monitorOut: string;
  setProgramOut: (id: string) => void; setMonitorOut: (id: string) => void;
  patch: (id: string, p: Partial<Channel>) => void;
  patchDsp: <K extends keyof Dsp>(id: string, key: K, p: Partial<Dsp[K]>) => void;
  patchGroup: (id: Group["id"], p: Partial<Group>) => void;
  patchMaster: (p: Partial<Master>) => void;
  patchFx: <K extends keyof Fx>(key: K, p: Partial<Fx[K]>) => void;
  patchDesk: (p: Partial<Desk>) => void;
  setSend: (id: string, aux: number, db: number) => void;
  toggleSource: (id: string) => Promise<void>;
  loadFile: (id: string, file?: File) => Promise<void>;
  addChannel: (kind: SourceKind) => void;
  removeChannel: (id: string) => void;
  clearSolo: () => void; clearPfl: () => void;
  fail: (e: unknown) => void;
  bank: number; setBank: (n: number) => void;
  midiLearn: string | null; setMidiLearn: (k: string | null) => void;
  midiInputs: MidiInfo[]; midiStatus: MidiStatus;
  recording: boolean; seconds: number; toggleRecord: () => Promise<void>;
  scenes: ScenesApi; applyMixer: (m: Mixer) => void;
  patchDca: (i: number, p: Partial<Dca>) => void;
  toggleMuteGroup: (i: number) => void;
  copyDsp: (id: string) => void; pasteDsp: () => void; canPaste: boolean;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
  pads: { name: string; loaded: boolean }[]; padChannel: string; setPadChannel: (id: string) => void;
  loadPad: (i: number, file?: File) => Promise<void>; firePad: (i: number) => Promise<void>; stopPads: () => void;
};

export const DeskContext = createContext<DeskApi | null>(null);
export function useDesk() {
  const d = useContext(DeskContext);
  if (!d) throw new Error("useDesk must be used inside the console.");
  return d;
}

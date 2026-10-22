// One-click voice chains for OBS inputs. They start from VOXONE's own voice settings (so the numbers match
// what you know from VOXONE) and keep only what OBS's native filters can do: denoise, gate, compressor.
import { flatDsp, voiceDsp } from "@/lib/mixer-state";
import { voiceFromDsp, type ObsVoice } from "@/lib/mk/obs-voice";

const copy = (v: ObsVoice): ObsVoice => JSON.parse(JSON.stringify(v)) as ObsVoice;
const base = () => voiceFromDsp(voiceDsp());

const PRESETS: Record<string, () => ObsVoice> = {
  "Broadcast Voice": () => ({ ...base(), denoise: { on: true } }),
  "Noisy Room": () => ({ ...base(), denoise: { on: true }, gate: { on: true, threshold: -42, attack: 2, release: 120 } }),
  "Radio DJ": () => ({ ...base(), comp: { on: true, threshold: -28, ratio: 6, attack: 5, release: 150, makeup: 8 } }),
  Flat: () => voiceFromDsp(flatDsp()),
};

export const OBS_VOICE_PRESET_NAMES = Object.keys(PRESETS);

/** A fresh copy of the named preset (never shared), or null for an unknown name. */
export function obsVoicePreset(name: string): ObsVoice | null {
  const make = PRESETS[name];
  return make ? copy(make()) : null;
}

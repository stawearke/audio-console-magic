// Clip warning: pure rules. OBS reports each input's post-fader peak (dB) about 15 times a second, so a peak
// within 1 dB of full scale counts as clipping, and the lamp stays lit a few seconds so a short spike is seen.
export const CLIP_DB = -1;
export const CLIP_HOLD_MS = 3000;

/** The time until which the lamp stays lit, given a new peak reading. A quiet reading never shortens it. */
export function nextClipUntil(level: number, now: number, until: number): number {
  return Number.isFinite(level) && level >= CLIP_DB ? now + CLIP_HOLD_MS : until;
}

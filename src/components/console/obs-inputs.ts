import { useMemo } from "react";
import { useSwitcher } from "@/lib/mk/use-switcher";

/** The OBS inputs the desk works on: same rule as MK VISION (no MK helper sources, nothing hidden there). */
export function useObsInputs() {
  const state = useSwitcher();
  const hidden = state.config.hiddenAudio;
  const inputs = useMemo(() => state.audio.filter((c) => !/^MK /i.test(c.name) && !hidden.includes(c.name)), [state.audio, hidden]);
  return { state, inputs, connected: state.status === "connected" };
}

// Extra stream destinations, run by the app (they share the main stream's encoders). Only inside MK VISION Studio.
import { nativeCall } from "./native";

export type TargetState = "idle" | "connecting" | "live" | "reconnecting" | "failed";

export interface MultistreamTarget {
  id: string;
  name: string;
  server: string;
  hasKey: boolean;
  keyHint: string;
  enabled: boolean;
  state: TargetState;
  kbps: number;
  dropped: number;
  congestion: number;
  seconds: number;
  error: string;
}

export interface MultistreamInfo {
  mainLive: boolean;
  targets: MultistreamTarget[];
  max: number;
  error?: string;
}

export interface TargetInput {
  id?: string | undefined;
  name: string;
  server: string;
  key: string;
  enabled: boolean;
}

export const SERVER_PRESETS = [
  { label: "YouTube", name: "YouTube", server: "rtmp://a.rtmp.youtube.com/live2" },
  { label: "Facebook", name: "Facebook", server: "rtmps://live-api-s.facebook.com:443/rtmp/" },
  { label: "Twitch", name: "Twitch", server: "rtmp://live.twitch.tv/app" },
];

export const loadMultistream = () => nativeCall<MultistreamInfo>("multistream");
export const saveMultistream = (targets: TargetInput[]) =>
  nativeCall<MultistreamInfo>("multistream-save", { targets });
export const startMultistream = (id?: string) =>
  nativeCall<MultistreamInfo>("multistream-start", { id: id ?? "" });
export const stopMultistream = (id?: string) =>
  nativeCall<MultistreamInfo>("multistream-stop", { id: id ?? "" });

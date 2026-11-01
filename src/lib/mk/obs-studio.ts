// Scenes & Sources manager client. Own OBS WebSocket 5.x connection (same host/port/password
// as the switcher), so the /studio page works on its own. Browser-only.
import OBSWebSocket from "obs-websocket-js";

import { loadConfig } from "./config";

export interface StudioItem {
  id: number;
  source: string;
  kind: string;
  enabled: boolean;
}

export interface SourcePreset {
  id: string;
  label: string;
  kind: string;
  /** Setting that holds the device / window / file / url / text, if any. */
  prop?: string;
  /** "list" = pick from OBS's own list, "text" = type it in. */
  mode?: "list" | "text";
}

/** What the "Add source" bar offers. Only kinds this OBS actually has are shown. */
export const PRESETS: SourcePreset[] = [
  {
    id: "camera",
    label: "Camera / capture card",
    kind: "dshow_input",
    prop: "video_device_id",
    mode: "list",
  },
  { id: "mic", label: "Microphone", kind: "wasapi_input_capture", prop: "device_id", mode: "list" },
  {
    id: "desktop-audio",
    label: "Desktop audio",
    kind: "wasapi_output_capture",
    prop: "device_id",
    mode: "list",
  },
  {
    id: "screen",
    label: "Screen capture",
    kind: "monitor_capture",
    prop: "monitor_id",
    mode: "list",
  },
  { id: "window", label: "Window capture", kind: "window_capture", prop: "window", mode: "list" },
  { id: "browser", label: "Browser / web page", kind: "browser_source", prop: "url", mode: "text" },
  {
    id: "media",
    label: "Video / media file",
    kind: "ffmpeg_source",
    prop: "local_file",
    mode: "text",
  },
  { id: "image", label: "Image", kind: "image_source", prop: "file", mode: "text" },
  { id: "text", label: "Text", kind: "text_gdiplus", prop: "text", mode: "text" },
  { id: "color", label: "Colour", kind: "color_source_v3" },
];

export const presetForKind = (kind: string) => PRESETS.find((p) => p.kind === kind);

export interface DeviceOption {
  name: string;
  value: string;
}

export class StudioClient {
  private obs = new OBSWebSocket();
  private connected = false;
  onClose?: () => void;

  async connect() {
    const { host, port, password } = loadConfig();
    if (!host)
      throw new Error("No OBS host set. Open Settings and enter the OBS WebSocket details.");
    this.obs.on("ConnectionClosed", () => {
      this.connected = false;
      this.onClose?.();
    });
    await this.obs.connect(`ws://${host}:${port}`, password || undefined);
    this.connected = true;
  }

  async disconnect() {
    this.obs.removeAllListeners();
    await this.obs.disconnect().catch(() => {});
    this.connected = false;
  }

  get isConnected() {
    return this.connected;
  }

  on(event: string, fn: () => void) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.obs as any).on(event, fn);
  }

  // ---- scenes
  async scenes(): Promise<{ names: string[]; program: string }> {
    const r = await this.obs.call("GetSceneList");
    const names = (r.scenes as { sceneName: string }[]).map((s) => s.sceneName).reverse();
    return { names, program: r.currentProgramSceneName };
  }
  createScene = (sceneName: string) => this.obs.call("CreateScene", { sceneName });
  renameScene = (sceneName: string, newSceneName: string) =>
    this.obs.call("SetSceneName", { sceneName, newSceneName });
  removeScene = (sceneName: string) => this.obs.call("RemoveScene", { sceneName });
  goLive = (sceneName: string) => this.obs.call("SetCurrentProgramScene", { sceneName });

  // ---- sources in a scene
  async items(sceneName: string): Promise<StudioItem[]> {
    const r = await this.obs.call("GetSceneItemList", { sceneName });
    return (
      r.sceneItems as unknown as {
        sceneItemId: number;
        sourceName: string;
        inputKind: string | null;
        sceneItemEnabled: boolean;
      }[]
    )
      .map((i) => ({
        id: i.sceneItemId,
        source: i.sourceName,
        kind: i.inputKind ?? "scene",
        enabled: i.sceneItemEnabled,
      }))
      .reverse();
  }
  setEnabled = (sceneName: string, sceneItemId: number, sceneItemEnabled: boolean) =>
    this.obs.call("SetSceneItemEnabled", { sceneName, sceneItemId, sceneItemEnabled });
  removeItem = (sceneName: string, sceneItemId: number) =>
    this.obs.call("RemoveSceneItem", { sceneName, sceneItemId });

  // ---- inputs
  async kinds(): Promise<string[]> {
    const r = await this.obs.call("GetInputKindList", { unversioned: true });
    return r.inputKinds as string[];
  }
  async inputs(): Promise<string[]> {
    const r = await this.obs.call("GetInputList");
    return (r.inputs as { inputName: string }[]).map((i) => i.inputName);
  }
  async createSource(sceneName: string, inputName: string, inputKind: string) {
    await this.obs.call("CreateInput", { sceneName, inputName, inputKind, sceneItemEnabled: true });
  }
  addExisting = (sceneName: string, sourceName: string) =>
    this.obs.call("CreateSceneItem", { sceneName, sourceName, sceneItemEnabled: true });

  async devices(inputName: string, propertyName: string): Promise<DeviceOption[]> {
    const r = await this.obs.call("GetInputPropertiesListPropertyItems", {
      inputName,
      propertyName,
    });
    return (r.propertyItems as { itemName: string; itemValue: unknown; itemEnabled: boolean }[])
      .filter((i) => i.itemEnabled !== false)
      .map((i) => ({ name: i.itemName, value: String(i.itemValue) }));
  }
  async setting(inputName: string, key: string): Promise<string> {
    const r = await this.obs.call("GetInputSettings", { inputName });
    const v = (r.inputSettings as Record<string, unknown>)[key];
    return v == null ? "" : String(v);
  }
  setSetting = (inputName: string, key: string, value: string) =>
    this.obs.call("SetInputSettings", {
      inputName,
      inputSettings: { [key]: value },
      overlay: true,
    });
}

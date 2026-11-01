// Stream & Record settings client (OBS WebSocket 5.x). Builds on the Studio client's connection.
import { StudioClient } from "./obs-studio";

export interface OutputStatus {
  streaming: boolean;
  recording: boolean;
  recordPaused: boolean;
  streamTime: string;
  recordTime: string;
}

export interface StreamDest {
  type: string;
  server: string;
  key: string;
  service: string;
}

export const SERVER_PRESETS = [
  { label: "YouTube", server: "rtmp://a.rtmp.youtube.com/live2" },
  { label: "Facebook", server: "rtmps://live-api-s.facebook.com:443/rtmp/" },
  { label: "Twitch", server: "rtmp://live.twitch.tv/app" },
];

export const REC_FORMATS = [
  { value: "mkv", label: "MKV (safest if OBS crashes)" },
  { value: "mp4", label: "MP4" },
  { value: "fragmented_mp4", label: "Fragmented MP4" },
  { value: "mov", label: "MOV" },
];

export const REC_QUALITIES = [
  { value: "Stream", label: "Same as stream" },
  { value: "Small", label: "High quality, medium file size" },
  { value: "HQ", label: "Indistinguishable quality, large file" },
  { value: "Lossless", label: "Lossless, huge file" },
];

export interface VideoSettings {
  baseWidth: number;
  baseHeight: number;
  outputWidth: number;
  outputHeight: number;
  fpsNumerator: number;
  fpsDenominator: number;
}

export const RESOLUTIONS = [
  { w: 3840, h: 2160, label: "3840×2160 (4K)" },
  { w: 2560, h: 1440, label: "2560×1440" },
  { w: 1920, h: 1080, label: "1920×1080 (Full HD)" },
  { w: 1600, h: 900, label: "1600×900" },
  { w: 1280, h: 720, label: "1280×720 (HD)" },
  { w: 854, h: 480, label: "854×480" },
  { w: 1080, h: 1920, label: "1080×1920 (vertical)" },
];

export const FRAME_RATES = [
  { n: 24, d: 1, label: "24" },
  { n: 25, d: 1, label: "25" },
  { n: 30, d: 1, label: "30" },
  { n: 30000, d: 1001, label: "29.97" },
  { n: 50, d: 1, label: "50" },
  { n: 60, d: 1, label: "60" },
  { n: 60000, d: 1001, label: "59.94" },
];

export const AUDIO_BITRATES = [96, 128, 160, 192, 256, 320];

export interface QualitySettings {
  mode: string;
  videoBitrate: string;
  audioBitrate: string;
  recFormat: string;
  recQuality: string;
}

export class OutputClient extends StudioClient {
  async status(): Promise<OutputStatus> {
    const [s, r] = await Promise.all([
      this.obs.call("GetStreamStatus"),
      this.obs.call("GetRecordStatus"),
    ]);
    return {
      streaming: s.outputActive,
      recording: r.outputActive,
      recordPaused: r.outputPaused,
      streamTime: s.outputActive ? (s.outputTimecode.split(".")[0] ?? "") : "",
      recordTime: r.outputActive ? (r.outputTimecode.split(".")[0] ?? "") : "",
    };
  }

  startStream = () => this.obs.call("StartStream");
  stopStream = () => this.obs.call("StopStream");
  startRecord = () => this.obs.call("StartRecord");
  stopRecord = () => this.obs.call("StopRecord");
  toggleRecordPause = () => this.obs.call("ToggleRecordPause");

  async dest(): Promise<StreamDest> {
    const r = await this.obs.call("GetStreamServiceSettings");
    const s = r.streamServiceSettings as Record<string, unknown>;
    return {
      type: r.streamServiceType,
      server: String(s["server"] ?? ""),
      key: String(s["key"] ?? ""),
      service: String(s["service"] ?? ""),
    };
  }

  /** Keeps the current service type (e.g. YouTube) unless `custom` asks for a plain RTMP destination. */
  async saveDest(d: StreamDest, custom: boolean) {
    if (custom || d.type === "rtmp_custom") {
      await this.obs.call("SetStreamServiceSettings", {
        streamServiceType: "rtmp_custom",
        streamServiceSettings: { server: d.server, key: d.key, use_auth: false },
      });
    } else {
      await this.obs.call("SetStreamServiceSettings", {
        streamServiceType: d.type,
        streamServiceSettings: { server: d.server, key: d.key },
      });
    }
  }

  private async param(category: string, name: string): Promise<string> {
    try {
      const r = await this.obs.call("GetProfileParameter", {
        parameterCategory: category,
        parameterName: name,
      });
      return r.parameterValue ?? r.defaultParameterValue ?? "";
    } catch {
      return "";
    }
  }
  private setParam = (category: string, name: string, value: string) =>
    this.obs.call("SetProfileParameter", {
      parameterCategory: category,
      parameterName: name,
      parameterValue: value,
    });

  async quality(): Promise<QualitySettings> {
    const mode = (await this.param("Output", "Mode")) || "Simple";
    const adv = mode === "Advanced";
    return {
      mode,
      videoBitrate: await this.param("SimpleOutput", "VBitrate"),
      audioBitrate: await this.param("SimpleOutput", "ABitrate"),
      recFormat: await this.param(adv ? "AdvOut" : "SimpleOutput", "RecFormat2"),
      recQuality: await this.param("SimpleOutput", "RecQuality"),
    };
  }

  async saveQuality(q: QualitySettings) {
    const adv = q.mode === "Advanced";
    if (!adv) {
      if (q.videoBitrate) await this.setParam("SimpleOutput", "VBitrate", q.videoBitrate);
      if (q.audioBitrate) await this.setParam("SimpleOutput", "ABitrate", q.audioBitrate);
      if (q.recQuality) await this.setParam("SimpleOutput", "RecQuality", q.recQuality);
    }
    if (q.recFormat)
      await this.setParam(adv ? "AdvOut" : "SimpleOutput", "RecFormat2", q.recFormat);
  }

  async video(): Promise<VideoSettings> {
    const r = await this.obs.call("GetVideoSettings");
    return {
      baseWidth: r.baseWidth,
      baseHeight: r.baseHeight,
      outputWidth: r.outputWidth,
      outputHeight: r.outputHeight,
      fpsNumerator: r.fpsNumerator,
      fpsDenominator: r.fpsDenominator,
    };
  }
  /** OBS refuses this while streaming, recording or running the virtual camera. */
  saveVideo = (v: VideoSettings) => this.obs.call("SetVideoSettings", { ...v });

  async recordFolder(): Promise<string> {
    const r = await this.obs.call("GetRecordDirectory");
    return r.recordDirectory;
  }
  setRecordFolder = (recordDirectory: string) =>
    this.obs.call("SetRecordDirectory", { recordDirectory });
}

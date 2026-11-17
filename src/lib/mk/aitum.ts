// Multistream through OBS: drives the free "Aitum Multistream" plugin over OBS WebSocket (vendor "aitum-multistream").
// Destinations (server + key) are added once inside Aitum; this panel starts / stops them and shows their state.
import { StudioClient } from "./obs-studio";

const VENDOR = "aitum-multistream";

export interface AitumOutput {
  name: string;
  vertical: boolean;
}

interface VendorEventPayload {
  vendorName: string;
  eventType: string;
  eventData: { name?: string };
}

export class AitumClient extends StudioClient {
  private async call<T>(requestType: string, requestData: Record<string, string> = {}): Promise<T> {
    const r = await this.obs.call("CallVendorRequest", {
      vendorName: VENDOR,
      requestType,
      requestData,
    });
    const d = r.responseData as { success?: boolean; error?: string } & T;
    if (d.success === false) throw new Error(d.error || "Aitum refused the request.");
    return d;
  }

  /** False when the plugin is not installed (OBS answers the vendor call with an error). */
  async available(): Promise<boolean> {
    try {
      await this.call("version");
      return true;
    } catch {
      return false;
    }
  }

  async outputs(): Promise<AitumOutput[]> {
    const d = await this.call<{ outputs?: AitumOutput[] }>("get_outputs");
    return d.outputs ?? [];
  }

  start = (name: string) => this.call("start_output", { name });
  stop = (name: string) => this.call("stop_output", { name });

  async mainLive(): Promise<boolean> {
    const s = await this.obs.call("GetStreamStatus");
    return s.outputActive;
  }

  /** Calls `fn(name, live)` whenever Aitum starts or stops one of its outputs. */
  onOutput(fn: (name: string, live: boolean) => void) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.obs as any).on("VendorEvent", (e: VendorEventPayload) => {
      if (e.vendorName !== VENDOR || !e.eventData?.name) return;
      if (e.eventType === "output_started") fn(e.eventData.name, true);
      else if (e.eventType === "output_stopped") fn(e.eventData.name, false);
    });
  }
}

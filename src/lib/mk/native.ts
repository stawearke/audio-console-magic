// Native bridge to MK VISION Studio (the app itself). Only exists inside the app: same-origin, loopback, token.
import { isEmbedded } from "./cloud";

let tokenCache = "";

async function getToken(): Promise<string> {
  if (tokenCache) return tokenCache;
  const r = await fetch("/mk-config.json", { cache: "no-store" });
  if (!r.ok) throw new Error("The app did not answer.");
  const c = (await r.json()) as { token?: string };
  if (!c.token) throw new Error("This app version has no native bridge.");
  tokenCache = c.token;
  return tokenCache;
}

/** GET (no body) or POST (JSON body) a bridge route. Throws when not inside the app or the app is too old. */
export async function nativeCall<T>(route: string, body?: unknown): Promise<T> {
  if (!isEmbedded()) throw new Error("Not inside MK VISION Studio.");
  const token = await getToken();
  const init: RequestInit = {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-MK-Token": token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    cache: "no-store",
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(`/mk-api/${route}`, init);
  if (!r.ok) throw new Error(`Native bridge error (${r.status}).`);
  return (await r.json()) as T;
}

let overlaysOk: boolean | null = null;

/** True when the app has the keyer-overlay channels (real downstream keyer). Cached. */
export async function nativeOverlaysAvailable(): Promise<boolean> {
  if (overlaysOk !== null) return overlaysOk;
  if (!isEmbedded()) return (overlaysOk = false);
  try {
    await nativeCall("overlays");
    overlaysOk = true;
  } catch {
    overlaysOk = false;
  }
  return overlaysOk;
}

/** Put a scene on an overlay channel (slot 1-3); an empty scene clears it. */
export async function setOverlay(slot: number, scene: string): Promise<void> {
  await nativeCall("overlay", { slot, scene });
}

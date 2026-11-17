// WHIP publisher (WebRTC ingest over HTTP). Works with the MediaMTX relay from audio-bridge/field.
export interface WhipTarget {
  server: string;
  path: string;
  user: string;
  pass: string;
}

const base = (t: WhipTarget) => t.server.replace(/\/+$/, "");
const auth = (t: WhipTarget): Record<string, string> =>
  t.user ? { Authorization: `Basic ${btoa(`${t.user}:${t.pass}`)}` } : {};

function iceDone(pc: RTCPeerConnection, ms = 3000): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(done, ms);
  });
}

/** Sends the offer, applies the answer, returns the session URL (used to stop it) or null. */
export async function whipStart(pc: RTCPeerConnection, t: WhipTarget): Promise<string | null> {
  const url = `${base(t)}/${encodeURIComponent(t.path)}/whip`;
  await pc.setLocalDescription(await pc.createOffer());
  await iceDone(pc);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/sdp", ...auth(t) },
    body: pc.localDescription?.sdp ?? "",
  });
  if (res.status === 401) throw new Error("Wrong user or password in the link.");
  if (!res.ok) throw new Error(`Relay refused the stream (${res.status}).`);
  const loc = res.headers.get("Location");
  await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
  return loc ? new URL(loc, url).toString() : null;
}

export async function whipStop(session: string | null, t: WhipTarget) {
  if (!session) return;
  await fetch(session, { method: "DELETE", headers: auth(t) }).catch(() => {});
}

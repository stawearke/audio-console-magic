// Supabase: accounts + roles, shared prompter scripts, and a copy of the shared setup (with history).
// Optional: with no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the app works exactly as before (no login).
// The live control of OBS never goes through here, only accounts and saved content.
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";

import { isRole, setAccountRole, type Role } from "./roles";
import { scripts, type Script, type ScriptCloud, type ScriptVersion } from "./scripts";
import { isSharedKey, type SharedKey } from "./shared";

const URL = (import.meta.env?.["VITE_SUPABASE_URL"] as string | undefined) ?? "";
const KEY = (import.meta.env?.["VITE_SUPABASE_ANON_KEY"] as string | undefined) ?? "";

export const cloudConfigured = () => URL !== "" && KEY !== "";

/** Pages that control the show need a login. Output / camera pages open inside OBS or on phones stay open. */
// /set-password is open because the invite / reset email link lands there before anyone is signed in.
const OPEN_PAGES = ["/login", "/set-password", "/prompter", "/output", "/cam"];
export const needsLogin = (path: string) =>
  !OPEN_PAGES.includes(path.length > 1 ? path.replace(/\/+$/, "") : path);

let client: SupabaseClient | null = null;
async function sb(): Promise<SupabaseClient | null> {
  if (!cloudConfigured() || typeof window === "undefined") return null;
  if (!client) {
    const { createClient } = await import("@supabase/supabase-js");
    client = createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  return client;
}

// ------------------------------------------------------------------ who is signed in

export interface Auth {
  /** False until the saved session has been checked (avoids a login-page flash). */
  ready: boolean;
  id: string | null;
  email: string | null;
  role: Role | null;
}
let auth: Auth = { ready: false, id: null, email: null, role: null };
const subs = new Set<() => void>();
const setAuth = (next: Auth) => {
  auth = next;
  subs.forEach((f) => f());
};

async function applySession(c: SupabaseClient, session: Session | null) {
  if (!session) {
    setAccountRole(null);
    void scripts.attachCloud(null);
    setAuth({ ready: true, id: null, email: null, role: null });
    return;
  }
  const { data } = await c
    .from("mk_profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();
  const role = isRole(data?.role) ? data.role : "prompter";
  setAccountRole(role);
  setAuth({ ready: true, id: session.user.id, email: session.user.email ?? null, role });
  if (role === "director" || role === "prompter")
    void scripts.attachCloud(scriptCloud(c, session.user.id)).catch(() => {});
  else void scripts.attachCloud(null);
}

let started = false;
/** Call once in the browser. */
export async function startAuth() {
  if (started || typeof window === "undefined") return;
  started = true;
  const c = await sb();
  if (!c) {
    setAuth({ ready: true, id: null, email: null, role: null });
    return;
  }
  const { data } = await c.auth.getSession();
  await applySession(c, data.session);
  c.auth.onAuthStateChange((_e, session) => {
    // Do not call Supabase inside this callback directly: hand off to the next tick.
    setTimeout(() => void applySession(c, session), 0);
  });
}

export function useAuth(): Auth {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => auth,
    () => auth,
  );
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const c = await sb();
  if (!c) return "Supabase is not set up for this site.";
  const { error } = await c.auth.signInWithPassword({ email, password });
  return error ? error.message : null;
}

/** Where invite and reset emails send people. Must be listed in Supabase -> Authentication -> URL Configuration. */
const passwordPageUrl = () => `${window.location.origin}/set-password`;

/** "Forgot password": emails a link to /set-password. Always answers the same, so nobody can probe which emails exist. */
export async function sendPasswordReset(email: string): Promise<string | null> {
  const c = await sb();
  if (!c) return "Supabase is not set up for this site.";
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: passwordPageUrl() });
  return error && /rate|limit|seconds/i.test(error.message) ? error.message : null;
}

/** Used on /set-password: the person arrived from an email link, so a session already exists. */
export async function setPassword(password: string): Promise<string | null> {
  const c = await sb();
  if (!c) return "Supabase is not set up for this site.";
  const { error } = await c.auth.updateUser({ password, data: { password_set: true } });
  return error ? error.message : null;
}

export async function signOut() {
  const c = await sb();
  await c?.auth.signOut();
}

// ------------------------------------------------------------------ crew (Director)

export interface CrewMember {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export async function listCrew(): Promise<CrewMember[]> {
  const c = await sb();
  if (!c) return [];
  const { data, error } = await c
    .from("mk_profiles")
    .select("id,email,display_name,role")
    .order("created_at");
  if (error || !data) return [];
  return data.map((r) => ({
    id: String(r.id),
    email: String(r.email ?? ""),
    name: String(r.display_name ?? ""),
    role: isRole(r.role) ? r.role : "prompter",
  }));
}

export async function setCrewRole(id: string, role: Role): Promise<string | null> {
  const c = await sb();
  if (!c) return "Not connected.";
  const { error } = await c.from("mk_profiles").update({ role }).eq("id", id);
  return error ? error.message : null;
}

/** A crew row with its invite state (from the crew-admin function). */
export interface CrewEntry extends CrewMember {
  /** "invited" = the email was sent but the person has not set a password yet. */
  status?: "active" | "invited";
}

export type CrewResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

/** Calls the Director-only `crew-admin` Edge Function (it holds the service key, the browser never does). */
async function crewCall<T>(body: Record<string, unknown>): Promise<CrewResult<T>> {
  const c = await sb();
  if (!c) return { ok: false, error: "Not connected." };
  const { data, error } = await c.functions.invoke("crew-admin", { body });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    return {
      ok: false,
      error:
        status === 404
          ? "The crew-admin function is not deployed yet. Run: npx supabase functions deploy crew-admin"
          : `Could not reach the crew service (${error.message}).`,
    };
  }
  const r = data as { ok?: boolean; error?: string } | null;
  if (!r || r.ok !== true) return { ok: false, error: r?.error ?? "Something went wrong." };
  return { ok: true, data: r as T };
}

export async function listCrewAdmin(): Promise<CrewResult<CrewEntry[]>> {
  const r = await crewCall<{ crew: unknown[] }>({ action: "list" });
  if (!r.ok) return r;
  const crew = (r.data.crew ?? []).map((row): CrewEntry => {
    const m = row as Record<string, unknown>;
    return {
      id: String(m["id"] ?? ""),
      email: String(m["email"] ?? ""),
      name: String(m["name"] ?? ""),
      role: isRole(m["role"]) ? m["role"] : "prompter",
      status: m["status"] === "invited" ? "invited" : "active",
    };
  });
  return { ok: true, data: crew };
}

/** Director: creates the account and emails the invite link. The person chooses their own password. */
export async function inviteCrew(p: {
  email: string;
  name: string;
  role: Role;
}): Promise<CrewResult> {
  const r = await crewCall({ action: "invite", ...p, redirectTo: passwordPageUrl() });
  return r.ok ? { ok: true, data: null } : r;
}

/** Director: new invite for someone who has not accepted yet, or a password-reset link for an active account. */
export async function resendCrew(id: string): Promise<CrewResult> {
  const r = await crewCall({ action: "send_link", id, redirectTo: passwordPageUrl() });
  return r.ok ? { ok: true, data: null } : r;
}

export async function removeCrew(id: string): Promise<CrewResult> {
  const r = await crewCall({ action: "remove", id });
  return r.ok ? { ok: true, data: null } : r;
}

// ------------------------------------------------------------------ prompter scripts

function scriptCloud(c: SupabaseClient, uid: string): ScriptCloud {
  return {
    async list() {
      const { data, error } = await c.from("mk_scripts").select("id,name,text,updated_at");
      if (error || !data) throw new Error(error?.message ?? "scripts unavailable");
      const ids = data.map((r) => String(r.id));
      const versions = new Map<string, ScriptVersion[]>();
      if (ids.length) {
        const v = await c
          .from("mk_script_versions")
          .select("script_id,text,saved_at")
          .in("script_id", ids)
          .order("saved_at", { ascending: false });
        for (const r of v.data ?? []) {
          const list = versions.get(String(r.script_id)) ?? [];
          if (list.length < 10)
            list.push({ at: Date.parse(String(r.saved_at)) || 0, text: String(r.text ?? "") });
          versions.set(String(r.script_id), list);
        }
      }
      return data.map((r): Script => ({
        id: String(r.id),
        name: String(r.name ?? "Untitled"),
        text: String(r.text ?? ""),
        updated: Date.parse(String(r.updated_at)) || 0,
        versions: versions.get(String(r.id)) ?? [],
      }));
    },
    async upsert(s) {
      const { error } = await c.from("mk_scripts").upsert({
        id: s.id,
        name: s.name,
        text: s.text,
        updated_at: new Date(s.updated || Date.now()).toISOString(),
        updated_by: uid,
      });
      if (error) throw new Error(error.message);
    },
    async remove(id) {
      const { error } = await c.from("mk_scripts").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}

// ------------------------------------------------------------------ shared setup copy

export interface CloudSetting {
  value: unknown;
  rev: number;
}

export const cloudSettings = {
  /** Keep a copy of what was just written to OBS. Best effort; the server also keeps the last 20 versions per key. */
  async push(items: { key: SharedKey; value: unknown; rev: number }[]) {
    if (!auth.id || !items.length) return;
    const c = await sb();
    if (!c) return;
    const now = new Date().toISOString();
    await c.from("mk_settings").upsert(
      items.map((i) => ({
        key: i.key,
        value: i.value as never,
        rev: i.rev,
        updated_by: auth.id,
        updated_at: now,
      })),
    );
  },
  /** What the cloud holds for these keys (used when OBS has nothing yet, e.g. a rebuilt OBS PC). */
  async pull(keys: readonly string[]): Promise<Partial<Record<SharedKey, CloudSetting>>> {
    const out: Partial<Record<SharedKey, CloudSetting>> = {};
    if (!auth.id || !keys.length) return out;
    const c = await sb();
    if (!c) return out;
    const { data } = await c
      .from("mk_settings")
      .select("key,value,rev")
      .in("key", [...keys]);
    for (const r of data ?? [])
      if (isSharedKey(String(r.key)))
        out[r.key as SharedKey] = { value: r.value, rev: Number(r.rev) || 0 };
    return out;
  },
};

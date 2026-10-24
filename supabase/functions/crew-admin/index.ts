// crew-admin: account management for MK VISION studios.
// DIRECTOR (own studio only):
//   list       -> people in the studio, and whether they have accepted their invite
//   invite     -> creates the account in the studio and EMAILS a link; the person chooses their own password
//   send_link  -> new invite (not accepted yet) or password-reset link (active account)
//   remove     -> deletes the account
// OWNER (platform owner, set in Supabase):
//   studios_list / studio_create / studio_set_active
// Supabase gives this function the service key automatically (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
// The browser never sees that key. Every call is checked on the server: who is signed in, which studio, which role.
import { createClient } from "npm:@supabase/supabase-js@2";

const ROLES = ["director", "graphics", "sound", "prompter"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const fail = (error: string) => reply({ ok: false, error });

const friendly = (msg: string) => {
  if (/already (been )?registered|already exists/i.test(msg)) return "That email already has an account.";
  if (/rate limit|too many|seconds/i.test(msg))
    return "Too many emails sent. Wait a minute, or set up custom SMTP in Supabase (Authentication -> SMTP).";
  return msg;
};
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only.");

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Who is calling?
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: who, error: whoErr } = await admin.auth.getUser(token);
    if (whoErr || !who.user) return fail("Sign in again, then retry.");
    const me = who.user;
    const { data: mine } = await admin
      .from("mk_profiles")
      .select("role,studio_id,is_owner")
      .eq("id", me.id)
      .maybeSingle();
    const isOwner = mine?.is_owner === true;
    const isDirector = mine?.role === "director";

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const redirectTo = typeof body.redirectTo === "string" ? body.redirectTo : undefined;

    // ------------------------------------------------------------ owner actions
    if (action.startsWith("studio")) {
      if (!isOwner) return fail("Only the platform owner can do this.");

      if (action === "studios_list") {
        const [{ data: studios, error: se }, { data: profs, error: pe }] = await Promise.all([
          admin.from("mk_studios").select("id,name,active,created_at").order("created_at"),
          admin.from("mk_profiles").select("email,role,studio_id"),
        ]);
        if (se || pe) return fail((se ?? pe)!.message);
        return reply({
          ok: true,
          studios: (studios ?? []).map((s: Row) => {
            const people = (profs ?? []).filter((p: Row) => p.studio_id === s.id);
            return {
              id: s.id,
              name: s.name,
              active: s.active,
              members: people.length,
              directors: people.filter((p: Row) => p.role === "director").map((p: Row) => p.email),
            };
          }),
        });
      }

      if (action === "studio_create") {
        const name = String(body.name ?? "").trim().slice(0, 80);
        const email = String(body.directorEmail ?? "").trim().toLowerCase();
        const dname = String(body.directorName ?? "").trim().slice(0, 80) || email.split("@")[0];
        if (!name) return fail("Enter the studio name.");
        if (!validEmail(email)) return fail("Enter a valid Director email.");

        const { data: st, error: stErr } = await admin
          .from("mk_studios")
          .insert({ name })
          .select("id")
          .single();
        if (stErr) return fail(/duplicate|unique/i.test(stErr.message) ? "A studio with that name already exists." : stErr.message);

        const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo,
          data: { display_name: dname },
        });
        if (error) {
          await admin.from("mk_studios").delete().eq("id", st.id); // nothing half-made is left behind
          return fail(friendly(error.message));
        }
        const { error: upErr } = await admin
          .from("mk_profiles")
          .upsert(
            { id: data.user.id, email, display_name: dname, role: "director", studio_id: st.id },
            { onConflict: "id" },
          );
        if (upErr) return fail(`Studio created and invite sent, but the Director could not be saved: ${upErr.message}`);
        return reply({ ok: true });
      }

      if (action === "studio_set_active") {
        const id = String(body.id ?? "");
        if (typeof body.active !== "boolean") return fail("Missing on/off.");
        const { error } = await admin.from("mk_studios").update({ active: body.active }).eq("id", id);
        return error ? fail(error.message) : reply({ ok: true });
      }

      return fail("Unknown action.");
    }

    // ------------------------------------------------------------ director actions (own studio only)
    if (!isOwner && !isDirector) return fail("Only a Director can manage the crew.");
    const scope = isOwner && typeof body.studioId === "string" ? body.studioId : mine?.studio_id;
    if (!scope) return fail("No studio is set for your account.");
    if (!isOwner) {
      const { data: st } = await admin.from("mk_studios").select("active").eq("id", scope).maybeSingle();
      if (!st?.active) return fail("Your studio is switched off. Contact the owner.");
    }
    // The person being changed must be in this studio, and a Director can never touch the owner.
    const target = async (id: string) => {
      const { data } = await admin.from("mk_profiles").select("studio_id,is_owner").eq("id", id).maybeSingle();
      if (!data || data.studio_id !== scope) return "That person is not in your studio.";
      if (data.is_owner && !isOwner) return "The owner account cannot be changed by a Director.";
      return null;
    };

    // ------------------------------------------------------------ list
    if (action === "list") {
      const { data: profiles, error } = await admin
        .from("mk_profiles")
        .select("id,email,display_name,role,created_at")
        .eq("studio_id", scope)
        .order("created_at");
      if (error) return fail(error.message);

      const pending = new Set<string>();
      for (let page = 1; page <= 10; page++) {
        const { data, error: e } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (e) return fail(e.message);
        for (const u of data.users) {
          if (u.invited_at && !(u.user_metadata as Record<string, unknown>)?.password_set) pending.add(u.id);
        }
        if (data.users.length < 200) break;
      }
      return reply({
        ok: true,
        crew: (profiles ?? []).map((p: Row) => ({
          id: p.id,
          email: p.email ?? "",
          name: p.display_name ?? "",
          role: p.role,
          status: pending.has(p.id) ? "invited" : "active",
        })),
      });
    }

    // ------------------------------------------------------------ invite
    if (action === "invite") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const role = String(body.role ?? "");
      const name = String(body.name ?? "").trim().slice(0, 80) || email.split("@")[0];
      if (!validEmail(email)) return fail("Enter a valid email address.");
      if (!ROLES.includes(role)) return fail("Pick a desk for this person.");

      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { display_name: name },
      });
      if (error) return fail(friendly(error.message));

      const { error: upErr } = await admin
        .from("mk_profiles")
        .upsert({ id: data.user.id, email, display_name: name, role, studio_id: scope }, { onConflict: "id" });
      if (upErr) return fail(`Invite sent, but the desk could not be saved: ${upErr.message}`);
      return reply({ ok: true });
    }

    // ------------------------------------------------------------ send_link
    if (action === "send_link") {
      const id = String(body.id ?? "");
      const denied = await target(id);
      if (denied) return fail(denied);
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data.user?.email) return fail("Account not found.");
      const u = data.user;
      if (!u.email_confirmed_at) {
        const { error: e } = await admin.auth.admin.inviteUserByEmail(u.email!, {
          redirectTo,
          data: u.user_metadata ?? {},
        });
        return e ? fail(friendly(e.message)) : reply({ ok: true });
      }
      const { error: e } = await admin.auth.resetPasswordForEmail(u.email!, { redirectTo });
      return e ? fail(friendly(e.message)) : reply({ ok: true });
    }

    // ------------------------------------------------------------ remove
    if (action === "remove") {
      const id = String(body.id ?? "");
      if (id === me.id) return fail("You cannot remove your own account.");
      const denied = await target(id);
      if (denied) return fail(denied);
      const { error } = await admin.auth.admin.deleteUser(id);
      return error ? fail(error.message) : reply({ ok: true });
    }

    return fail("Unknown action.");
  } catch (e) {
    return reply({ ok: false, error: e instanceof Error ? e.message : "Unexpected error." });
  }
});

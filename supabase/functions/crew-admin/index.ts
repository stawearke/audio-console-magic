// crew-admin: Director-only account management for MK VISION.
//   list       -> everyone with a desk, plus whether they have accepted their invite
//   invite     -> creates the account and EMAILS a link; the person chooses their own password
//   send_link  -> new invite (not accepted yet) or password-reset link (active account)
//   remove     -> deletes the account
// Supabase gives this function the service key automatically (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
// The browser never sees that key. Every call is checked: signed in AND role = director.
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only.");

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Who is calling, and are they a Director?
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: who, error: whoErr } = await admin.auth.getUser(token);
    if (whoErr || !who.user) return fail("Sign in again, then retry.");
    const me = who.user;
    const { data: mine } = await admin.from("mk_profiles").select("role").eq("id", me.id).maybeSingle();
    if (mine?.role !== "director") return fail("Only a Director can manage the crew.");

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const redirectTo = typeof body.redirectTo === "string" ? body.redirectTo : undefined;

    // ------------------------------------------------------------ list
    if (action === "list") {
      const { data: profiles, error } = await admin
        .from("mk_profiles")
        .select("id,email,display_name,role,created_at")
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
        crew: (profiles ?? []).map((p) => ({
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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address.");
      if (!ROLES.includes(role)) return fail("Pick a desk for this person.");

      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { display_name: name },
      });
      if (error) return fail(friendly(error.message));

      // The sign-up trigger already made the profile as "prompter"; give them the desk the Director chose.
      const { error: upErr } = await admin
        .from("mk_profiles")
        .upsert({ id: data.user.id, email, display_name: name, role }, { onConflict: "id" });
      if (upErr) return fail(`Invite sent, but the desk could not be saved: ${upErr.message}`);
      return reply({ ok: true });
    }

    // ------------------------------------------------------------ send_link
    if (action === "send_link") {
      const id = String(body.id ?? "");
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data.user?.email) return fail("Account not found.");
      const u = data.user;
      if (!u.email_confirmed_at) {
        // Never accepted: send a fresh invite.
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
      const { error } = await admin.auth.admin.deleteUser(id);
      return error ? fail(error.message) : reply({ ok: true });
    }

    return fail("Unknown action.");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unexpected error.");
  }
});

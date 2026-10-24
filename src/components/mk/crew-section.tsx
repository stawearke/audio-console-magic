import { useCallback, useEffect, useState } from "react";

import {
  cloudConfigured,
  inviteCrew,
  listCrew,
  listCrewAdmin,
  removeCrew,
  resendCrew,
  setCrewRole,
  useAuth,
  type CrewEntry,
} from "@/lib/mk/cloud";
import { ROLES, ROLE_LABEL, isRole, type Role } from "@/lib/mk/roles";

/** Director only: invite people by email, choose their desk, resend links, remove accounts. */
export function CrewList() {
  const auth = useAuth();
  const [crew, setCrew] = useState<CrewEntry[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("prompter");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    const r = await listCrewAdmin();
    if (r.ok) {
      setCrew(r.data);
      return;
    }
    // The crew-admin function is not reachable: still show who exists so desks can be changed.
    setMsg(r.error);
    setCrew((await listCrew()).map((m) => ({ ...m })));
  }, []);

  useEffect(() => {
    if (auth.role === "director") void load();
  }, [auth.role, load]);

  if (!cloudConfigured())
    return (
      <p className="text-xs text-engrave">
        Accounts are not set up for this site yet (no Supabase keys).
      </p>
    );
  if (auth.role !== "director")
    return (
      <p className="text-xs text-engrave">Sign in with a Director account to manage the crew.</p>
    );

  const invite = async () => {
    setInviting(true);
    setMsg("");
    const to = email.trim();
    const r = await inviteCrew({ email: to, name: name.trim(), role });
    if (r.ok) {
      setEmail("");
      setName("");
      setRole("prompter");
      await load();
      setMsg(
        `Invite sent to ${to}. They open the email, choose a password and land on their desk.`,
      );
    } else {
      setMsg(r.error);
    }
    setInviting(false);
  };

  const resend = async (m: CrewEntry) => {
    setBusyId(m.id);
    const r = await resendCrew(m.id);
    setMsg(
      r.ok
        ? m.status === "invited"
          ? `New invite sent to ${m.email}.`
          : `Password reset link sent to ${m.email}.`
        : r.error,
    );
    setBusyId(null);
  };

  const remove = async (m: CrewEntry) => {
    if (!window.confirm(`Remove ${m.email || m.name}? They will no longer be able to sign in.`))
      return;
    setBusyId(m.id);
    const r = await removeCrew(m.id);
    await load();
    setMsg(r.ok ? `${m.email} removed.` : r.error);
    setBusyId(null);
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 rounded-sm border border-border p-2">
        <p className="mk-label text-[9px]">ADD PERSON (EMAIL INVITE)</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="mk-field h-8 rounded-sm px-2 text-sm"
            type="email"
            placeholder="Email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="mk-field h-8 rounded-sm px-2 text-sm"
            placeholder="Name (optional)"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            className="mk-field h-8 rounded-sm px-2 text-xs"
            value={role}
            title="Desk for this person"
            onChange={(e) => isRole(e.target.value) && setRole(e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="mk-button h-8 rounded-sm px-3 text-[10px] font-bold tracking-[0.12em]"
            disabled={inviting || !email.trim()}
            onClick={() => void invite()}
          >
            {inviting ? "SENDING…" : "SEND INVITE"}
          </button>
        </div>
        <p className="text-[10px] text-engrave">
          They get an email with a link and choose their own password. You never see or send it.
        </p>
      </div>

      {crew === null && <p className="text-xs text-engrave">Loading…</p>}
      {crew?.map((m) => {
        const self = m.id === auth.id;
        return (
          <div key={m.id} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm" title={m.email}>
              {m.email || m.name}
              {m.status === "invited" && (
                <span className="mk-label ml-2 text-[9px] text-program">INVITED</span>
              )}
            </span>
            <select
              className="mk-field h-8 rounded-sm px-2 text-xs"
              value={m.role}
              disabled={self}
              title={self ? "You cannot change your own desk" : "Desk for this person"}
              onChange={async (e) => {
                const next = e.target.value;
                if (!isRole(next)) return;
                const err = await setCrewRole(m.id, next);
                await load();
                setMsg(err ?? "");
              }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            {m.status !== undefined && (
              <button
                type="button"
                className="mk-button h-8 rounded-sm px-2 text-[9px] tracking-[0.12em]"
                disabled={busyId === m.id}
                title={
                  m.status === "invited"
                    ? "Send the invite email again"
                    : "Email a password reset link"
                }
                onClick={() => void resend(m)}
              >
                {m.status === "invited" ? "RESEND" : "RESET PW"}
              </button>
            )}
            {m.status !== undefined && !self && (
              <button
                type="button"
                className="mk-button h-8 rounded-sm px-2 text-[9px] tracking-[0.12em]"
                disabled={busyId === m.id}
                onClick={() => void remove(m)}
              >
                REMOVE
              </button>
            )}
          </div>
        );
      })}
      {msg && <p className="text-xs text-program">{msg}</p>}
      <p className="text-[10px] text-engrave">
        People pick up a new desk the next time they open or reload the app.
      </p>
    </div>
  );
}

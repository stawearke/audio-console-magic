import { useCallback, useEffect, useState } from "react";

import { cloudConfigured, listCrew, setCrewRole, useAuth, type CrewMember } from "@/lib/mk/cloud";
import { ROLES, ROLE_LABEL, isRole } from "@/lib/mk/roles";

/** Director only: who has an account and which desk each person gets. */
export function CrewList() {
  const auth = useAuth();
  const [crew, setCrew] = useState<CrewMember[] | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => setCrew(await listCrew()), []);
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

  return (
    <div className="grid gap-2">
      {crew === null && <p className="text-xs text-engrave">Loading…</p>}
      {crew?.map((m) => (
        <div key={m.id} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm" title={m.email}>
            {m.email || m.name}
          </span>
          <select
            className="mk-field h-8 rounded-sm px-2 text-xs"
            value={m.role}
            disabled={m.id === auth.id}
            title={m.id === auth.id ? "You cannot change your own desk" : "Desk for this person"}
            onChange={async (e) => {
              const role = e.target.value;
              if (!isRole(role)) return;
              const err = await setCrewRole(m.id, role);
              setMsg(err ?? "");
              await load();
            }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
      ))}
      {msg && <p className="text-xs text-program">{msg}</p>}
      <p className="text-[10px] text-engrave">
        People pick up a new desk the next time they open or reload the app.
      </p>
    </div>
  );
}

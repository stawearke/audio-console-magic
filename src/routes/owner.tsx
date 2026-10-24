import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  createStudio,
  listStudios,
  setStudioActive,
  useAuth,
  type StudioEntry,
} from "@/lib/mk/cloud";

export const Route = createFileRoute("/owner")({
  head: () => ({ meta: [{ title: "Owner — MK VISION" }] }),
  component: Owner,
});

/** Platform owner only: create studios, give each its first Director, switch a studio off or on. */
function Owner() {
  const auth = useAuth();
  const [studios, setStudios] = useState<StudioEntry[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dname, setDname] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const r = await listStudios();
    if (r.ok) setStudios(r.data);
    else {
      setStudios([]);
      setMsg(r.error);
    }
  }, []);

  useEffect(() => {
    if (auth.owner) void load();
  }, [auth.owner, load]);

  const create = async () => {
    setCreating(true);
    setMsg("");
    const to = email.trim();
    const r = await createStudio({
      name: name.trim(),
      directorEmail: to,
      directorName: dname.trim(),
    });
    if (r.ok) {
      const made = name.trim();
      setName("");
      setEmail("");
      setDname("");
      await load();
      setMsg(`${made} created. An invite was emailed to ${to}, who becomes its Director.`);
    } else {
      setMsg(r.error);
    }
    setCreating(false);
  };

  const toggle = async (s: StudioEntry) => {
    const next = !s.active;
    const ask = next
      ? `Switch ${s.name} back on?`
      : `Switch ${s.name} OFF? Nobody in it will be able to read or write anything until you switch it back on.`;
    if (!window.confirm(ask)) return;
    setBusyId(s.id);
    const r = await setStudioActive(s.id, next);
    await load();
    setMsg(r.ok ? `${s.name} is now ${next ? "ON" : "OFF"}.` : r.error);
    setBusyId(null);
  };

  return (
    <div className="mk-chassis min-h-[100dvh]">
      <header className="flex items-center gap-3 border-b border-border p-3">
        <Link to="/" className="mk-button grid h-8 w-8 place-items-center rounded-sm" title="Back">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-base tracking-[0.2em] text-foreground">OWNER</h1>
        <span className="mk-label ml-auto text-[9px]">{auth.email}</span>
      </header>

      <div className="mx-auto grid max-w-3xl gap-3 p-3">
        {auth.ready && !auth.owner && (
          <p className="text-xs text-engrave">This page is for the platform owner only.</p>
        )}

        {auth.owner && (
          <>
            <section className="mk-panel grid gap-2 rounded-md p-3">
              <p className="mk-label text-[9px]">NEW STUDIO</p>
              <input
                className="mk-field h-9 rounded-sm px-2 text-sm"
                placeholder="Studio name"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className="mk-field h-9 rounded-sm px-2 text-sm"
                  type="email"
                  placeholder="Director email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  className="mk-field h-9 rounded-sm px-2 text-sm"
                  placeholder="Director name (optional)"
                  autoComplete="off"
                  value={dname}
                  onChange={(e) => setDname(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="mk-button h-9 rounded-sm text-[11px] font-bold tracking-[0.12em]"
                disabled={creating || !name.trim() || !email.trim()}
                onClick={() => void create()}
              >
                {creating ? "CREATING…" : "CREATE STUDIO AND INVITE DIRECTOR"}
              </button>
              <p className="text-[10px] text-engrave">
                The Director gets an email, chooses a password, and from then on invites their own
                crew in Settings → Crew. They only ever see their own studio.
              </p>
            </section>

            <section className="mk-panel grid gap-2 rounded-md p-3">
              <p className="mk-label text-[9px]">STUDIOS</p>
              {studios === null && <p className="text-xs text-engrave">Loading…</p>}
              {studios?.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {s.name}
                      <span className="mk-label ml-2 text-[9px]">{s.active ? "ON" : "OFF"}</span>
                    </p>
                    <p className="truncate text-[10px] text-engrave">
                      {s.directors.length ? s.directors.join(", ") : "No Director yet"} ·{" "}
                      {s.members} {s.members === 1 ? "person" : "people"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="mk-button h-8 rounded-sm px-2 text-[9px] tracking-[0.12em]"
                    disabled={busyId === s.id}
                    onClick={() => void toggle(s)}
                  >
                    {s.active ? "SWITCH OFF" : "SWITCH ON"}
                  </button>
                </div>
              ))}
            </section>
          </>
        )}
        {msg && <p className="text-xs text-program">{msg}</p>}
      </div>
    </div>
  );
}

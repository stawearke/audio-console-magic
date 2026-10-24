import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { setPassword, useAuth } from "@/lib/mk/cloud";

export const Route = createFileRoute("/set-password")({
  head: () => ({ meta: [{ title: "Set your password — MK VISION" }] }),
  component: SetPassword,
});

/** The invite email and the "forgot password" email both land here, already signed in by the link. */
function SetPassword() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [linkError, setLinkError] = useState("");

  // Supabase puts a failed link in the address (#error_description=...). Read it once the page is on screen.
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const d = h.get("error_description");
    if (d) setLinkError(d.replace(/\+/g, " "));
  }, []);

  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = again.length > 0 && pw !== again;
  const canSave = pw.length >= 8 && pw === again && !busy;

  const save = async () => {
    setBusy(true);
    setMsg("");
    const err = await setPassword(pw);
    if (err) {
      setMsg(err);
      setBusy(false);
      return;
    }
    void navigate({ to: "/", replace: true });
  };

  return (
    <div className="mk-chassis flex min-h-[100dvh] items-center justify-center p-4">
      <div className="mk-panel grid w-full max-w-sm gap-3 rounded-md p-4">
        <h1 className="text-base font-bold tracking-[0.22em] text-foreground">MK VISION</h1>
        <p className="mk-label text-[9px]">CHOOSE YOUR PASSWORD</p>

        {!auth.ready && <p className="text-xs text-engrave">Checking your link…</p>}

        {auth.ready && !auth.id && (
          <>
            <p className="text-xs text-program">
              {linkError || "This link has expired or was already used."}
            </p>
            <p className="text-[10px] text-engrave">
              Ask your Director to resend your invite, or use Forgot password on the sign-in page.
            </p>
            <Link
              to="/login"
              className="mk-button grid h-10 place-items-center rounded-sm text-sm font-bold"
            >
              GO TO SIGN IN
            </Link>
          </>
        )}

        {auth.ready && auth.id && (
          <>
            <p className="text-[10px] text-engrave">
              Signed in as {auth.email}. Choose a password you will use from now on (8 characters or
              more).
            </p>
            <label className="grid gap-1">
              <span className="mk-label">New password</span>
              <input
                className="mk-field h-9 rounded-sm px-2 text-sm"
                type="password"
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </label>
            <label className="grid gap-1">
              <span className="mk-label">Repeat password</span>
              <input
                className="mk-field h-9 rounded-sm px-2 text-sm"
                type="password"
                autoComplete="new-password"
                value={again}
                onChange={(e) => setAgain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canSave && void save()}
              />
            </label>
            {tooShort && <p className="text-xs text-program">Use at least 8 characters.</p>}
            {mismatch && <p className="text-xs text-program">The two passwords do not match.</p>}
            {msg && <p className="text-xs text-program">{msg}</p>}
            <button
              type="button"
              className="mk-button h-10 rounded-sm text-sm font-bold"
              disabled={!canSave}
              onClick={() => void save()}
            >
              SAVE AND CONTINUE
            </button>
          </>
        )}
      </div>
    </div>
  );
}

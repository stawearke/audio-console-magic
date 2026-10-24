import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { cloudConfigured, sendPasswordReset, signIn, useAuth } from "@/lib/mk/cloud";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — MK VISION" }] }),
  component: Login,
});

function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Signed in (or no accounts set up for this site): go to your desk.
  useEffect(() => {
    if (auth.ready && (auth.id || !cloudConfigured())) void navigate({ to: "/", replace: true });
  }, [auth.ready, auth.id, navigate]);

  const submit = async () => {
    setBusy(true);
    setMsg("");
    setMsg((await signIn(email.trim(), password)) ?? "");
    setBusy(false);
  };

  const forgot = async () => {
    if (!email.trim()) {
      setMsg("Type your email above first, then press Forgot password.");
      return;
    }
    setBusy(true);
    const err = await sendPasswordReset(email.trim());
    setMsg(err ?? "If that email has an account, a link to choose a new password is on its way.");
    setBusy(false);
  };

  return (
    <div className="mk-chassis flex min-h-[100dvh] items-center justify-center p-4">
      <div className="mk-panel grid w-full max-w-sm gap-3 rounded-md p-4">
        <h1 className="text-base font-bold tracking-[0.22em] text-foreground">MK VISION</h1>
        <p className="mk-label text-[9px]">SIGN IN</p>
        <label className="grid gap-1">
          <span className="mk-label">Email</span>
          <input
            className="mk-field h-9 rounded-sm px-2 text-sm"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="grid gap-1">
          <span className="mk-label">Password</span>
          <input
            className="mk-field h-9 rounded-sm px-2 text-sm"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && email && password && void submit()}
          />
        </label>
        {msg && <p className="text-xs text-program">{msg}</p>}
        <button
          type="button"
          className="mk-button h-10 rounded-sm text-sm font-bold"
          disabled={busy || !email || !password}
          onClick={() => void submit()}
        >
          SIGN IN
        </button>
        <button
          type="button"
          className="mk-label text-[9px] hover:text-foreground"
          disabled={busy}
          onClick={() => void forgot()}
        >
          Forgot password?
        </button>
        <p className="text-[10px] text-engrave">
          Accounts are created by your Director. Ask them to send you an invite by email.
        </p>
      </div>
    </div>
  );
}

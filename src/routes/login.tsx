import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { cloudConfigured, signIn, signUp, useAuth } from "@/lib/mk/cloud";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — MK VISION" }] }),
  component: Login,
});

function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Signed in (or no accounts set up for this site): go to your desk.
  useEffect(() => {
    if (auth.ready && (auth.id || !cloudConfigured())) void navigate({ to: "/", replace: true });
  }, [auth.ready, auth.id, navigate]);

  const submit = async () => {
    setBusy(true);
    setMsg("");
    if (creating) {
      const r = await signUp(email.trim(), password);
      setMsg(
        r.error ?? (r.confirm ? "Account created. Check your email to confirm, then sign in." : ""),
      );
      if (!r.error && r.confirm) setCreating(false);
    } else {
      setMsg((await signIn(email.trim(), password)) ?? "");
    }
    setBusy(false);
  };

  return (
    <div className="mk-chassis flex min-h-[100dvh] items-center justify-center p-4">
      <div className="mk-panel grid w-full max-w-sm gap-3 rounded-md p-4">
        <h1 className="text-base font-bold tracking-[0.22em] text-foreground">MK VISION</h1>
        <p className="mk-label text-[9px]">{creating ? "CREATE ACCOUNT" : "SIGN IN"}</p>
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
            autoComplete={creating ? "new-password" : "current-password"}
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
          {creating ? "CREATE ACCOUNT" : "SIGN IN"}
        </button>
        <button
          type="button"
          className="mk-label text-[9px] hover:text-foreground"
          onClick={() => setCreating((v) => !v)}
        >
          {creating ? "I already have an account" : "New here? Create an account"}
        </button>
        {creating && (
          <p className="text-[10px] text-engrave">
            New accounts start with the Prompter desk. The Director gives you your real desk in
            Settings → Crew.
          </p>
        )}
      </div>
    </div>
  );
}

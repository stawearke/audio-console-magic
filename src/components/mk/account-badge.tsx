import { Link } from "@tanstack/react-router";

import { cloudConfigured, signOut, useAuth } from "@/lib/mk/cloud";
import { ROLE_LABEL } from "@/lib/mk/roles";

/** Who is signed in, with a sign-out. Shows nothing when accounts are not set up. */
export function AccountBadge() {
  const auth = useAuth();
  if (!cloudConfigured() || !auth.id) return null;
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span
        className="mk-label hidden max-w-[10rem] truncate text-[9px] md:block"
        title={auth.email ?? ""}
      >
        {auth.email} · {auth.role ? ROLE_LABEL[auth.role] : ""}
      </span>
      {auth.owner && (
        <Link
          to="/owner"
          className="mk-button grid h-7 place-items-center rounded-[3px] px-2 text-[9px] tracking-[0.12em]"
        >
          OWNER
        </Link>
      )}
      <button
        type="button"
        className="mk-button h-7 rounded-[3px] px-2 text-[9px] tracking-[0.12em]"
        onClick={() => void signOut()}
      >
        SIGN OUT
      </button>
    </div>
  );
}

import { describe, expect, it } from "vitest";

import { routeAllowed, type Role } from "@/lib/mk/roles";

describe("sign-in page is reachable from every desk", () => {
  it.each(["director", "graphics", "sound", "prompter"] as Role[])("%s may open /login and /login/", (role) => {
    expect(routeAllowed(role, true, "/login")).toBe(true);
    expect(routeAllowed(role, true, "/login/")).toBe(true);
  });
  it("still blocks other desks' pages", () => {
    expect(routeAllowed("sound", true, "/graphics")).toBe(false);
  });
});

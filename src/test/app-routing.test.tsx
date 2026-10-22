import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering (the audio console needs
// Web Audio APIs jsdom lacks), so every page must resolve to its own route.
describe("Route table", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

  it.each(["/", "/audio", "/output"])("matches a page for %s instead of falling back to not found", (path) => {
    const matches = router.matchRoutes(path);

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("falls back to the root (not-found) for unknown paths", () => {
    const matches = router.matchRoutes("/this-route-does-not-exist");

    expect(matches.at(-1)?.routeId).toBe(rootRouteId);
  });
});

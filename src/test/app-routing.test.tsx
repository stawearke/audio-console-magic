import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering (the audio console needs Web Audio
// APIs jsdom lacks), so every page must resolve to its own route, not the not-found root.
describe("Route table", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

  it.each(["/", "/cam", "/graphics", "/playout", "/prompter", "/rundown", "/settings", "/sounds", "/onair", "/output", "/audio"])(
    "matches a page for %s",
    (path) => {
      expect(router.matchRoutes(path).at(-1)?.routeId).not.toBe(rootRouteId);
    },
  );

  it("falls back to the root (not-found) for unknown paths", () => {
    expect(router.matchRoutes("/this-route-does-not-exist").at(-1)?.routeId).toBe(rootRouteId);
  });
});

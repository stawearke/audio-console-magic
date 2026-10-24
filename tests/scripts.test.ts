import { describe, expect, test } from "bun:test";

import {
  EMPTY_LIB,
  MAX_VERSIONS,
  addScript,
  cleanLib,
  removeScript,
  renameScript,
  saveScript,
  setActive,
} from "../src/lib/mk/scripts";

describe("prompter script library", () => {
  test("add, save keeps the older text as a version, same text adds none", () => {
    let lib = addScript(EMPTY_LIB, "a", "  Evening   news ", "line one", 1000);
    expect(lib.items[0]!.name).toBe("Evening news");
    expect(lib.active).toBe("a");
    lib = saveScript(lib, "a", "line one", 2000);
    expect(lib.items[0]!.versions).toHaveLength(0);
    lib = saveScript(lib, "a", "line one\nline two", 3000);
    expect(lib.items[0]!.versions).toEqual([{ at: 1000, text: "line one" }]);
    expect(lib.items[0]!.text).toBe("line one\nline two");
  });

  test("only the last versions are kept, newest first", () => {
    let lib = addScript(EMPTY_LIB, "a", "S", "v0", 1);
    for (let i = 1; i <= MAX_VERSIONS + 5; i++) lib = saveScript(lib, "a", `v${i}`, 1 + i);
    const s = lib.items[0]!;
    expect(s.versions).toHaveLength(MAX_VERSIONS);
    expect(s.versions[0]!.text).toBe(`v${MAX_VERSIONS + 4}`);
    expect(s.text).toBe(`v${MAX_VERSIONS + 5}`);
  });

  test("rename, remove and active stay consistent", () => {
    let lib = addScript(EMPTY_LIB, "a", "A", "x", 1);
    lib = addScript(lib, "b", "B", "y", 2);
    lib = renameScript(lib, "a", "  ");
    expect(lib.items[0]!.name).toBe("Untitled");
    lib = removeScript(lib, "b");
    expect(lib.active).toBeNull();
    expect(setActive(lib, "nope").active).toBeNull();
    expect(setActive(lib, "a").active).toBe("a");
  });

  test("damaged stored data is cleaned, not trusted", () => {
    const lib = cleanLib({
      items: [
        { id: "a", text: "ok", name: 5, versions: [{ at: 1, text: "old" }, { nope: 1 }] },
        { id: 3 },
        "x",
      ],
      active: "gone",
    });
    expect(lib.items).toHaveLength(1);
    expect(lib.items[0]!.name).toBe("Untitled");
    expect(lib.items[0]!.versions).toEqual([{ at: 1, text: "old" }]);
    expect(lib.active).toBeNull();
  });
});

describe("shared script library (cloud merge)", () => {
  test("same script: the newer save wins and brings its versions; local-only scripts are uploaded", async () => {
    const { mergeLib } = await import("../src/lib/mk/scripts");
    const local = {
      items: [
        { id: "a", name: "A", text: "new local", updated: 500, versions: [] },
        { id: "b", name: "B", text: "same", updated: 100, versions: [] },
        { id: "c", name: "C", text: "only here", updated: 10, versions: [] },
      ],
      active: "a",
    };
    const remote = [
      {
        id: "a",
        name: "A",
        text: "old cloud",
        updated: 200,
        versions: [{ at: 150, text: "older" }],
      },
      { id: "b", name: "B", text: "same", updated: 300, versions: [] },
      { id: "d", name: "D", text: "only cloud", updated: 20, versions: [] },
    ];
    const { lib, upload } = mergeLib(local, remote);
    expect(lib.items.map((s) => s.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(lib.items.find((s) => s.id === "a")!.text).toBe("new local");
    expect(lib.items.find((s) => s.id === "a")!.versions).toEqual([{ at: 150, text: "older" }]);
    expect(upload.map((s) => s.id).sort()).toEqual(["a", "c"]);
    expect(lib.active).toBe("a");
  });
});

describe("accounts", () => {
  test("control pages need a login, output / camera / prompter pages do not", async () => {
    const { needsLogin } = await import("../src/lib/mk/cloud");
    for (const p of ["/", "/settings", "/audio", "/playout", "/graphics"])
      expect(needsLogin(p)).toBe(true);
    for (const p of ["/login", "/set-password", "/prompter", "/output", "/cam", "/prompter/"])
      expect(needsLogin(p)).toBe(false);
  });

  test("a signed-in non-Director account is fixed to its desk and locked; a Director can still preview", async () => {
    const { setAccountRole, getRole, setRole, isLocked } = await import("../src/lib/mk/roles");
    setAccountRole("sound");
    setRole("director");
    expect(getRole()).toBe("sound");
    expect(isLocked()).toBe(true);
    setAccountRole("director");
    setRole("graphics");
    expect(getRole()).toBe("graphics");
    setRole("director");
    setAccountRole(null);
  });
});

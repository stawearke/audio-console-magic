// Director / Graphics / Sound desks on one OBS WebSocket: shared setup stays in step.
import { describe, expect, test } from "bun:test";

const store = new Map<string, string>();
(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  },
  sessionStorage: { getItem: () => null, setItem() {} },
  location: { origin: "http://localhost:8080", href: "http://localhost:8080/" },
  addEventListener() {},
  removeEventListener() {},
};
(globalThis as any).document = { hidden: false, addEventListener() {}, removeEventListener() {} };

describe("shared setup", () => {
  test("only shared keys that changed are reported, credentials never", async () => {
    const { changedKeys, SHARED_KEYS } = await import("../src/lib/mk/shared");
    const { DEFAULT_CONFIG } = await import("../src/lib/mk/types");
    const next = { ...DEFAULT_CONFIG, host: "10.0.0.9", password: "x", hiddenAudio: ["Mic"] };
    expect(changedKeys(DEFAULT_CONFIG, next)).toEqual(["hiddenAudio"]);
    for (const k of [
      "host",
      "port",
      "password",
      "demoMode",
      "autoConnect",
      "shortcuts",
      "listenUrl",
    ])
      expect((SHARED_KEYS as readonly string[]).includes(k)).toBe(false);
  });

  test("pull applies newer remote keys, skips own writes and unsent local edits", async () => {
    const { planPull } = await import("../src/lib/mk/shared");
    const remote = {
      camScenes: { rev: 3, by: "dir", value: ["A", "B"] },
      graphics: { rev: 2, by: "me", value: { x: 1 } },
      tags: { rev: 5, by: "dir", value: { y: 1 } },
      limiter: { rev: 1, by: "dir", value: { on: true } },
    };
    const plan = planPull(remote as never, { limiter: 1 }, new Set(["tags"]), "me");
    expect(plan.keys).toEqual(["camScenes"]);
    expect(plan.revs).toEqual({ camScenes: 3, graphics: 2 });
  });

  test("revision always goes above what OBS holds and what this desk has seen", async () => {
    const { nextRev } = await import("../src/lib/mk/shared");
    expect(nextRev(null, 0)).toBe(1);
    expect(nextRev({ rev: 7, by: "a", value: 1 }, 4)).toBe(8);
    expect(nextRev({ rev: 2, by: "a", value: 1 }, 9)).toBe(10);
  });

  test("desks may only write their own slices; the Director writes all", async () => {
    const { canWrite } = await import("../src/lib/mk/roles");
    expect(canWrite("director", "camScenes")).toBe(true);
    expect(canWrite("graphics", "graphics")).toBe(true);
    expect(canWrite("graphics", "camScenes")).toBe(false);
    expect(canWrite("sound", "limiter")).toBe(true);
    expect(canWrite("sound", "graphics")).toBe(false);
  });

  test("two engines on one fake OBS end up with the same setup", async () => {
    const { engine } = await import("../src/lib/mk/engine");
    const slots = new Map<string, unknown>();
    const listeners = new Set<(e: any) => void>();
    const fake: any = {
      subscribe: (l: any) => (listeners.add(l), () => listeners.delete(l)),
      sharedGet: async (k: string) => slots.get(k) ?? null,
      sharedSet: async (k: string, v: unknown) => void slots.set(k, v),
      sharedNotify: async () => {},
    };
    const e = engine as any;
    e.transport = fake;
    e.state = { ...e.state, status: "connected", demo: false };
    engine.hideAudio("Mic 2");
    await new Promise((r) => setTimeout(r, 450));
    await e.sharedChain;
    const held = slots.get("hiddenAudio") as { rev: number; value: string[] };
    expect(held.value).toEqual(["Mic 2"]);
    // another desk wrote a newer value; this desk pulls it
    slots.set("hiddenAudio", { rev: held.rev + 1, by: "other", value: ["Mic 2", "Cam 3"] });
    await e.pullShared(["hiddenAudio"]);
    expect(e.state.config.hiddenAudio).toEqual(["Mic 2", "Cam 3"]);
  });
});

describe("prompter desk", () => {
  test("prompter is a role with no switcher panels and no shared-setup writes", async () => {
    const { isRole, ROLE_PANELS, ROLE_CAN, canWrite } = await import("../src/lib/mk/roles");
    expect(isRole("prompter")).toBe(true);
    expect(ROLE_PANELS.prompter).toEqual([]);
    expect(ROLE_CAN.switch("prompter")).toBe(false);
    expect(ROLE_CAN.output("prompter")).toBe(false);
    expect(ROLE_CAN.master("prompter")).toBe(false);
    expect(ROLE_CAN.prompter("prompter")).toBe(true);
    expect(canWrite("prompter", "camScenes")).toBe(false);
    expect(canWrite("prompter", "graphics")).toBe(false);
  });

  test("two prompter peers converge: newest revision wins, scroll start travels as an age", async () => {
    const { prompter, prompterStore, setPrompterRelay, receivePrompter } =
      await import("../src/lib/mk/prompter");
    const sent: any[] = [];
    setPrompterRelay((m) => void sent.push(m));
    expect(sent[0].type).toBe("hello");
    prompter.setSpeed(9);
    const out = sent.find((m) => m.type === "state");
    expect(out.state.speed).toBe(9);
    expect(out.state.t0).toBeUndefined();
    expect(typeof out.state.age).toBe("number");
    // an older revision from another desk is ignored
    receivePrompter({
      type: "state",
      from: "other",
      rev: out.rev - 1,
      state: { speed: 3, age: 0 },
    });
    expect(prompterStore.get().speed).toBe(9);
    // a newer one is taken, and not sent back out
    const before = sent.length;
    receivePrompter({
      type: "state",
      from: "other",
      rev: out.rev + 5,
      state: { speed: 4, playing: true, age: 2000, text: "Hello" },
    });
    expect(prompterStore.get().speed).toBe(4);
    expect(prompterStore.get().text).toBe("Hello");
    expect(prompterStore.get().playing).toBe(true);
    expect(Date.now() - prompterStore.get().t0).toBeGreaterThanOrEqual(1990);
    expect(sent.length).toBe(before);
    // a late joiner asking "hello" gets the full state, script included
    receivePrompter({ type: "hello", from: "late" });
    expect(sent.at(-1).state.text).toBe("Hello");
    setPrompterRelay(null);
  });
});

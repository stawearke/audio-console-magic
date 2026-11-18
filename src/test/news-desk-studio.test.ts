import { beforeEach, describe, expect, it } from "vitest";

import { newsDesk } from "@/lib/mk/news-desk";

const tags = [
  { main: "Heavy rain in the west", below: "Flood warning" },
  { main: "Sunny at the coast", below: "" },
];

describe("tags made in the Graphics Studio go to the News Desk", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("adds them as a story of the selected bulletin, then keeps that same story up to date", () => {
    const before = newsDesk.bulletin.stories.length;
    const first = newsDesk.sendFromStudio({ kicker: "WEATHER", tags, seconds: 7, loop: true });
    expect(first).toMatchObject({ added: true, bulletin: newsDesk.bulletin.name });
    expect(newsDesk.bulletin.stories).toHaveLength(before + 1);
    const s = newsDesk.bulletin.stories.find((x) => x.fromStudio)!;
    expect(s.name).toBe("Studio: Heavy rain in the west");
    expect(s.kicker).toBe("WEATHER");
    expect(s.seconds).toBe(7);
    expect(s.tags.map((t) => t.main)).toEqual(["Heavy rain in the west", "Sunny at the coast"]);

    const second = newsDesk.sendFromStudio({
      kicker: "WEATHER",
      tags: [...tags, { main: "Cool tonight", below: "Lows of 14°C" }],
      seconds: 7,
      loop: false,
    });
    expect(second).toMatchObject({ added: false });
    expect(newsDesk.bulletin.stories).toHaveLength(before + 1); // no copy
    const again = newsDesk.bulletin.stories.find((x) => x.fromStudio)!;
    expect(again.id).toBe(s.id);
    expect(again.tags).toHaveLength(3);
    expect(again.loop).toBe(false);
  });

  it("sends nothing when there is no tag text", () => {
    const before = newsDesk.bulletin.stories.length;
    expect(newsDesk.sendFromStudio({ kicker: "X", tags: [{ main: " ", below: "" }], seconds: 6, loop: true })).toBeNull();
    expect(newsDesk.bulletin.stories.length).toBe(before);
  });

  it("goes to whichever bulletin is selected", () => {
    newsDesk.newBulletin("Midday News · 12 PM");
    const out = newsDesk.sendFromStudio({ kicker: "LIVE", tags, seconds: 6, loop: true });
    expect(out?.bulletin).toBe("Midday News · 12 PM");
    expect(newsDesk.bulletin.stories.some((x) => x.fromStudio)).toBe(true);
  });

  it("survives a reload: the story is still the one the studio feeds", () => {
    newsDesk.sendFromStudio({ kicker: "LIVE", tags, seconds: 6, loop: true });
    const saved = JSON.parse(window.localStorage.getItem("mkvision.news.bulletins.v1") ?? "[]") as {
      stories: { fromStudio?: boolean }[];
    }[];
    expect(saved.some((b) => b.stories.some((s) => s.fromStudio === true))).toBe(true);
  });
});

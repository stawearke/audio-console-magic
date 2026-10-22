import { getTemplate, THEME_PRESETS } from "./templates";
import type { Item, Show } from "./types";

export function makeItem(templateId: string, id: string, data?: Record<string, string>, name?: string): Item {
  const t = getTemplate(templateId);
  if (!t) throw new Error(`Unknown broadcast template: ${templateId}`);
  return { id, templateId, name: name ?? t.name, data: { ...t.defaults, ...data }, transition: t.layer === "full" ? "fade" : t.layer === "ticker" ? "wipe" : "slide", animMs: 600, durationSec: t.durationSec };
}

export function seedShows(): Show[] {
  const newsTheme = THEME_PRESETS[0]?.theme;
  const sportsTheme = THEME_PRESETS[2]?.theme;
  if (!newsTheme || !sportsTheme) throw new Error("Required broadcast themes are missing");
  return [
    {
      id: "show-news", name: "Evening News Bulletin", theme: newsTheme,
      items: [
        makeItem("logo", "n1"), makeItem("location", "n2"), makeItem("lower-third", "n3"),
        makeItem("guest-strap", "n4"), makeItem("ticker", "n5"), makeItem("headline", "n6"),
        makeItem("quote", "n7"), makeItem("breaking", "n8"), makeItem("social", "n9"),
        makeItem("announcement", "n10"), makeItem("credits", "n11"),
      ],
    },
    {
      id: "show-sports", name: "Saturday Football", theme: sportsTheme,
      items: [makeItem("logo", "s1"), makeItem("scoreboard", "s2"), makeItem("player", "s3"), makeItem("standings", "s4"), makeItem("clock", "s5"), makeItem("countdown", "s6")],
    },
  ];
}

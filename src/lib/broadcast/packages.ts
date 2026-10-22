import { makeItem } from "./seed";
import { THEME_PRESETS } from "./templates";
import type { GraphicPackage, Item } from "./types";

const newsTheme = THEME_PRESETS[0]?.theme;
const universityTheme = THEME_PRESETS[1]?.theme;
const eventTheme = THEME_PRESETS[4]?.theme;

if (!newsTheme || !universityTheme || !eventTheme) {
  throw new Error("Required broadcast themes are missing");
}

export const GRAPHIC_PACKAGES: GraphicPackage[] = [
  {
    id: "breaking-desk",
    name: "Breaking News Command",
    shortName: "BREAKING",
    description: "Urgent coverage with live bug, headline, alert strap and continuous ticker.",
    theme: newsTheme,
    items: [
      { templateId: "logo", name: "Breaking · Station ID", data: { text: "NEWS 24" }, transition: "scale", durationSec: 0 },
      { templateId: "location", name: "Breaking · Live Location", data: { tag: "LIVE", location: "NEWSROOM" }, transition: "wipe", durationSec: 0 },
      { templateId: "headline", name: "Breaking · Story Open", data: { kicker: "BREAKING NEWS", headline: "Major story developing now", body: "Our newsroom is following the latest developments. Stay with us for verified updates." }, transition: "reveal", animMs: 750, durationSec: 8 },
      { templateId: "breaking", name: "Breaking · Alert Strap", data: { label: "BREAKING NEWS", headline: "Major story developing — live updates as they happen" }, transition: "wipe", animMs: 450, durationSec: 0 },
      { templateId: "ticker", name: "Breaking · Updates Ticker", data: { label: "LIVE UPDATES", items: "Newsroom teams are verifying the latest information\nCorrespondents are reporting live from the scene\nMore details will follow throughout this bulletin", speed: "34", direction: "left" }, transition: "wipe", durationSec: 0 },
    ],
  },
  {
    id: "field-report",
    name: "Live Field Report",
    shortName: "LIVE",
    description: "A complete correspondent sequence for live reports from any location.",
    theme: universityTheme,
    items: [
      { templateId: "logo", name: "Live · Station ID", data: { text: "UTV" }, transition: "fade", durationSec: 0 },
      { templateId: "location", name: "Live · Location Bug", data: { tag: "LIVE", location: "NAIROBI" }, transition: "slide", durationSec: 0 },
      { templateId: "lower-third", name: "Live · Correspondent", data: { name: "AMINA WANJIKU", title: "Senior Correspondent" }, transition: "slide", durationSec: 8 },
      { templateId: "headline", name: "Live · Report Intro", data: { kicker: "LIVE REPORT", headline: "The story from where it is happening", body: "Our correspondent brings context, reaction and the latest verified information from the scene." }, transition: "fade", durationSec: 8 },
      { templateId: "ticker", name: "Live · News Ticker", data: { label: "LATEST", items: "Live coverage continues across all platforms\nSend your questions to @campustv\nNext bulletin at the top of the hour", speed: "42", direction: "left" }, transition: "wipe", durationSec: 0 },
    ],
  },
  {
    id: "studio-interview",
    name: "Studio Interview Suite",
    shortName: "INTERVIEW",
    description: "Elegant guest introduction, quote moment, social prompt and clean close.",
    theme: universityTheme,
    items: [
      { templateId: "logo", name: "Interview · Station ID", data: { text: "UTV" }, transition: "fade", durationSec: 0 },
      { templateId: "guest-strap", name: "Interview · Guest Strap", data: { name: "Dr. Peter Otieno", role: "Economist", org: "Institute of Policy Studies" }, transition: "slide", durationSec: 10 },
      { templateId: "quote", name: "Interview · Key Quote", data: { quote: "The decisions we make today will shape opportunity for the next generation.", author: "Dr. Peter Otieno" }, transition: "reveal", durationSec: 9 },
      { templateId: "social", name: "Interview · Social Prompt", data: { platform: "JOIN THE CONVERSATION", handle: "@campustv" }, transition: "slide", durationSec: 7 },
      { templateId: "announcement", name: "Interview · Coming Up", data: { title: "STILL TO COME", subtitle: "Your questions answered after the break" }, transition: "fade", durationSec: 8 },
    ],
  },
  {
    id: "bulletin-prime",
    name: "Prime Bulletin",
    shortName: "BULLETIN",
    description: "A polished nightly-news flow from opener to headlines, stories and credits.",
    theme: eventTheme,
    items: [
      { templateId: "countdown", name: "Bulletin · Live Countdown", data: { title: "LIVE IN", seconds: "30", subtitle: "The Prime Bulletin" }, transition: "scale", durationSec: 0 },
      { templateId: "announcement", name: "Bulletin · Program Open", data: { title: "PRIME NEWS", subtitle: "Clear facts. Complete context." }, transition: "reveal", durationSec: 6 },
      { templateId: "logo", name: "Bulletin · Station ID", data: { text: "PRIME" }, transition: "fade", durationSec: 0 },
      { templateId: "headline", name: "Bulletin · Lead Story", data: { kicker: "TOP STORY", headline: "Tonight’s lead story begins here", body: "A complete account with the people, facts and consequences that matter." }, transition: "fade", durationSec: 10 },
      { templateId: "lower-third", name: "Bulletin · Anchor Strap", data: { name: "AMINA WANJIKU", title: "Anchor, Prime News" }, transition: "slide", durationSec: 8 },
      { templateId: "ticker", name: "Bulletin · Headlines Ticker", data: { label: "HEADLINES", items: "Top story: latest national developments\nBusiness: markets respond to new figures\nSport: national team prepares for qualifier\nWeather: rain expected in western counties", speed: "40", direction: "left" }, transition: "wipe", durationSec: 0 },
      { templateId: "credits", name: "Bulletin · End Credits", data: { title: "PRIME NEWS", lines: "Producer — Grace Njeri\nDirector — Kevin Ouma\nGraphics — Faith Akinyi\nCamera — Daniel Kiprop\nSound — Lucy Mwende", speed: "20" }, transition: "fade", durationSec: 0 },
    ],
  },
];

export function makePackageItems(pack: GraphicPackage, makeId: () => string): Item[] {
  return pack.items.map((spec) => ({
    ...makeItem(spec.templateId, makeId(), spec.data, spec.name),
    ...(spec.transition ? { transition: spec.transition } : {}),
    ...(spec.animMs !== undefined ? { animMs: spec.animMs } : {}),
    ...(spec.durationSec !== undefined ? { durationSec: spec.durationSec } : {}),
    packageId: pack.id,
    packageName: pack.name,
  }));
}
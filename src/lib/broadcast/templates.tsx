import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { Field, Layer, Theme } from "./types";

export interface RenderProps { data: Record<string, string>; theme: Theme; takenAt: number }
export interface Template {
  id: string;
  name: string;
  category: "News" | "Sports" | "General";
  layer: Layer;
  fields: Field[];
  defaults: Record<string, string>;
  durationSec: number;
  Render: (p: RenderProps) => ReactNode;
}

const abs = (s: CSSProperties): CSSProperties => ({ position: "absolute", ...s });
const lines = (v = "") => v.split("\n").map((l) => l.trim()).filter(Boolean);

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Clock({ label, theme }: { label: string; theme: Theme }) {
  const now = useNow();
  const t = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <div style={abs({ top: 60, right: 80, display: "flex", fontFamily: theme.font, color: theme.text, fontSize: 34, fontWeight: 700 })}>
      <div style={{ background: theme.accent, color: theme.secondary, padding: "10px 18px" }}>{label}</div>
      <div style={{ background: theme.secondary, padding: "10px 22px", fontVariantNumeric: "tabular-nums" }}>{t}</div>
    </div>
  );
}

function Countdown({ data, theme, takenAt }: RenderProps) {
  const now = useNow(250);
  const total = Math.max(0, Number(data["seconds"]) || 0) * 1000;
  const left = Math.max(0, total - (now - takenAt));
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  return (
    <div style={abs({ inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `linear-gradient(160deg, ${theme.secondary}, ${theme.primary})`, color: theme.text, fontFamily: theme.font })}>
      <div style={{ fontSize: 48, letterSpacing: 12, textTransform: "uppercase", color: theme.accent }}>{data["title"]}</div>
      <div style={{ fontSize: 300, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
        {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </div>
      <div style={{ fontSize: 40, opacity: 0.8 }}>{data["subtitle"]}</div>
    </div>
  );
}

export const TEMPLATES: Template[] = [
  {
    id: "lower-third", name: "Presenter Lower Third", category: "News", layer: "lower", durationSec: 8,
    fields: [{ key: "name", label: "Name", type: "text" }, { key: "title", label: "Designation", type: "text" }],
    defaults: { name: "AMINA WANJIKU", title: "Anchor, Evening Bulletin" },
    Render: ({ data, theme }) => (
      <div style={abs({ left: 120, bottom: 150, fontFamily: theme.font })}>
        <div style={{ display: "flex" }}>
          <div style={{ width: 14, background: theme.accent }} />
          <div style={{ background: theme.primary, color: theme.text, fontSize: 64, fontWeight: 800, padding: "10px 40px", letterSpacing: 1 }}>{data["name"]}</div>
        </div>
        <div style={{ marginLeft: 14, display: "inline-block", background: theme.secondary, color: theme.text, fontSize: 34, padding: "8px 40px" }}>{data["title"]}</div>
      </div>
    ),
  },
  {
    id: "guest-strap", name: "Interview Guest Strap", category: "News", layer: "lower", durationSec: 8,
    fields: [{ key: "name", label: "Guest name", type: "text" }, { key: "role", label: "Role", type: "text" }, { key: "org", label: "Organisation", type: "text" }],
    defaults: { name: "Dr. Peter Otieno", role: "Economist", org: "Institute of Policy Studies" },
    Render: ({ data, theme }) => (
      <div style={abs({ left: 120, bottom: 150, fontFamily: theme.font, color: theme.text, background: theme.secondary, borderTop: `6px solid ${theme.accent}`, padding: "22px 48px 22px 48px", minWidth: 760 })}>
        <div style={{ fontSize: 56, fontWeight: 700 }}>{data["name"]}</div>
        <div style={{ fontSize: 30, opacity: 0.9 }}>{data["role"]} <span style={{ color: theme.accent }}>•</span> {data["org"]}</div>
      </div>
    ),
  },
  {
    id: "breaking", name: "Breaking News Banner", category: "News", layer: "breaking", durationSec: 0,
    fields: [{ key: "label", label: "Label", type: "text" }, { key: "headline", label: "Headline", type: "text" }],
    defaults: { label: "BREAKING NEWS", headline: "Parliament passes new climate bill after overnight session" },
    Render: ({ data, theme }) => (
      <div style={abs({ left: 0, right: 0, bottom: 150, display: "flex", fontFamily: theme.font, height: 120 })}>
        <div style={{ background: "#d0161d", color: "#fff", fontSize: 54, fontWeight: 800, padding: "0 48px", display: "flex", alignItems: "center", letterSpacing: 2 }}>
          <span className="gfx-pulse">{data["label"]}</span>
        </div>
        <div style={{ flex: 1, background: "#fff", color: "#111", fontSize: 52, fontWeight: 700, display: "flex", alignItems: "center", padding: "0 40px" }}>{data["headline"]}</div>
      </div>
    ),
  },
  {
    id: "ticker", name: "News Ticker", category: "News", layer: "ticker", durationSec: 0,
    fields: [{ key: "label", label: "Label", type: "text" }, { key: "items", label: "Items (one per line)", type: "textarea" }, { key: "speed", label: "Speed (seconds per loop)", type: "number" }, { key: "direction", label: "Direction (left/right)", type: "text" }],
    defaults: { label: "LATEST", items: "Markets close higher on strong export data\nNational team names squad for qualifiers\nHeavy rains expected in the western region tomorrow\nUniversity open day set for Saturday", speed: "40", direction: "left" },
    Render: ({ data, theme }) => {
      const msg = lines(data["items"]).join("     ◆     ");
      return (
        <div style={abs({ left: 0, right: 0, bottom: 40, height: 64, display: "flex", fontFamily: theme.font, fontSize: 34, color: theme.text })}>
          <div style={{ background: theme.accent, color: theme.secondary, fontWeight: 800, padding: "0 32px", display: "flex", alignItems: "center", zIndex: 1 }}>{data["label"]}</div>
          <div style={{ flex: 1, overflow: "hidden", background: theme.secondary, display: "flex", alignItems: "center" }}>
            <div style={{ whiteSpace: "nowrap", animation: `${data["direction"] === "right" ? "gfx-marquee-rev" : "gfx-marquee"} ${Number(data["speed"]) || 40}s linear infinite` }}>
              <span style={{ paddingRight: 120 }}>{msg}     ◆     </span><span style={{ paddingRight: 120 }}>{msg}     ◆     </span>
            </div>
          </div>
        </div>
      );
    },
  },
  {
    id: "location", name: "Live Location Bug", category: "News", layer: "bug", durationSec: 0,
    fields: [{ key: "tag", label: "Tag", type: "text" }, { key: "location", label: "Location", type: "text" }],
    defaults: { tag: "LIVE", location: "NAIROBI" },
    Render: ({ data, theme }) => (
      <div style={abs({ top: 60, left: 80, display: "flex", fontFamily: theme.font, fontSize: 36, fontWeight: 800 })}>
        <div style={{ background: "#d0161d", color: "#fff", padding: "8px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <span className="gfx-pulse" style={{ width: 16, height: 16, borderRadius: 99, background: "#fff" }} />{data["tag"]}
        </div>
        <div style={{ background: theme.secondary, color: theme.text, padding: "8px 24px", letterSpacing: 2 }}>{data["location"]}</div>
      </div>
    ),
  },
  {
    id: "headline", name: "Headline Card", category: "News", layer: "full", durationSec: 10,
    fields: [{ key: "kicker", label: "Kicker", type: "text" }, { key: "headline", label: "Headline", type: "textarea" }, { key: "body", label: "Body", type: "textarea" }],
    defaults: { kicker: "TOP STORY", headline: "City unveils 10-year plan for public transport", body: "New rapid bus corridors and commuter rail upgrades will connect five counties by 2036." },
    Render: ({ data, theme }) => (
      <div style={abs({ inset: 0, background: `linear-gradient(120deg, ${theme.secondary} 55%, ${theme.primary})`, fontFamily: theme.font, color: theme.text, padding: "180px 160px" })}>
        <div style={{ fontSize: 40, color: theme.accent, letterSpacing: 8, fontWeight: 700 }}>{data["kicker"]}</div>
        <div style={{ fontSize: 120, fontWeight: 800, lineHeight: 1.02, maxWidth: 1400, marginTop: 24 }}>{data["headline"]}</div>
        <div style={{ width: 200, height: 10, background: theme.accent, margin: "48px 0" }} />
        <div style={{ fontSize: 44, maxWidth: 1300, opacity: 0.9 }}>{data["body"]}</div>
      </div>
    ),
  },
  {
    id: "quote", name: "Quote Card", category: "News", layer: "full", durationSec: 10,
    fields: [{ key: "quote", label: "Quote", type: "textarea" }, { key: "author", label: "Author", type: "text" }],
    defaults: { quote: "We will not build the future by repeating the past.", author: "Minister of Education" },
    Render: ({ data, theme }) => (
      <div style={abs({ inset: 0, background: theme.secondary, fontFamily: theme.font, color: theme.text, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 220px" })}>
        <div style={{ fontSize: 260, color: theme.accent, lineHeight: 0.6, height: 140 }}>“</div>
        <div style={{ fontSize: 88, fontWeight: 600, lineHeight: 1.15 }}>{data["quote"]}</div>
        <div style={{ fontSize: 44, marginTop: 50, color: theme.accent }}>— {data["author"]}</div>
      </div>
    ),
  },
  {
    id: "scoreboard", name: "Match Scoreboard", category: "Sports", layer: "bug", durationSec: 0,
    fields: [{ key: "home", label: "Home", type: "text" }, { key: "homeScore", label: "Home score", type: "number" }, { key: "away", label: "Away", type: "text" }, { key: "awayScore", label: "Away score", type: "number" }, { key: "clock", label: "Clock", type: "text" }],
    defaults: { home: "LEO", homeScore: "2", away: "RHI", awayScore: "1", clock: "67:12" },
    Render: ({ data, theme }) => (
      <div style={abs({ top: 60, left: 80, display: "flex", fontFamily: theme.font, fontSize: 40, fontWeight: 800, color: theme.text })}>
        <div style={{ background: theme.primary, padding: "8px 24px" }}>{data["home"]}</div>
        <div style={{ background: theme.text, color: theme.secondary, padding: "8px 22px", fontVariantNumeric: "tabular-nums" }}>{data["homeScore"]}–{data["awayScore"]}</div>
        <div style={{ background: theme.primary, padding: "8px 24px" }}>{data["away"]}</div>
        <div style={{ background: theme.accent, color: theme.secondary, padding: "8px 22px", fontVariantNumeric: "tabular-nums" }}>{data["clock"]}</div>
      </div>
    ),
  },
  {
    id: "player", name: "Player ID", category: "Sports", layer: "lower", durationSec: 6,
    fields: [{ key: "number", label: "Number", type: "text" }, { key: "name", label: "Player", type: "text" }, { key: "info", label: "Info", type: "text" }],
    defaults: { number: "10", name: "BRIAN MUTUA", info: "Forward • 7 goals this season" },
    Render: ({ data, theme }) => (
      <div style={abs({ left: 120, bottom: 150, display: "flex", fontFamily: theme.font, color: theme.text })}>
        <div style={{ background: theme.accent, color: theme.secondary, fontSize: 110, fontWeight: 800, padding: "0 36px", display: "flex", alignItems: "center" }}>{data["number"]}</div>
        <div style={{ background: theme.primary, padding: "18px 40px" }}>
          <div style={{ fontSize: 60, fontWeight: 800 }}>{data["name"]}</div>
          <div style={{ fontSize: 32 }}>{data["info"]}</div>
        </div>
      </div>
    ),
  },
  {
    id: "standings", name: "League Standings", category: "Sports", layer: "full", durationSec: 12,
    fields: [{ key: "title", label: "Title", type: "text" }, { key: "rows", label: "Rows: Team, P, Pts (one per line)", type: "textarea" }],
    defaults: { title: "PREMIER LEAGUE TABLE", rows: "Leopards, 12, 28\nRhinos, 12, 25\nFalcons, 12, 22\nSharks, 12, 19\nEagles, 12, 15" },
    Render: ({ data, theme }) => (
      <div style={abs({ inset: 0, background: `${theme.secondary}ee`, fontFamily: theme.font, color: theme.text, padding: "120px 360px" })}>
        <div style={{ fontSize: 64, fontWeight: 800, borderBottom: `8px solid ${theme.accent}`, paddingBottom: 16 }}>{data["title"]}</div>
        {lines(data["rows"]).map((r, i) => {
          const [team, p, pts] = r.split(",").map((s) => s.trim());
          return (
            <div key={i} style={{ display: "flex", fontSize: 48, padding: "18px 0", borderBottom: `1px solid ${theme.text}33`, background: i % 2 ? "transparent" : `${theme.primary}55` }}>
              <div style={{ width: 90, paddingLeft: 20, color: theme.accent, fontWeight: 800 }}>{i + 1}</div>
              <div style={{ flex: 1 }}>{team}</div>
              <div style={{ width: 140, textAlign: "right" }}>{p}</div>
              <div style={{ width: 160, textAlign: "right", paddingRight: 20, fontWeight: 800 }}>{pts}</div>
            </div>
          );
        })}
      </div>
    ),
  },
  {
    id: "countdown", name: "Countdown Timer", category: "General", layer: "full", durationSec: 0,
    fields: [{ key: "title", label: "Title", type: "text" }, { key: "seconds", label: "Seconds", type: "number" }, { key: "subtitle", label: "Subtitle", type: "text" }],
    defaults: { title: "WE'RE LIVE IN", seconds: "300", subtitle: "Campus TV Graduation Special" },
    Render: (p) => <Countdown {...p} />,
  },
  {
    id: "clock", name: "Digital Clock", category: "General", layer: "bug", durationSec: 0,
    fields: [{ key: "label", label: "Label", type: "text" }],
    defaults: { label: "EAT" },
    Render: ({ data, theme }) => <Clock label={data["label"] ?? ""} theme={theme} />,
  },
  {
    id: "logo", name: "Station Logo Bug", category: "General", layer: "logo", durationSec: 0,
    fields: [{ key: "text", label: "Text", type: "text" }, { key: "image", label: "Image URL (optional)", type: "url" }],
    defaults: { text: "UTV", image: "" },
    Render: ({ data, theme }) => (
      <div style={abs({ top: 56, right: 80, fontFamily: theme.font, opacity: 0.9 })}>
        {data["image"] ? (
          <img src={data["image"]} alt="" style={{ height: 90 }} onError={(e) => (e.currentTarget.style.display = "none")} />
        ) : (
          <div style={{ border: `4px solid ${theme.text}`, color: theme.text, fontSize: 48, fontWeight: 800, padding: "2px 18px", letterSpacing: 4 }}>{data["text"]}</div>
        )}
      </div>
    ),
  },
  {
    id: "social", name: "Social Handle", category: "General", layer: "lower", durationSec: 6,
    fields: [{ key: "platform", label: "Platform", type: "text" }, { key: "handle", label: "Handle", type: "text" }],
    defaults: { platform: "FOLLOW US", handle: "@campustv" },
    Render: ({ data, theme }) => (
      <div style={abs({ right: 120, bottom: 150, display: "flex", fontFamily: theme.font, fontSize: 44, fontWeight: 700, borderRadius: 999, overflow: "hidden" })}>
        <div style={{ background: theme.accent, color: theme.secondary, padding: "14px 30px" }}>{data["platform"]}</div>
        <div style={{ background: theme.secondary, color: theme.text, padding: "14px 36px" }}>{data["handle"]}</div>
      </div>
    ),
  },
  {
    id: "announcement", name: "Full-screen Announcement", category: "General", layer: "full", durationSec: 10,
    fields: [{ key: "title", label: "Title", type: "text" }, { key: "subtitle", label: "Subtitle", type: "text" }],
    defaults: { title: "UP NEXT", subtitle: "The Sports Hour — 8:00 PM" },
    Render: ({ data, theme }) => (
      <div style={abs({ inset: 0, background: `radial-gradient(circle at 30% 40%, ${theme.primary}, ${theme.secondary})`, fontFamily: theme.font, color: theme.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" })}>
        <div style={{ fontSize: 200, fontWeight: 800, letterSpacing: 10 }}>{data["title"]}</div>
        <div style={{ fontSize: 60, color: theme.accent }}>{data["subtitle"]}</div>
      </div>
    ),
  },
  {
    id: "credits", name: "End Credits", category: "General", layer: "full", durationSec: 0,
    fields: [{ key: "title", label: "Title", type: "text" }, { key: "lines", label: "Role — Name (one per line)", type: "textarea" }, { key: "speed", label: "Roll seconds", type: "number" }],
    defaults: { title: "CAMPUS TV", lines: "Producer — Grace Njeri\nDirector — Kevin Ouma\nGraphics — Faith Akinyi\nCamera — Daniel Kiprop\nSound — Lucy Mwende", speed: "20" },
    Render: ({ data, theme }) => (
      <div style={abs({ inset: 0, background: theme.secondary, overflow: "hidden", fontFamily: theme.font, color: theme.text })}>
        <div style={{ textAlign: "center", animation: `gfx-roll ${Number(data["speed"]) || 20}s linear infinite` }}>
          <div style={{ fontSize: 90, fontWeight: 800, color: theme.accent, marginBottom: 80 }}>{data["title"]}</div>
          {lines(data["lines"]).map((l, i) => {
            const [r, n] = l.split("—").map((s) => s.trim());
            return (<div key={i} style={{ marginBottom: 50 }}><div style={{ fontSize: 34, opacity: 0.7 }}>{r}</div><div style={{ fontSize: 56, fontWeight: 700 }}>{n}</div></div>);
          })}
        </div>
      </div>
    ),
  },
];

export const getTemplate = (id: string) => TEMPLATES.find((t) => t.id === id);

export const THEME_PRESETS: { name: string; theme: Theme }[] = [
  { name: "Modern News", theme: { primary: "#0b4fa8", secondary: "#0a1628", accent: "#f5b700", text: "#ffffff", font: "Barlow Condensed" } },
  { name: "University TV", theme: { primary: "#7a1f2b", secondary: "#1b1414", accent: "#e8c766", text: "#ffffff", font: "Archivo" } },
  { name: "Sports", theme: { primary: "#0f8a4a", secondary: "#0b130f", accent: "#d7ff3a", text: "#ffffff", font: "Barlow Condensed" } },
  { name: "Corporate", theme: { primary: "#2f3b4c", secondary: "#f4f5f7", accent: "#00a3a3", text: "#13202f", font: "IBM Plex Sans" } },
  { name: "Event", theme: { primary: "#c2410c", secondary: "#140b07", accent: "#fde68a", text: "#ffffff", font: "Fraunces" } },
];
export const FONTS = ["Barlow Condensed", "Archivo", "IBM Plex Sans", "Fraunces", "JetBrains Mono"];

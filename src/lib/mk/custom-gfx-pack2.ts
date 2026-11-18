// Pack 2: 10 more TV / production graphics (1920 x 1080). Same rules as pack 1: `field` = editable from the live panel.
import { makeEl } from "./custom-gfx";
import type { CustomEl } from "./types";

type O = Partial<CustomEl>;
const R = (name: string, x: number, y: number, w: number, h: number, fill: string, o: O = {}) => makeEl("rect", { name, x, y, w, h, fill, ...o });
const E = (name: string, x: number, y: number, w: number, h: number, fill: string, o: O = {}) => makeEl("ellipse", { name, x, y, w, h, fill, ...o });
const T = (name: string, field: string, x: number, y: number, w: number, h: number, text: string, fontSize: number, o: O = {}) =>
  makeEl("text", { name, field, x, y, w, h, text, fontSize, ...o });
const DARK = "#0b1220";

function developing(): CustomEl[] {
  const AMB = "#f59e0b";
  return [
    R("Bar", 0, 840, 1920, 150, DARK, { anim: "up", animMs: 450, shadow: 24 }),
    R("Tag", 0, 840, 520, 150, AMB, { slant: -40, anim: "left", delay: 100 }),
    E("Dot", 40, 897, 36, 36, DARK, { anim: "scale", delay: 400, loop: "blink", loopMs: 1000 }),
    T("Tag text", "Tag", 90, 840, 390, 150, "DEVELOPING", 50, { weight: 700, color: DARK, upper: true, anim: "fade", delay: 450 }),
    T("Headline", "Headline", 560, 852, 1320, 76, "Police respond to incident in city centre", 62, { weight: 700, anim: "up", delay: 500 }),
    T("Detail", "Detail", 560, 926, 1320, 52, "More details expected shortly", 36, { weight: 500, color: "#c9d3e6", anim: "up", delay: 580 }),
  ];
}
function replay(): CustomEl[] {
  const ACC = "#38bdf8";
  return [
    R("Tag", 80, 60, 300, 80, ACC, { slant: 30, anim: "left", animMs: 400 }),
    T("Tag text", "Tag", 80, 60, 300, 80, "REPLAY", 52, { weight: 700, color: DARK, align: "center", upper: true, spacing: 4, anim: "fade", delay: 300, loop: "pulse", loopMs: 1800 }),
    R("Sub", 380, 80, 320, 60, DARK, { slant: 30, anim: "left", delay: 150, opacity: 92 }),
    T("Sub text", "Detail", 400, 80, 290, 60, "67' Goal", 36, { weight: 600, align: "center", anim: "fade", delay: 400 }),
  ];
}
function flagBug(): CustomEl[] {
  return [
    R("Pill", 1560, 60, 300, 76, DARK, { radius: 38, anim: "right", animMs: 450, shadow: 20 }),
    R("Flag black", 1572, 74, 72, 14, "#111111", { anim: "fade", delay: 300 }),
    R("Flag red", 1572, 88, 72, 14, "#bb0000", { anim: "fade", delay: 300 }),
    R("Flag green", 1572, 102, 72, 14, "#007a3d", { anim: "fade", delay: 300 }),
    T("Country", "Country", 1660, 60, 190, 76, "KENYA", 46, { weight: 700, upper: true, anim: "fade", delay: 400 }),
  ];
}
function socialPost(): CustomEl[] {
  const ACC = "#1d9bf0";
  return [
    R("Card", 140, 330, 900, 420, "#ffffff", { radius: 18, anim: "left", animMs: 500, shadow: 40 }),
    E("Avatar", 180, 365, 90, 90, ACC, { anim: "scale", delay: 250 }),
    T("Name", "Name", 290, 362, 700, 52, "Citizen Voice", 44, { weight: 700, color: DARK, anim: "fade", delay: 350 }),
    T("Handle", "Handle", 290, 410, 700, 44, "@citizenvoice", 32, { weight: 400, color: "#64748b", anim: "fade", delay: 400 }),
    T("Post line 1", "Post line 1", 180, 490, 820, 70, "Traffic is building on Mombasa Road", 42, { weight: 500, color: DARK, anim: "up", delay: 450 }),
    T("Post line 2", "Post line 2", 180, 556, 820, 70, "after the morning accident. Avoid if you can.", 42, { weight: 500, color: DARK, anim: "up", delay: 520 }),
    R("Rule", 180, 680, 820, 3, "#e2e8f0", { anim: "wipe", delay: 600 }),
    T("Meta", "Meta", 180, 690, 820, 44, "8:05 AM  •  18 Nov 2026", 30, { weight: 400, color: "#64748b", anim: "fade", delay: 650 }),
  ];
}
function poll(): CustomEl[] {
  const ACC = "#f97316";
  const opt = (i: number, label: string, pct: string, w: number): CustomEl[] => {
    const y = 470 + i * 120;
    const d = 300 + i * 150;
    return [
      R(`Option ${i + 1} track`, 160, y, 1000, 90, "#1c2a44", { radius: 10, anim: "left", delay: d }),
      R(`Option ${i + 1} bar`, 160, y, w, 90, ACC, { radius: 10, anim: "wipe", animMs: 900, delay: d + 200 }),
      T(`Option ${i + 1} label`, `Option ${i + 1}`, 190, y, 700, 90, label, 46, { weight: 600, anim: "fade", delay: d + 300 }),
      T(`Option ${i + 1} percent`, `Option ${i + 1} %`, 980, y, 160, 90, pct, 52, { weight: 700, align: "right", anim: "fade", delay: d + 400 }),
    ];
  };
  return [
    R("Panel", 120, 250, 1080, 650, DARK, { radius: 18, anim: "fade", shadow: 40, opacity: 96 }),
    T("Tag", "Tag", 160, 270, 1000, 50, "VIEWERS' POLL", 34, { weight: 700, color: ACC, upper: true, spacing: 6, anim: "fade", delay: 200 }),
    T("Question", "Question", 160, 330, 1000, 110, "Should school fees be reduced?", 72, { weight: 700, anim: "up", delay: 250 }),
    ...opt(0, "Yes", "62%", 620),
    ...opt(1, "No", "28%", 280),
    ...opt(2, "Not sure", "10%", 190),
  ];
}
function countdown(): CustomEl[] {
  const ACC = "#ef4444";
  const box = (i: number, v: string, l: string): CustomEl[] => {
    const x = 560 + i * 270;
    return [
      R(`${l} box`, x, 400, 230, 260, DARK, { radius: 16, anim: "scale", delay: i * 120, shadow: 30 }),
      T(`${l} value`, l, x, 420, 230, 170, v, 150, { weight: 700, align: "center", anim: "fade", delay: i * 120 + 300 }),
      T(`${l} label`, "", x, 590, 230, 50, l, 30, { weight: 600, align: "center", color: "#9fb0d0", upper: true, spacing: 5, anim: "fade", delay: i * 120 + 350 }),
    ];
  };
  return [
    R("Backdrop", 0, 0, 1920, 1080, "#0b1220", { fill2: "#2a0f14", angle: 160, anim: "fade", animMs: 500 }),
    T("Title", "Title", 160, 260, 1600, 100, "WE GO LIVE IN", 80, { weight: 700, align: "center", upper: true, spacing: 8, color: ACC, anim: "down", delay: 200 }),
    ...box(0, "00", "Hours"),
    ...box(1, "04", "Minutes"),
    ...box(2, "59", "Seconds"),
    T("Show", "Show", 160, 720, 1600, 80, "The Evening News", 60, { weight: 500, align: "center", color: "#c9d3e6", anim: "up", delay: 800 }),
  ];
}
function reporter(): CustomEl[] {
  const ACC = "#e5322d";
  return [
    R("Panel", 120, 850, 1000, 130, DARK, { anim: "wipe", animMs: 500, shadow: 24 }),
    R("Location tag", 120, 850, 1000, 42, ACC, { anim: "wipe", delay: 100 }),
    T("Location", "Location", 145, 850, 950, 42, "LIVE FROM MOMBASA", 28, { weight: 700, upper: true, spacing: 4, anim: "fade", delay: 400 }),
    T("Name", "Name", 145, 892, 950, 52, "Faith Mwende", 44, { weight: 700, anim: "up", delay: 450 }),
    T("Role", "Role", 145, 938, 950, 38, "Correspondent", 28, { weight: 400, color: "#c9d3e6", anim: "up", delay: 520 }),
  ];
}
function headToHead(): CustomEl[] {
  const A = "#c8102e";
  const B = "#0057b8";
  const row = (i: number, a: string, label: string, b: string): CustomEl[] => {
    const y = 470 + i * 100;
    const d = 400 + i * 120;
    return [
      R(`Row ${i + 1}`, 360, y, 1200, 84, i % 2 ? "#16223a" : "#1c2a44", { anim: "wipe", delay: d }),
      T(`A ${label}`, `A stat ${i + 1}`, 380, y, 240, 84, a, 54, { weight: 700, anim: "fade", delay: d + 200 }),
      T(`Label ${i + 1}`, `Stat ${i + 1} label`, 620, y, 680, 84, label, 38, { weight: 600, align: "center", color: "#c9d3e6", upper: true, spacing: 3, anim: "fade", delay: d + 200 }),
      T(`B ${label}`, `B stat ${i + 1}`, 1300, y, 240, 84, b, 54, { weight: 700, align: "right", anim: "fade", delay: d + 200 }),
    ];
  };
  return [
    R("Header", 360, 330, 1200, 130, DARK, { anim: "down", animMs: 450 }),
    R("A colour", 360, 330, 20, 130, A, { anim: "down" }),
    R("B colour", 1540, 330, 20, 130, B, { anim: "down" }),
    T("Team A", "Team A", 400, 330, 500, 130, "GOR", 80, { weight: 700, upper: true, anim: "left", delay: 200 }),
    T("vs", "", 860, 330, 200, 130, "VS", 56, { weight: 600, align: "center", color: "#f2b01e", anim: "scale", delay: 300 }),
    T("Team B", "Team B", 1020, 330, 500, 130, "AFC", 80, { weight: 700, upper: true, align: "right", anim: "right", delay: 200 }),
    ...row(0, "58%", "Possession", "42%"),
    ...row(1, "14", "Shots", "9"),
    ...row(2, "6", "On target", "3"),
  ];
}
function topFive(): CustomEl[] {
  const ACC = "#eab308";
  const names = ["Item number one", "Item number two", "Item number three", "Item number four", "Item number five"];
  const rows = names.flatMap((n, i): CustomEl[] => {
    const y = 270 + i * 110;
    const d = 300 + i * 130;
    return [
      R(`Row ${i + 1}`, 1000, y, 800, 94, DARK, { anim: "right", delay: d, opacity: 95 }),
      R(`Num ${i + 1} box`, 1000, y, 94, 94, ACC, { anim: "right", delay: d }),
      T(`Num ${i + 1}`, "", 1000, y, 94, 94, String(i + 1), 64, { weight: 700, color: DARK, align: "center", anim: "fade", delay: d + 250 }),
      T(`Item ${i + 1}`, `Item ${i + 1}`, 1120, y, 660, 94, n, 48, { weight: 600, anim: "fade", delay: d + 300 }),
    ];
  });
  return [
    R("Title bar", 1000, 170, 800, 90, ACC, { anim: "down", animMs: 400 }),
    T("Title", "Title", 1030, 170, 740, 90, "TOP 5 OF THE WEEK", 52, { weight: 700, color: DARK, upper: true, spacing: 3, anim: "fade", delay: 250 }),
    ...rows,
  ];
}
function standBy(): CustomEl[] {
  const ACC = "#f59e0b";
  return [
    R("Backdrop", 0, 0, 1920, 1080, "#0b1220", { fill2: "#1c1a0b", angle: 150, anim: "fade", animMs: 400 }),
    E("Warning ring", 810, 220, 300, 300, ACC, { opacity: 25, anim: "scale", loop: "pulse", loopMs: 2200 }),
    T("Icon", "", 810, 220, 300, 300, "!", 220, { weight: 700, align: "center", color: ACC, anim: "scale", delay: 250 }),
    T("Heading", "Heading", 160, 560, 1600, 130, "Please stand by", 110, { weight: 700, align: "center", upper: true, anim: "up", delay: 400 }),
    T("Message", "Message", 160, 700, 1600, 70, "We are experiencing technical difficulties", 48, { weight: 500, align: "center", color: "#c9d3e6", anim: "fade", delay: 600 }),
    T("Back soon", "Back soon", 160, 790, 1600, 60, "We will be back shortly", 38, { weight: 500, align: "center", color: ACC, anim: "fade", delay: 700 }),
  ];
}

export const PACK2_TEMPLATES: { id: string; label: string; build: () => CustomEl[] }[] = [
  { id: "p21-developing", label: "21 Developing story strap", build: developing },
  { id: "p22-replay", label: "22 Replay tag", build: replay },
  { id: "p23-flag", label: "23 Country / flag bug", build: flagBug },
  { id: "p24-social-post", label: "24 Social post card", build: socialPost },
  { id: "p25-poll", label: "25 Viewers' poll (3 options)", build: poll },
  { id: "p26-countdown", label: "26 Countdown to live (full screen)", build: countdown },
  { id: "p27-reporter", label: "27 Reporter on location", build: reporter },
  { id: "p28-headtohead", label: "28 Head-to-head stats", build: headToHead },
  { id: "p29-top5", label: "29 Top 5 list", build: topFive },
  { id: "p30-standby", label: "30 Please stand by (full screen)", build: standBy },
];

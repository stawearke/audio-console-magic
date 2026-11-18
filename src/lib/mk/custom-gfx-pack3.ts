// Pack 3: 10 advanced TV graphics (1920 x 1080) using gradients, keyframes and looping motion.
// `field` = editable from the live panel. Colours are set at the top of each builder.
import { makeEl, newElId } from "./custom-gfx";
import type { CustomEl, CustomKey } from "./types";

type O = Partial<CustomEl>;
const R = (name: string, x: number, y: number, w: number, h: number, fill: string, o: O = {}) => makeEl("rect", { name, x, y, w, h, fill, ...o });
const E = (name: string, x: number, y: number, w: number, h: number, fill: string, o: O = {}) => makeEl("ellipse", { name, x, y, w, h, fill, ...o });
const T = (name: string, field: string, x: number, y: number, w: number, h: number, text: string, fontSize: number, o: O = {}) =>
  makeEl("text", { name, field, x, y, w, h, text, fontSize, ...o });
const IMG = (name: string, field: string, x: number, y: number, w: number, h: number, o: O = {}) => makeEl("image", { name, field, x, y, w, h, ...o });
const K = (t: number, dx = 0, opacity = 100, dy = 0, scale = 100, ease: CustomKey["ease"] = "inout"): CustomKey => ({ id: newElId(), t, dx, dy, scale, rot: 0, opacity, ease });
const DARK = "#0b1220";

/** A soft light band that sweeps across a bar every few seconds. */
const shine = (x: number, y: number, w: number, h: number, delay = 900): CustomEl =>
  R("Shine sweep", x, y, 120, h, "#ffffff", { slant: 50, opacity: 45, anim: "none", keys: [K(0, 0, 0), K(delay, 0, 0), K(delay + 700, w - 120, 70), K(delay + 1400, w - 120, 0), K(delay + 4200, w - 120, 0)], kfLoop: true });

function premiumLower(): CustomEl[] {
  const GOLD = "#e0b04a";
  return [
    R("Shadow glow", 110, 850, 1000, 150, "#000000", { opacity: 40, radius: 20, shadow: 60, anim: "fade" }),
    R("Gold edge", 120, 840, 980, 150, GOLD, { fill2: "#fff1c1", angle: 90, slant: 40, anim: "left", animMs: 500 }),
    R("Body", 128, 846, 964, 138, DARK, { fill2: "#1d2c4d", angle: 100, slant: 40, anim: "left", animMs: 500, delay: 100 }),
    shine(128, 846, 964, 138, 1100),
    T("Name", "Name", 220, 850, 800, 76, "NJERI KAMAU", 64, { weight: 700, upper: true, spacing: 3, anim: "up", delay: 400, shadow: 8 }),
    R("Divider", 220, 926, 340, 4, GOLD, { anim: "wipe", delay: 600 }),
    T("Role", "Role", 220, 932, 800, 46, "Senior Political Correspondent", 32, { weight: 500, color: "#f3dca0", anim: "up", delay: 650 }),
  ];
}

function resultsBoard(): CustomEl[] {
  const cols = ["#2563eb", "#dc2626", "#16a34a", "#9333ea"];
  const data: [string, string, number][] = [["Candidate A", "41%", 820], ["Candidate B", "34%", 680], ["Candidate C", "17%", 340], ["Candidate D", "8%", 160]];
  const rows = data.flatMap(([n, p, w], i): CustomEl[] => {
    const y = 330 + i * 130;
    const d = 300 + i * 160;
    const c = cols[i]!;
    return [
      R(`Row ${i + 1}`, 220, y, 1480, 112, "#111b30", { radius: 10, anim: "left", delay: d }),
      R(`Row ${i + 1} colour`, 220, y, 18, 112, c, { anim: "left", delay: d }),
      T(`Name ${i + 1}`, `Candidate ${i + 1}`, 265, y + 6, 520, 60, n, 48, { weight: 700, upper: true, anim: "fade", delay: d + 300 }),
      R(`Bar ${i + 1}`, 265, y + 70, w, 24, c, { fill2: "#ffffff", angle: 90, radius: 4, anim: "wipe", animMs: 1000, delay: d + 400 }),
      T(`Percent ${i + 1}`, `Percent ${i + 1}`, 1480, y, 190, 112, p, 76, { weight: 700, align: "right", anim: "scale", delay: d + 600 }),
    ];
  });
  return [
    R("Backdrop", 0, 0, 1920, 1080, "#070d1a", { fill2: "#13213d", angle: 150, opacity: 94, anim: "fade", animMs: 500 }),
    R("Title bar", 220, 170, 1480, 120, "#f2b01e", { anim: "down", animMs: 450 }),
    T("Title", "Title", 255, 170, 1100, 120, "GOVERNOR  •  NAIROBI COUNTY", 56, { weight: 700, color: DARK, anim: "fade", delay: 300 }),
    T("Counted", "Counted", 1260, 170, 410, 120, "74% COUNTED", 44, { weight: 700, color: DARK, align: "right", anim: "fade", delay: 350, loop: "pulse", loopMs: 2400 }),
    ...rows,
  ];
}

function showStinger(): CustomEl[] {
  const A = "#e5322d";
  const B = "#f59e0b";
  const wipe = (n: string, y: number, h: number, fill: string, d: number): CustomEl =>
    R(n, 0, y, 1920, h, fill, { anim: "none", keys: [K(d, -1920, 100, 0, 100, "out"), K(d + 500, 0, 100, 0, 100, "out"), K(d + 1900, 0, 100), K(d + 2400, 1920, 100, 0, 100, "in")] });
  return [
    wipe("Wipe 1", 0, 360, A, 0),
    wipe("Wipe 2", 360, 360, "#ffffff", 120),
    wipe("Wipe 3", 720, 360, B, 240),
    R("Dark panel", 0, 300, 1920, 480, DARK, { anim: "none", keys: [K(0, 0, 0), K(700, 0, 0), K(1000, 0, 100), K(2400, 0, 100), K(2800, 0, 0)] }),
    IMG("Show logo", "Show logo", 760, 330, 400, 260, { anim: "none", keys: [K(0, 0, 0, 0, 60), K(1000, 0, 0, 0, 60), K(1500, 0, 100, 0, 100, "back"), K(2400, 0, 100), K(2800, 0, 0)] }),
    T("Show title", "Show title", 160, 600, 1600, 130, "THE EVENING NEWS", 110, { weight: 700, align: "center", upper: true, spacing: 8, anim: "none", keys: [K(0, 0, 0, 80), K(1200, 0, 0, 80), K(1700, 0, 100, 0, 100, "out"), K(2400, 0, 100), K(2800, 0, 0)] }),
  ];
}

function goalAlert(): CustomEl[] {
  const GREEN = "#22c55e";
  return [
    E("Burst", 760, 150, 400, 400, GREEN, { opacity: 22, anim: "scale", animMs: 500, loop: "pulse", loopMs: 1200 }),
    R("Banner", 360, 390, 1200, 220, DARK, { fill2: "#0f2f1e", angle: 100, slant: 60, anim: "scale", animMs: 400, shadow: 50 }),
    R("Banner edge", 360, 380, 1200, 10, GREEN, { slant: 60, anim: "wipe", delay: 200 }),
    T("Alert", "Alert", 380, 395, 1160, 130, "GOAL!", 140, { weight: 700, align: "center", upper: true, color: GREEN, spacing: 10, anim: "scale", animMs: 450, delay: 150, loop: "pulse", loopMs: 1000 }),
    T("Scorer", "Scorer", 380, 520, 1160, 72, "Olunga  67'", 54, { weight: 600, align: "center", anim: "up", delay: 500 }),
  ];
}

function playerCard(): CustomEl[] {
  const ACC = "#38bdf8";
  const stat = (i: number, v: string, l: string): CustomEl[] => {
    const x = 520 + i * 250;
    return [
      T(`Stat ${i + 1} value`, `Stat ${i + 1}`, x, 640, 220, 100, v, 84, { weight: 700, align: "center", color: ACC, anim: "up", delay: 600 + i * 120 }),
      T(`Stat ${i + 1} label`, `Stat ${i + 1} label`, x, 735, 220, 40, l, 26, { weight: 600, align: "center", color: "#9fb0d0", upper: true, spacing: 4, anim: "fade", delay: 700 + i * 120 }),
    ];
  };
  return [
    R("Card", 160, 280, 1000, 520, DARK, { fill2: "#16223a", angle: 120, radius: 20, anim: "left", animMs: 500, shadow: 50 }),
    R("Photo frame", 190, 310, 300, 460, "#1d2c4d", { radius: 14, anim: "left", delay: 150 }),
    IMG("Player photo", "Player photo", 190, 310, 300, 460, { anim: "fade", delay: 450 }),
    R("Accent", 520, 310, 8, 120, ACC, { anim: "scale", delay: 400 }),
    T("Number", "Number", 560, 300, 200, 140, "9", 130, { weight: 700, color: ACC, anim: "scale", delay: 450 }),
    T("Name", "Name", 520, 440, 620, 80, "MICHAEL OLUNGA", 62, { weight: 700, upper: true, anim: "up", delay: 500 }),
    T("Position", "Position", 520, 520, 620, 50, "Striker  •  Gor Mahia", 34, { weight: 500, color: "#c9d3e6", anim: "up", delay: 550 }),
    R("Line", 520, 600, 620, 3, "#2b3a5c", { anim: "wipe", delay: 550 }),
    ...stat(0, "14", "Goals"),
    ...stat(1, "6", "Assists"),
    ...stat(2, "23", "Games"),
  ];
}

function interviewSplit(): CustomEl[] {
  const A = "#e5322d";
  const B = "#38bdf8";
  const side = (n: string, x: number, col: string, name: string, role: string, right: boolean): CustomEl[] => [
    R(`${n} panel`, x, 860, 700, 120, DARK, { slant: right ? -30 : 30, anim: right ? "right" : "left", animMs: 450, shadow: 24 }),
    R(`${n} accent`, x, 972, 700, 8, col, { slant: right ? -30 : 30, anim: "wipe", delay: 300 }),
    T(`${n} name`, `${n} name`, x + 40, 866, 620, 62, name, 48, { weight: 700, upper: true, align: right ? "right" : "left", anim: "fade", delay: 350 }),
    T(`${n} role`, `${n} role`, x + 40, 922, 620, 44, role, 30, { weight: 500, color: "#9fb0d0", align: right ? "right" : "left", anim: "fade", delay: 420 }),
  ];
  return [
    ...side("Left", 90, A, "Host Name", "Presenter", false),
    ...side("Right", 1130, B, "Guest Name", "Guest title", true),
    E("Centre dot", 934, 900, 52, 52, "#f2b01e", { anim: "scale", delay: 500, loop: "pulse", loopMs: 1800 }),
    T("Centre text", "", 934, 900, 52, 52, "VS", 22, { weight: 700, color: DARK, align: "center", anim: "fade", delay: 600 }),
  ];
}

function alertBanner(): CustomEl[] {
  const RED = "#ef4444";
  return [
    R("Top glow", 0, 0, 1920, 18, RED, { anim: "down", loop: "blink", loopMs: 900 }),
    R("Bottom glow", 0, 1062, 1920, 18, RED, { anim: "up", loop: "blink", loopMs: 900 }),
    R("Banner", 0, 300, 1920, 360, "#7f1d1d", { fill2: "#1a0606", angle: 90, anim: "scale", animMs: 350, shadow: 60, opacity: 96 }),
    E("Icon", 160, 380, 200, 200, RED, { anim: "scale", delay: 200, loop: "pulse", loopMs: 900 }),
    T("Icon mark", "", 160, 380, 200, 200, "!", 150, { weight: 700, align: "center", anim: "fade", delay: 300 }),
    T("Heading", "Heading", 410, 330, 1400, 140, "WEATHER ALERT", 120, { weight: 700, upper: true, spacing: 6, anim: "left", delay: 300 }),
    T("Message", "Message", 410, 470, 1400, 70, "Heavy rainfall expected across Western Kenya", 52, { weight: 600, anim: "up", delay: 500 }),
    T("Advice", "Advice", 410, 548, 1400, 60, "Avoid river crossings. Stay indoors tonight.", 40, { weight: 400, color: "#fecaca", anim: "up", delay: 600 }),
  ];
}

function scheduleBoard(): CustomEl[] {
  const ACC = "#14b8a6";
  const items: [string, string][] = [["06:00", "Morning Show"], ["09:00", "Business Today"], ["12:00", "Midday News"], ["15:00", "Sports Zone"], ["19:00", "Prime News"]];
  const rows = items.flatMap(([t, n], i): CustomEl[] => {
    const y = 290 + i * 110;
    const d = 250 + i * 130;
    return [
      R(`Row ${i + 1}`, 560, y, 800, 94, i === 0 ? "#134e4a" : "#111b30", { anim: "up", delay: d }),
      R(`Time ${i + 1} box`, 560, y, 180, 94, ACC, { anim: "up", delay: d }),
      T(`Time ${i + 1}`, `Time ${i + 1}`, 560, y, 180, 94, t, 54, { weight: 700, color: DARK, align: "center", anim: "fade", delay: d + 250 }),
      T(`Show ${i + 1}`, `Show ${i + 1}`, 770, y, 570, 94, n, 52, { weight: 600, anim: "fade", delay: d + 300 }),
    ];
  });
  return [
    R("Backdrop", 0, 0, 1920, 1080, "#070d1a", { fill2: "#0f2a2e", angle: 150, opacity: 94, anim: "fade" }),
    R("Header", 560, 160, 800, 110, ACC, { anim: "down", animMs: 400 }),
    T("Header text", "Header", 590, 160, 740, 110, "TODAY ON OUR CHANNEL", 48, { weight: 700, color: DARK, upper: true, spacing: 3, anim: "fade", delay: 250 }),
    ...rows,
  ];
}

function marketBoard(): CustomEl[] {
  const UP = "#22c55e";
  const DOWN = "#ef4444";
  const items: [string, string, string, boolean][] = [["USD / KES", "129.40", "+0.12%", true], ["EUR / KES", "140.85", "-0.08%", false], ["NSE 20", "2,014.6", "+0.45%", true], ["BRENT", "$84.20", "-0.30%", false]];
  const rows = items.flatMap(([n, v, c, up], i): CustomEl[] => {
    const y = 360 + i * 110;
    const d = 250 + i * 130;
    const col = up ? UP : DOWN;
    return [
      R(`Row ${i + 1}`, 1060, y, 760, 94, "#111b30", { anim: "right", delay: d }),
      R(`Row ${i + 1} marker`, 1060, y, 12, 94, col, { anim: "right", delay: d }),
      T(`Name ${i + 1}`, `Name ${i + 1}`, 1100, y, 280, 94, n, 44, { weight: 600, color: "#c9d3e6", anim: "fade", delay: d + 250 }),
      T(`Value ${i + 1}`, `Value ${i + 1}`, 1380, y, 230, 94, v, 52, { weight: 700, align: "right", anim: "fade", delay: d + 300 }),
      T(`Change ${i + 1}`, `Change ${i + 1}`, 1620, y, 180, 94, (up ? "▲ " : "▼ ") + c, 34, { weight: 700, color: col, align: "right", anim: "fade", delay: d + 350 }),
    ];
  });
  return [
    R("Header", 1060, 250, 760, 100, "#f2b01e", { anim: "down", animMs: 400 }),
    T("Header text", "Header", 1090, 250, 700, 100, "MARKETS", 56, { weight: 700, color: DARK, upper: true, spacing: 6, anim: "fade", delay: 250 }),
    ...rows,
  ];
}

function nowPlaying(): CustomEl[] {
  const ACC = "#ec4899";
  const bars = [0, 1, 2, 3, 4].map((i) => R(`EQ bar ${i + 1}`, 790 + i * 22, 905 + (i % 2 ? 6 : 0), 14, 56 - (i % 2 ? 12 : 0), ACC, { radius: 3, anim: "up", delay: 300 + i * 60, loop: "pulse", loopMs: 600 + i * 170 }));
  return [
    R("Pill", 100, 870, 800, 130, DARK, { fill2: "#2a1030", angle: 100, radius: 20, anim: "left", animMs: 500, shadow: 40 }),
    R("Art frame", 118, 888, 94, 94, ACC, { radius: 12, anim: "scale", delay: 200 }),
    IMG("Cover art", "Cover art", 118, 888, 94, 94, { anim: "fade", delay: 400 }),
    ...bars,
    T("Label", "Label", 240, 880, 420, 36, "NOW PLAYING", 24, { weight: 700, color: ACC, upper: true, spacing: 6, anim: "fade", delay: 450 }),
    T("Song", "Song", 240, 912, 530, 54, "Song Title Here", 44, { weight: 700, anim: "up", delay: 500 }),
    T("Artist", "Artist", 240, 958, 530, 38, "Artist Name", 30, { weight: 400, color: "#e9b8d6", anim: "up", delay: 560 }),
  ];
}

export const PACK3_TEMPLATES: { id: string; label: string; build: () => CustomEl[] }[] = [
  { id: "p31-premium-lower", label: "31 Premium lower third (gold + shine)", build: premiumLower },
  { id: "p32-results-board", label: "32 Election results board (4 candidates)", build: resultsBoard },
  { id: "p33-stinger", label: "33 Show opener stinger (animated, with logo)", build: showStinger },
  { id: "p34-goal-alert", label: "34 GOAL alert burst", build: goalAlert },
  { id: "p35-player-card", label: "35 Player card (photo + 3 stats)", build: playerCard },
  { id: "p36-interview", label: "36 Interview split (host vs guest)", build: interviewSplit },
  { id: "p37-alert", label: "37 Emergency / weather alert (full width)", build: alertBanner },
  { id: "p38-schedule", label: "38 Schedule board (5 shows)", build: scheduleBoard },
  { id: "p39-markets", label: "39 Markets board (rates + indices)", build: marketBoard },
  { id: "p40-nowplaying", label: "40 Now playing (animated equaliser)", build: nowPlaying },
];

// 20 ready-made TV / production graphics for the Custom Graphic editor (1920 x 1080).
// Every piece of text or logo with a `field` can be changed from the live panel without opening the editor.
// Colours are set once at the top of each builder, so re-branding a graphic is a one-line change.
import { makeEl } from "./custom-gfx";
import type { CustomEl } from "./types";

type O = Partial<CustomEl>;
const R = (name: string, x: number, y: number, w: number, h: number, fill: string, o: O = {}) => makeEl("rect", { name, x, y, w, h, fill, ...o });
const E = (name: string, x: number, y: number, w: number, h: number, fill: string, o: O = {}) => makeEl("ellipse", { name, x, y, w, h, fill, ...o });
const T = (name: string, field: string, x: number, y: number, w: number, h: number, text: string, fontSize: number, o: O = {}) =>
  makeEl("text", { name, field, x, y, w, h, text, fontSize, ...o });
const IMG = (name: string, field: string, x: number, y: number, w: number, h: number, o: O = {}) => makeEl("image", { name, field, x, y, w, h, ...o });

const DARK = "#0b1220";
const WHITE = "#ffffff";

// 1 ------------------------------------------------------------------ Classic lower third
function lowerClassic(): CustomEl[] {
  const ACCENT = "#e5322d";
  return [
    R("Accent bar", 120, 840, 16, 150, ACCENT, { anim: "left", animMs: 400 }),
    R("Name panel", 136, 840, 980, 90, DARK, { anim: "wipe", animMs: 500, delay: 100, shadow: 30 }),
    R("Role panel", 136, 930, 980, 60, "#1c2a44", { anim: "wipe", animMs: 500, delay: 200 }),
    T("Name", "Name", 175, 846, 920, 78, "JOHN KAMAU", 62, { weight: 700, upper: true, anim: "up", delay: 400 }),
    T("Role", "Role", 175, 934, 920, 52, "Political Analyst", 34, { weight: 500, color: "#c9d3e6", anim: "up", delay: 480 }),
  ];
}

// 2 ------------------------------------------------------------------ Slant lower third
function lowerSlant(): CustomEl[] {
  const GOLD = "#f2b01e";
  const NAVY = "#14213d";
  return [
    R("Gold slant", 100, 830, 1000, 160, GOLD, { slant: 60, anim: "left", animMs: 450, shadow: 24 }),
    R("Navy slant", 130, 842, 980, 136, NAVY, { slant: 60, anim: "left", animMs: 450, delay: 100 }),
    T("Name", "Name", 230, 850, 780, 74, "AMINA WANJIRU", 60, { weight: 700, upper: true, anim: "up", delay: 400 }),
    T("Title", "Title", 230, 922, 780, 48, "Chief Executive Officer", 34, { weight: 500, color: GOLD, anim: "up", delay: 480 }),
  ];
}

// 3 ------------------------------------------------------------------ Glass name plate
function lowerGlass(): CustomEl[] {
  return [
    R("Glass", 120, 870, 760, 120, "#ffffff", { opacity: 18, radius: 14, strokeW: 2, stroke: "#ffffff", anim: "fade", animMs: 500, shadow: 30 }),
    R("Accent line", 150, 884, 6, 92, "#38bdf8", { radius: 3, anim: "scale", delay: 200 }),
    T("Name", "Name", 180, 876, 690, 62, "Dr. Grace Atieno", 50, { weight: 700, anim: "up", delay: 300 }),
    T("Role", "Role", 180, 934, 690, 46, "Public Health Specialist", 32, { weight: 500, color: "#dbeafe", anim: "up", delay: 380 }),
  ];
}

// 4 ------------------------------------------------------------------ Breaking news
function breaking(): CustomEl[] {
  const RED = "#d90429";
  return [
    R("Bar", 0, 830, 1920, 160, DARK, { anim: "up", animMs: 450, shadow: 30 }),
    R("Red block", 0, 830, 440, 160, RED, { slant: -40, anim: "left", animMs: 450, delay: 100 }),
    T("Label", "Label", 30, 830, 350, 160, "BREAKING", 62, { weight: 700, align: "center", upper: true, spacing: 2, anim: "fade", delay: 450, loop: "pulse", loopMs: 1600 }),
    T("Headline", "Headline", 480, 846, 1400, 78, "Parliament passes landmark finance bill", 64, { weight: 700, anim: "up", delay: 500 }),
    T("Sub headline", "Sub headline", 480, 922, 1400, 52, "Full reaction and analysis after the break", 36, { weight: 500, color: "#c9d3e6", anim: "up", delay: 580 }),
  ];
}

// 5 ------------------------------------------------------------------ Live + location
function liveLocation(): CustomEl[] {
  return [
    R("LIVE block", 80, 60, 170, 64, "#e5322d", { radius: 6, anim: "down", animMs: 400 }),
    E("Dot", 98, 82, 20, 20, WHITE, { anim: "scale", delay: 300, loop: "blink", loopMs: 1000 }),
    T("LIVE", "Live tag", 126, 60, 118, 64, "LIVE", 42, { weight: 700, upper: true, anim: "fade", delay: 300 }),
    R("Location block", 250, 60, 460, 64, DARK, { radius: 6, anim: "left", animMs: 450, delay: 150, opacity: 92 }),
    T("Location", "Location", 270, 60, 430, 64, "Nairobi, Kenya", 38, { weight: 600, upper: true, anim: "fade", delay: 500 }),
  ];
}

// 6 ------------------------------------------------------------------ Headline strap + ticker
function tickerStrap(): CustomEl[] {
  const BLUE = "#0a4d8c";
  return [
    R("Bar", 0, 990, 1920, 90, DARK, { anim: "up", animMs: 400 }),
    R("Label block", 0, 990, 300, 90, BLUE, { slant: -30, anim: "left", delay: 100 }),
    T("Label", "Label", 0, 990, 280, 90, "NEWS", 46, { weight: 700, align: "center", upper: true, anim: "fade", delay: 400 }),
    T("Headline", "Headline", 340, 990, 1260, 90, "Fuel prices drop for the second month running", 46, { weight: 600, anim: "up", delay: 450 }),
    R("Clock block", 1640, 990, 280, 90, "#1c2a44", { slant: 30, anim: "right", delay: 100 }),
    T("Time", "Time", 1650, 990, 250, 90, "20:00 EAT", 42, { weight: 700, align: "center", color: "#f2b01e", anim: "fade", delay: 450 }),
  ];
}

// 7 ------------------------------------------------------------------ Scorebug
function scorebug(): CustomEl[] {
  const A = "#c8102e";
  const B = "#0057b8";
  return [
    R("Back", 70, 50, 780, 84, DARK, { radius: 8, anim: "left", animMs: 450, shadow: 24 }),
    R("Team A colour", 70, 50, 14, 84, A, { anim: "left", delay: 100 }),
    T("Team A", "Team A", 100, 50, 190, 84, "GOR", 46, { weight: 700, upper: true, anim: "fade", delay: 400 }),
    R("Score A box", 290, 62, 80, 60, WHITE, { radius: 6, anim: "scale", delay: 450 }),
    T("Score A", "Score A", 290, 62, 80, 60, "2", 46, { weight: 700, color: DARK, align: "center", anim: "fade", delay: 500 }),
    R("Score B box", 385, 62, 80, 60, WHITE, { radius: 6, anim: "scale", delay: 450 }),
    T("Score B", "Score B", 385, 62, 80, 60, "1", 46, { weight: 700, color: DARK, align: "center", anim: "fade", delay: 500 }),
    T("Team B", "Team B", 480, 50, 190, 84, "AFC", 46, { weight: 700, upper: true, align: "right", anim: "fade", delay: 400 }),
    R("Team B colour", 836, 50, 14, 84, B, { anim: "right", delay: 100 }),
    T("Match time", "Match time", 680, 50, 140, 84, "67'", 44, { weight: 700, align: "center", color: "#f2b01e", anim: "fade", delay: 550 }),
  ];
}

// 8 ------------------------------------------------------------------ Full-time result
function fullTime(): CustomEl[] {
  const GREEN = "#16a34a";
  return [
    R("Panel", 460, 380, 1000, 320, DARK, { radius: 16, anim: "scale", animMs: 450, shadow: 40, opacity: 96 }),
    R("Top band", 460, 380, 1000, 70, GREEN, { radius: 16, anim: "wipe", delay: 150 }),
    T("Heading", "Heading", 460, 380, 1000, 70, "FULL TIME", 44, { weight: 700, upper: true, align: "center", spacing: 6, anim: "fade", delay: 450 }),
    T("Home", "Home team", 490, 480, 340, 120, "Gor Mahia", 56, { weight: 700, align: "right", anim: "left", delay: 400 }),
    T("Home score", "Home score", 840, 470, 100, 140, "3", 110, { weight: 700, align: "center", anim: "scale", delay: 550 }),
    T("Dash", "", 930, 470, 60, 140, "-", 90, { weight: 500, align: "center", color: "#6b7a99", anim: "fade", delay: 550 }),
    T("Away score", "Away score", 980, 470, 100, 140, "1", 110, { weight: 700, align: "center", anim: "scale", delay: 600 }),
    T("Away", "Away team", 1090, 480, 340, 120, "AFC Leopards", 56, { weight: 700, anim: "right", delay: 400 }),
    T("Competition", "Competition", 460, 625, 1000, 60, "Kenyan Premier League", 36, { weight: 500, color: "#9fb0d0", align: "center", anim: "up", delay: 700 }),
  ];
}

// 9 ------------------------------------------------------------------ Segment title card
function segmentTitle(): CustomEl[] {
  const ACC = "#f97316";
  return [
    R("Backdrop", 0, 0, 1920, 1080, "#0b1220", { fill2: "#1d2f55", angle: 135, anim: "fade", animMs: 500 }),
    R("Accent block", 160, 420, 22, 240, ACC, { anim: "scale", delay: 200 }),
    T("Kicker", "Kicker", 220, 400, 1300, 70, "THIS WEEK ON", 48, { weight: 600, color: ACC, upper: true, spacing: 10, anim: "left", delay: 300 }),
    T("Title", "Title", 220, 465, 1500, 150, "The Big Debate", 128, { weight: 700, upper: true, anim: "left", delay: 400 }),
    T("Subtitle", "Subtitle", 220, 615, 1500, 64, "Education, jobs and the future of our youth", 42, { weight: 400, color: "#c9d3e6", anim: "up", delay: 600 }),
    R("Rule", 220, 700, 400, 6, ACC, { anim: "wipe", delay: 700 }),
  ];
}

// 10 ----------------------------------------------------------------- Quote card
function quoteCard(): CustomEl[] {
  const ACC = "#38bdf8";
  return [
    R("Panel", 160, 300, 1100, 480, DARK, { radius: 16, anim: "left", animMs: 500, shadow: 40, opacity: 95 }),
    T("Quote mark", "", 200, 300, 160, 200, "“", 220, { weight: 700, color: ACC, font: "serif", anim: "scale", delay: 300 }),
    T("Quote line 1", "Quote line 1", 230, 470, 1000, 80, "Our young people are", 64, { weight: 600, anim: "up", delay: 400 }),
    T("Quote line 2", "Quote line 2", 230, 548, 1000, 80, "the nation's greatest asset.", 64, { weight: 600, anim: "up", delay: 480 }),
    R("Rule", 230, 660, 120, 5, ACC, { anim: "wipe", delay: 600 }),
    T("Speaker", "Speaker", 230, 680, 1000, 52, "Hon. Wanjiku Mwangi", 38, { weight: 700, color: ACC, upper: true, anim: "fade", delay: 650 }),
    T("Speaker role", "Speaker role", 230, 724, 1000, 40, "Cabinet Secretary, Education", 28, { weight: 400, color: "#9fb0d0", anim: "fade", delay: 700 }),
  ];
}

// 11 ----------------------------------------------------------------- Social media strap
function socialStrap(): CustomEl[] {
  const PINK = "#e1306c";
  return [
    R("Bar", 120, 900, 900, 90, DARK, { radius: 45, anim: "left", animMs: 450, shadow: 24 }),
    E("Icon circle", 126, 906, 78, 78, PINK, { anim: "scale", delay: 200 }),
    T("Icon", "", 126, 906, 78, 78, "@", 52, { weight: 700, align: "center", anim: "fade", delay: 400 }),
    T("Handle", "Handle", 225, 900, 780, 90, "@yourchannel", 52, { weight: 600, anim: "up", delay: 450 }),
    T("Call to action", "Call to action", 225, 850, 780, 44, "FOLLOW US", 28, { weight: 700, upper: true, spacing: 5, color: PINK, anim: "fade", delay: 550 }),
  ];
}

// 12 ----------------------------------------------------------------- Caller / phone-in
function caller(): CustomEl[] {
  const GREEN = "#22c55e";
  return [
    R("Panel", 120, 840, 880, 140, DARK, { radius: 12, anim: "left", animMs: 450, shadow: 24 }),
    E("Phone circle", 145, 870, 80, 80, GREEN, { anim: "scale", delay: 250, loop: "pulse", loopMs: 1400 }),
    T("Phone icon", "", 145, 870, 80, 80, "☎", 44, { weight: 700, align: "center", font: "sans", anim: "fade", delay: 400 }),
    T("Caller name", "Caller name", 250, 850, 730, 70, "Peter from Kisumu", 56, { weight: 700, anim: "up", delay: 400 }),
    T("Caller detail", "Caller detail", 250, 918, 730, 50, "ON THE LINE  •  Caller", 32, { weight: 500, color: GREEN, upper: true, spacing: 2, anim: "up", delay: 480 }),
  ];
}

// 13 ----------------------------------------------------------------- Weather card
function weather(): CustomEl[] {
  const SKY = "#0ea5e9";
  return [
    R("Card", 1360, 80, 480, 260, SKY, { fill2: "#1e3a8a", angle: 150, radius: 20, anim: "right", animMs: 500, shadow: 36 }),
    T("City", "City", 1390, 96, 420, 54, "Nairobi", 44, { weight: 700, upper: true, anim: "fade", delay: 400 }),
    E("Sun", 1400, 160, 90, 90, "#fde047", { anim: "scale", delay: 450, loop: "float", loopMs: 3000, shadow: 30 }),
    T("Temperature", "Temperature", 1510, 150, 300, 110, "24°C", 100, { weight: 700, anim: "up", delay: 500 }),
    T("Conditions", "Conditions", 1390, 262, 420, 48, "Sunny intervals", 34, { weight: 500, color: "#e0f2fe", anim: "fade", delay: 600 }),
  ];
}

// 14 ----------------------------------------------------------------- Election result (2 candidates)
function election(): CustomEl[] {
  const A = "#2563eb";
  const B = "#dc2626";
  const row = (n: string, y: number, col: string, name: string, pct: string, votes: string, barW: number, d: number): CustomEl[] => [
    R(`${n} row`, 160, y, 1100, 130, DARK, { anim: "left", delay: d, opacity: 95 }),
    R(`${n} colour`, 160, y, 20, 130, col, { anim: "left", delay: d }),
    T(`${n} name`, `${n} name`, 205, y + 8, 560, 60, name, 50, { weight: 700, upper: true, anim: "fade", delay: d + 300 }),
    R(`${n} bar`, 205, y + 82, barW, 28, col, { radius: 4, anim: "wipe", animMs: 900, delay: d + 400 }),
    T(`${n} percent`, `${n} percent`, 880, y + 6, 160, 76, pct, 62, { weight: 700, align: "right", anim: "fade", delay: d + 500 }),
    T(`${n} votes`, `${n} votes`, 1040, y + 20, 200, 50, votes, 32, { weight: 500, color: "#9fb0d0", align: "right", anim: "fade", delay: d + 500 }),
  ];
  return [
    R("Title bar", 160, 260, 1100, 80, "#f2b01e", { anim: "down", animMs: 400 }),
    T("Title", "Title", 190, 260, 1050, 80, "PRESIDENTIAL RESULTS  •  62% COUNTED", 44, { weight: 700, color: DARK, anim: "fade", delay: 300 }),
    ...row("A", 350, A, "Candidate A", "54%", "4.2M", 540, 100),
    ...row("B", 490, B, "Candidate B", "43%", "3.4M", 430, 250),
  ];
}

// 15 ----------------------------------------------------------------- Big stat
function bigStat(): CustomEl[] {
  const ACC = "#22c55e";
  return [
    R("Panel", 1060, 220, 700, 420, DARK, { radius: 16, anim: "right", animMs: 500, shadow: 40, opacity: 95 }),
    R("Accent", 1060, 220, 700, 10, ACC, { anim: "wipe", delay: 300 }),
    T("Label", "Label", 1100, 250, 620, 56, "INFLATION RATE", 38, { weight: 600, color: "#9fb0d0", upper: true, spacing: 4, anim: "fade", delay: 350 }),
    T("Number", "Number", 1100, 310, 620, 220, "6.8%", 190, { weight: 700, color: ACC, anim: "scale", animMs: 600, delay: 450 }),
    T("Context", "Context", 1100, 545, 620, 60, "Down from 7.4% last month", 34, { weight: 500, anim: "up", delay: 700 }),
  ];
}

// 16 ----------------------------------------------------------------- Coming up next
function comingUp(): CustomEl[] {
  const ACC = "#a855f7";
  return [
    R("Bar", 0, 880, 1920, 120, DARK, { anim: "up", animMs: 450, shadow: 24 }),
    R("Tag block", 0, 880, 420, 120, ACC, { slant: -36, anim: "left", delay: 100 }),
    T("Tag", "Tag", 20, 880, 360, 120, "COMING UP", 56, { weight: 700, align: "center", upper: true, spacing: 2, anim: "fade", delay: 450 }),
    T("Show", "Show", 470, 888, 1000, 64, "The Evening Debate", 54, { weight: 700, anim: "up", delay: 500 }),
    T("Description", "Description", 470, 942, 1000, 48, "Live from the studio, straight after the break", 32, { weight: 400, color: "#c9d3e6", anim: "up", delay: 580 }),
    T("Time", "Time", 1500, 880, 380, 120, "21:00", 76, { weight: 700, align: "right", color: "#f2b01e", anim: "fade", delay: 650 }),
  ];
}

// 17 ----------------------------------------------------------------- Sponsor bug
function sponsor(): CustomEl[] {
  return [
    R("Panel", 1380, 900, 460, 120, WHITE, { radius: 10, anim: "right", animMs: 450, shadow: 24 }),
    T("Prefix", "Prefix", 1400, 906, 420, 34, "BROUGHT TO YOU BY", 22, { weight: 700, color: "#64748b", upper: true, spacing: 3, align: "center", anim: "fade", delay: 350 }),
    IMG("Sponsor logo", "Sponsor logo", 1470, 938, 280, 76, { anim: "fade", delay: 450 }),
    T("Sponsor name (shows if no logo)", "Sponsor name", 1400, 938, 420, 76, "YOUR SPONSOR", 48, { weight: 700, color: DARK, align: "center", anim: "fade", delay: 450 }),
  ];
}

// 18 ----------------------------------------------------------------- Over-the-shoulder headline box
function overShoulder(): CustomEl[] {
  const RED = "#e5322d";
  return [
    R("Box", 1160, 140, 640, 360, DARK, { radius: 12, anim: "right", animMs: 500, shadow: 40, opacity: 96 }),
    R("Tag", 1160, 140, 640, 64, RED, { radius: 12, anim: "wipe", delay: 200 }),
    T("Tag text", "Tag", 1190, 140, 580, 64, "TOP STORY", 38, { weight: 700, upper: true, spacing: 4, anim: "fade", delay: 450 }),
    T("Headline line 1", "Headline line 1", 1190, 225, 580, 80, "Floods displace", 64, { weight: 700, anim: "up", delay: 500 }),
    T("Headline line 2", "Headline line 2", 1190, 298, 580, 80, "thousands in", 64, { weight: 700, anim: "up", delay: 560 }),
    T("Headline line 3", "Headline line 3", 1190, 371, 580, 80, "the lake region", 64, { weight: 700, color: "#f2b01e", anim: "up", delay: 620 }),
  ];
}

// 19 ----------------------------------------------------------------- Three-guest panel
function threeGuests(): CustomEl[] {
  const ACC = "#14b8a6";
  const guest = (i: number, name: string, role: string): CustomEl[] => {
    const x = 120 + i * 620;
    const d = i * 150;
    return [
      R(`Guest ${i + 1} panel`, x, 860, 580, 120, DARK, { radius: 8, anim: "up", animMs: 450, delay: d, shadow: 24 }),
      R(`Guest ${i + 1} accent`, x, 860, 10, 120, ACC, { anim: "up", delay: d }),
      T(`Guest ${i + 1} name`, `Guest ${i + 1} name`, x + 30, 866, 540, 62, name, 46, { weight: 700, upper: true, anim: "fade", delay: d + 350 }),
      T(`Guest ${i + 1} role`, `Guest ${i + 1} role`, x + 30, 924, 540, 48, role, 30, { weight: 500, color: "#9fb0d0", anim: "fade", delay: d + 420 }),
    ];
  };
  return [...guest(0, "Mary Njeri", "Economist"), ...guest(1, "Ali Hassan", "Senator"), ...guest(2, "Tom Ochieng", "Business Owner")];
}

// 20 ----------------------------------------------------------------- Thank you / end card
function endCard(): CustomEl[] {
  const ACC = "#f43f5e";
  return [
    R("Backdrop", 0, 0, 1920, 1080, "#0b1220", { fill2: "#2a1233", angle: 135, anim: "fade", animMs: 600 }),
    E("Glow", 760, 120, 400, 400, ACC, { opacity: 20, anim: "scale", animMs: 900, loop: "pulse", loopMs: 3000 }),
    IMG("Logo", "Logo", 810, 170, 300, 300, { anim: "scale", delay: 300 }),
    T("Thank you", "Thank you", 160, 500, 1600, 150, "Thank you for watching", 120, { weight: 700, align: "center", anim: "up", delay: 400 }),
    R("Rule", 860, 665, 200, 6, ACC, { anim: "wipe", delay: 600 }),
    T("Next show", "Next show", 160, 700, 1600, 70, "Join us again tomorrow at 7:00 PM", 48, { weight: 500, align: "center", color: "#c9d3e6", anim: "fade", delay: 700 }),
    T("Website / handle", "Website", 160, 800, 1600, 60, "www.yourchannel.co.ke   •   @yourchannel", 38, { weight: 600, align: "center", color: ACC, anim: "fade", delay: 800 }),
  ];
}

export const PACK_TEMPLATES: { id: string; label: string; build: () => CustomEl[] }[] = [
  { id: "p01-lower-classic", label: "01 Lower third: Classic (name + role)", build: lowerClassic },
  { id: "p02-lower-slant", label: "02 Lower third: Slant gold", build: lowerSlant },
  { id: "p03-lower-glass", label: "03 Name plate: Glass", build: lowerGlass },
  { id: "p04-breaking", label: "04 Breaking news banner", build: breaking },
  { id: "p05-live-location", label: "05 LIVE + location tag", build: liveLocation },
  { id: "p06-ticker-strap", label: "06 Headline strap + clock", build: tickerStrap },
  { id: "p07-scorebug", label: "07 Scorebug (sport)", build: scorebug },
  { id: "p08-fulltime", label: "08 Full-time result", build: fullTime },
  { id: "p09-segment-title", label: "09 Segment title card (full screen)", build: segmentTitle },
  { id: "p10-quote", label: "10 Quote card", build: quoteCard },
  { id: "p11-social", label: "11 Social handle strap", build: socialStrap },
  { id: "p12-caller", label: "12 Caller / phone-in", build: caller },
  { id: "p13-weather", label: "13 Weather card", build: weather },
  { id: "p14-election", label: "14 Election results (2 candidates)", build: election },
  { id: "p15-bigstat", label: "15 Big stat / number", build: bigStat },
  { id: "p16-comingup", label: "16 Coming up next", build: comingUp },
  { id: "p17-sponsor", label: "17 Sponsor bug", build: sponsor },
  { id: "p18-ots", label: "18 Over-the-shoulder headline", build: overShoulder },
  { id: "p19-guests", label: "19 Three-guest panel", build: threeGuests },
  { id: "p20-endcard", label: "20 Thank you / end card (full screen)", build: endCard },
];

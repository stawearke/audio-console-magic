// MK VISION — shared domain types.
// Kept free of UI and transport concerns so the same contracts can later back a
// physical MK VISION PANEL hardware interface.

import { DEFAULT_MERGE, type MergePreset } from "./merge";
import { DEFAULT_TAGS, type TagConfig } from "./tags";
import { DEFAULT_AD, DEFAULT_FX, DEFAULT_PIPS, type AdConfig, type AdPreset, type DskPlace, type FxConfig, type FxLayoutKind, type PipSlot, type PlacePos } from "./fx";

/** Studio cameras and field feeds share these slots; empty ones are hidden on the source bus. */
export const CAM_COUNT = 12;
export const DSK_COUNT = 2;

export type CamIndex = number; // 0..7 -> CAM 1..CAM 8

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/** OBS audio monitoring modes. */
export type MonitorType = "none" | "monitorOnly" | "monitorAndOutput";

export interface DskTarget {
  /** Scene that contains the graphics source ("" = current program scene). */
  scene: string;
  /** Scene item toggled by the DSK button. */
  source: string;
  /** Spot + size picked by hand in Settings (null / missing = leave the item where OBS has it). */
  place?: DskPlace | null;
}

export type Corner = "tl" | "tr" | "bl" | "br";
export type GfxId =
  "logo" | "lower" | "ticker" | "clock" | "badge" | "news" | "breaking" | "score" | "social" | "full" | "custom" | "custom2" | "custom3" | "custom4";
export const GFX_IDS: GfxId[] = [
  "logo",
  "lower",
  "ticker",
  "clock",
  "badge",
  "news",
  "breaking",
  "score",
  "social",
  "full",
  "custom",
  "custom2",
  "custom3",
  "custom4",
];

/** Four independent Custom layers: each goes on air by itself, so a strap, a bug and a scorebug can run together. */
export const CUSTOM_LAYERS = ["custom", "custom2", "custom3", "custom4"] as const satisfies readonly GfxId[];
export type CustomLayerId = (typeof CUSTOM_LAYERS)[number];
export const isCustomLayer = (id: string): id is CustomLayerId => (CUSTOM_LAYERS as readonly string[]).includes(id);

/** What the full-screen layer shows. */
export type FullKind =
  "headline" | "quote" | "standings" | "countdown" | "announcement" | "credits";
export const FULL_KINDS: { id: FullKind; label: string }[] = [
  { id: "headline", label: "Headline card" },
  { id: "quote", label: "Quote card" },
  { id: "standings", label: "League standings" },
  { id: "countdown", label: "Countdown timer" },
  { id: "announcement", label: "Announcement" },
  { id: "credits", label: "End credits" },
];

/** How a graphic comes on screen. */
export type GfxAnim = "slide" | "fade" | "wipe" | "scale" | "reveal";
export const GFX_ANIMS: { id: GfxAnim; label: string }[] = [
  { id: "slide", label: "Slide" },
  { id: "fade", label: "Fade" },
  { id: "wipe", label: "Wipe" },
  { id: "scale", label: "Pop" },
  { id: "reveal", label: "Reveal" },
];

export interface LowerPreset {
  name: string;
  title: string;
}

export type GfxFont = "sans" | "condensed" | "serif" | "mono";
export const GFX_FONTS: { id: GfxFont; label: string }[] = [
  { id: "sans", label: "Sans" },
  { id: "condensed", label: "Condensed" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
];

export type LowerStyle = "bar" | "glass" | "underline" | "box" | "presenter" | "guest" | "sport" | "strap";
export const LOWER_STYLES: { id: LowerStyle; label: string }[] = [
  { id: "strap", label: "Channel strap (logo + tag)" },
  { id: "presenter", label: "Presenter (news)" },
  { id: "guest", label: "Guest strap" },
  { id: "sport", label: "Player ID (sport)" },
  { id: "bar", label: "Classic bar" },
  { id: "glass", label: "Glass" },
  { id: "underline", label: "Underline" },
  { id: "box", label: "Boxed" },
];

export type TickerStyle = "solid" | "glass" | "outline" | "news" | "broadcast";
export const TICKER_STYLES: { id: TickerStyle; label: string }[] = [
  { id: "broadcast", label: "Broadcast bar (gloss)" },
  { id: "news", label: "News bar" },
  { id: "solid", label: "Solid" },
  { id: "glass", label: "Glass" },
  { id: "outline", label: "Outline" },
];

export type BadgeStyle = "solid" | "outline" | "glass" | "location" | "gloss";
export const BADGE_STYLES: { id: BadgeStyle; label: string }[] = [
  { id: "gloss", label: "Gloss LIVE" },
  { id: "location", label: "Live + location" },
  { id: "solid", label: "Solid" },
  { id: "outline", label: "Outline" },
  { id: "glass", label: "Glass" },
];

export type ClockStyle = "solid" | "split";
export const CLOCK_STYLES: { id: ClockStyle; label: string }[] = [
  { id: "split", label: "Label + time" },
  { id: "solid", label: "Solid" },
];

/** A ready-made scrolling message: one tap loads it into the ticker and sends it on air. */
export interface ScrollPreset {
  name: string;
  text: string;
  label: string;
  /** Seconds for one pass across the screen. */
  speed: number;
  direction: "left" | "right";
  /** true = keeps repeating, false = runs once, then the bar leaves by itself. */
  loop: boolean;
}

export const DEFAULT_SCROLLS: ScrollPreset[] = [
  { name: "Welcome", label: "LIVE", text: "Welcome to the broadcast — stay tuned for more", speed: 24, direction: "left", loop: true },
  { name: "Breaking", label: "BREAKING", text: "Breaking news: more details coming up shortly", speed: 20, direction: "left", loop: false },
  { name: "Subscribe", label: "FOLLOW", text: "Like, share and subscribe so you never miss a live show", speed: 22, direction: "left", loop: false },
  { name: "Sponsors", label: "THANKS", text: "This broadcast is brought to you by our sponsors and partners", speed: 26, direction: "left", loop: true },
];

/** One changing tag of a news story: the big main tag and the smaller tag below it. */
export interface NewsTag {
  main: string;
  below: string;
  /** true = FULL TITLE: one big title bar, no lower tag. false/absent = title + lower tag (a tag with no lower text is a full title too). */
  full?: boolean;
}

/** Custom graphic editor: every element sits on a 1920 x 1080 canvas. */
export type CustomElType = "rect" | "ellipse" | "text" | "image";
export type CustomAnim = "none" | "fade" | "left" | "right" | "up" | "down" | "scale" | "wipe" | "rotate";
export const CUSTOM_ANIMS: { id: CustomAnim; label: string }[] = [
  { id: "none", label: "None (appears)" },
  { id: "fade", label: "Fade" },
  { id: "left", label: "Slide from left" },
  { id: "right", label: "Slide from right" },
  { id: "up", label: "Slide from bottom" },
  { id: "down", label: "Slide from top" },
  { id: "scale", label: "Pop (scale)" },
  { id: "wipe", label: "Wipe" },
  { id: "rotate", label: "Spin in" },
];
export type CustomLoop = "none" | "pulse" | "blink" | "float" | "spin" | "wobble";
export const CUSTOM_LOOPS: { id: CustomLoop; label: string }[] = [
  { id: "none", label: "None" },
  { id: "pulse", label: "Pulse (grow / shrink)" },
  { id: "blink", label: "Blink" },
  { id: "float", label: "Float (up / down)" },
  { id: "spin", label: "Spin" },
  { id: "wobble", label: "Wobble" },
];
export type CustomEase = "linear" | "in" | "out" | "inout" | "back" | "hold";
export const CUSTOM_EASES: { id: CustomEase; label: string }[] = [
  { id: "inout", label: "Smooth (ease in-out)" },
  { id: "out", label: "Ease out" },
  { id: "in", label: "Ease in" },
  { id: "linear", label: "Linear" },
  { id: "back", label: "Overshoot" },
  { id: "hold", label: "Hold (jump)" },
];
/** One keyframe: a pose relative to the element's own box, at a time since going on air. */
export interface CustomKey {
  id: string;
  /** ms since the graphic went on air. */
  t: number;
  dx: number;
  dy: number;
  /** percent, 100 = normal */
  scale: number;
  rot: number;
  /** percent, 100 = normal */
  opacity: number;
  /** How it moves on to the next keyframe. */
  ease: CustomEase;
}
export interface CustomEl {
  id: string;
  name: string;
  type: CustomElType;
  visible: boolean;
  locked: boolean;
  /** Box on the 1920 x 1080 canvas, design pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  opacity: number;
  /** Shapes. */
  fill: string;
  /** Second colour for a gradient; null = flat colour. */
  fill2: string | null;
  angle: number;
  radius: number;
  /** Parallelogram slant in px (negative leans the other way). */
  slant: number;
  stroke: string;
  strokeW: number;
  /** Drop-shadow blur, 0 = none. */
  shadow: number;
  /** Text. */
  text: string;
  font: GfxFont;
  fontSize: number;
  weight: number;
  color: string;
  align: "left" | "center" | "right";
  spacing: number;
  upper: boolean;
  /** Image element. */
  image: string | null;
  /** Entrance. */
  anim: CustomAnim;
  animMs: number;
  delay: number;
  /** Exit, played when the graphic is taken off air. */
  out: CustomAnim;
  outMs: number;
  outDelay: number;
  /** Endless effect that starts once the entrance is done. */
  loop: CustomLoop;
  loopMs: number;
  /** Keyframes (sorted by time). */
  keys: CustomKey[];
  kfLoop: boolean;
  /** Fill-in label. When set, the crew can edit this text / image from the live panel without opening the editor. */
  field: string;
  /** Elements sharing a group id select and move together. */
  group: string;
}

export interface GraphicsConfig {
  logo: {
    image: string | null;
    pos: Corner;
    /** Hand-placed spot (0..1 across the free space). Wins over `pos` when set. */
    at: PlacePos | null;
    size: number;
    opacity: number;
    /** Station mark drawn as text when there is no image (empty = nothing). */
    text: string;
    textColor: string;
    anim: GfxAnim;
  };
  lower: {
    /** Hand-placed spot (0..1 across the free space). null = the default lower-third spot. */
    at: PlacePos | null;
    name: string;
    title: string;
    /** Jersey / shirt number, shown by the Player ID style. */
    number: string;
    accent: string;
    /** Name-block colour of the Presenter and Player ID styles. */
    primary: string;
    presets: LowerPreset[];
    size: number;
    style: LowerStyle;
    anim: GfxAnim;
    bg: string;
    bgOpacity: number;
    text: string;
    font: GfxFont;
    /** Channel strap style: logo shown in the left panel (null = none). */
    logoImage: string | null;
    /** Channel strap: logo size inside its panel, percent (100 = default). */
    logoSize: number;
    /** Channel strap style: the tag above the logo (e.g. BARAZA LA MTAA). Empty = no tag. */
    tag: string;
    tagBg: string;
    tagText: string;
    /** Channel strap style: the middle bar and its two text lines. */
    barBg: string;
    nameColor: string;
    titleColor: string;
  };
  custom: { elements: CustomEl[] };
  custom2: { elements: CustomEl[] };
  custom3: { elements: CustomEl[] };
  custom4: { elements: CustomEl[] };
  ticker: {
    /** Hand-placed spot; only the vertical (y) part is used — the bar always spans the width. null = use `pos`. */
    at: PlacePos | null;
    text: string;
    label: string;
    speed: number;
    accent: string;
    /** Bar height + text size, percent (100 = default). */
    size: number;
    /** Which way the text scrolls. */
    direction: "left" | "right";
    /** Bar sits on the bottom or the top of the picture. */
    pos: "bottom" | "top";
    style: TickerStyle;
    bg: string;
    bgOpacity: number;
    textColor: string;
    font: GfxFont;
    /** true = scroll repeats forever, false = one pass, then the bar leaves. */
    loop: boolean;
    /** Ready-made scrolling messages (tap one to go on air). */
    scrolls: ScrollPreset[];
  };
  clock: {
    /** Small tag before the time (EAT, GMT, LOCAL…). Shown by the Label + time style. */
    label: string;
    accent: string;
    style: ClockStyle;
    anim: GfxAnim;
    pos: Corner;
    /** Hand-placed spot (0..1 across the free space). Wins over `pos` when set. */
    at: PlacePos | null;
    seconds: boolean;
    h24: boolean;
    size: number;
    bg: string;
    bgOpacity: number;
    textColor: string;
    font: GfxFont;
  };
  badge: {
    text: string;
    /** Place name beside the LIVE tag (Live + location style). */
    location: string;
    locBg: string;
    pos: Corner;
    at: PlacePos | null;
    color: string;
    size: number;
    style: BadgeStyle;
    anim: GfxAnim;
    textColor: string;
    font: GfxFont;
  };
  /** News tags: an "updates" tag over a main tag over a below tag. Cycles the story's tags by itself. */
  news: {
    /** Small "updates" tag above the main tag (LIVE UPDATES, POLITICS…). Empty = hidden. */
    kicker: string;
    /** The changing tags of one story. Each one is a main tag + a below tag. */
    tags: NewsTag[];
    /** Seconds each tag stays up before the next one comes in. */
    seconds: number;
    /** true = keeps going round the tags, false = plays once and holds the last tag. */
    loop: boolean;
    /** Tag to start on (0 = the first). */
    start: number;
    /** Bumped by the News Desk to restart the cycle (a changed number makes OBS reload the page). */
    run: number;
    /** Main tag block colour. */
    primary: string;
    /** Updates tag + accent line colour. */
    accent: string;
    /** Below tag strip colour. */
    bg: string;
    textColor: string;
    size: number;
    font: GfxFont;
    anim: GfxAnim;
  };
  /** Full-width breaking-news banner. */
  breaking: {
    label: string;
    headline: string;
    /** Label block colour. */
    accent: string;
    /** Headline strip colour. */
    bg: string;
    textColor: string;
    size: number;
    font: GfxFont;
    anim: GfxAnim;
  };
  /** Match scoreboard bug. */
  score: {
    home: string;
    away: string;
    homeScore: string;
    awayScore: string;
    clock: string;
    pos: Corner;
    at: PlacePos | null;
    size: number;
    /** Team blocks. */
    primary: string;
    /** Clock block. */
    accent: string;
    /** Text colour on the score + clock blocks. */
    bg: string;
    textColor: string;
    font: GfxFont;
    anim: GfxAnim;
  };
  /** Social handle strap (bottom right). */
  social: {
    platform: string;
    handle: string;
    /** Platform block colour. */
    accent: string;
    /** Handle block colour. */
    bg: string;
    textColor: string;
    size: number;
    font: GfxFont;
    anim: GfxAnim;
  };
  /** Full-screen cards: headline, quote, standings, countdown, announcement, credits. */
  full: {
    kind: FullKind;
    kicker: string;
    headline: string;
    body: string;
    quote: string;
    author: string;
    title: string;
    subtitle: string;
    /** Standings rows, "Team, P, Pts" one per line. */
    rows: string;
    /** Countdown start, seconds (counts from the moment the card goes on air). */
    seconds: number;
    /** Credits lines, "Role — Name" one per line. */
    lines: string;
    /** Seconds for the credits roll. */
    speed: number;
    primary: string;
    secondary: string;
    accent: string;
    textColor: string;
    font: GfxFont;
    anim: GfxAnim;
  };
}

export const DEFAULT_GRAPHICS: GraphicsConfig = {
  logo: { image: null, pos: "tr", at: null, size: 12, opacity: 100, text: "", textColor: "#ffffff", anim: "fade" },
  lower: {
    at: null,
    name: "Guest Name",
    title: "Title / Role",
    number: "10",
    accent: "#f5a623",
    primary: "#0b4fa8",
    presets: [],
    size: 100,
    style: "bar",
    anim: "slide",
    bg: "#0a0c10",
    bgOpacity: 90,
    text: "#ffffff",
    font: "sans",
    logoImage: null,
    logoSize: 100,
    tag: "BARAZA LA MTAA",
    tagBg: "#9b0a14",
    tagText: "#ffffff",
    barBg: "#ffffff",
    nameColor: "#0b0b0b",
    titleColor: "#0b0b0b",
  },
  ticker: {
    at: null,
    text: "Welcome to the broadcast — stay tuned for more",
    label: "LIVE",
    speed: 22,
    accent: "#e5322d",
    size: 100,
    direction: "left",
    pos: "bottom",
    style: "solid",
    bg: "#0a0c10",
    bgOpacity: 94,
    textColor: "#ffffff",
    font: "sans",
    loop: true,
    scrolls: DEFAULT_SCROLLS,
  },
  clock: { label: "", accent: "#f5b700", style: "solid", anim: "fade", pos: "br", at: null, seconds: true, h24: true, size: 100, bg: "#0a0c10", bgOpacity: 88, textColor: "#ffffff", font: "mono" },
  badge: { text: "LIVE", location: "", locBg: "#0a1628", pos: "tl", at: null, color: "#e5322d", size: 100, style: "solid", anim: "fade", textColor: "#ffffff", font: "sans" },
  news: {
    kicker: "LIVE UPDATES",
    tags: [
      { main: "Title with a lower tag goes here", below: "Lower tag goes here" },
      { main: "Full title goes here, on one big bar", below: "", full: true },
    ],
    seconds: 6,
    loop: true,
    start: 0,
    run: 0,
    primary: "#e8e8e8",
    accent: "#cf0102",
    bg: "#1d1d1d",
    textColor: "#262626",
    size: 100,
    font: "condensed",
    anim: "slide",
  },
  breaking: {
    label: "BREAKING NEWS",
    headline: "Parliament passes new climate bill after overnight session",
    accent: "#d0161d",
    bg: "#ffffff",
    textColor: "#111111",
    size: 100,
    font: "condensed",
    anim: "slide",
  },
  score: {
    home: "LEO",
    away: "RHI",
    homeScore: "0",
    awayScore: "0",
    clock: "00:00",
    pos: "tl",
    // Top-centre by default so it never lands on the logo, LIVE badge or clock corners.
    at: { x: 0.5, y: 0.05 },
    size: 100,
    primary: "#0f8a4a",
    accent: "#d7ff3a",
    bg: "#0b130f",
    textColor: "#ffffff",
    font: "condensed",
    anim: "slide",
  },
  social: {
    platform: "FOLLOW US",
    handle: "@campustv",
    accent: "#f5b700",
    bg: "#0a1628",
    textColor: "#ffffff",
    size: 100,
    font: "condensed",
    anim: "slide",
  },
  custom: { elements: [] },
  custom2: { elements: [] },
  custom3: { elements: [] },
  custom4: { elements: [] },
  full: {
    kind: "headline",
    kicker: "TOP STORY",
    headline: "City unveils 10-year plan for public transport",
    body: "New rapid bus corridors and commuter rail upgrades will connect five counties by 2036.",
    quote: "We will not build the future by repeating the past.",
    author: "Minister of Education",
    title: "UP NEXT",
    subtitle: "The Sports Hour — 8:00 PM",
    rows: "Leopards, 12, 28\nRhinos, 12, 25\nFalcons, 12, 22\nSharks, 12, 19\nEagles, 12, 15",
    seconds: 300,
    lines:
      "Producer — Grace Njeri\nDirector — Kevin Ouma\nGraphics — Faith Akinyi\nCamera — Daniel Kiprop\nSound — Lucy Mwende",
    speed: 20,
    primary: "#0b4fa8",
    secondary: "#0a1628",
    accent: "#f5b700",
    textColor: "#ffffff",
    font: "condensed",
    anim: "fade",
  },
};

export const IDLE_GFX: Record<GfxId, boolean> = {
  logo: false,
  lower: false,
  ticker: false,
  clock: false,
  badge: false,
  news: false,
  breaking: false,
  score: false,
  social: false,
  full: false,
  custom: false,
  custom2: false,
  custom3: false,
  custom4: false,
};

export interface MkConfig {
  host: string;
  port: number;
  password: string;
  /** Scene name mapped to each CAM button, index 0 = CAM 1. */
  camScenes: (string | null)[];
  /** DSK 1 and DSK 2 targets. */
  dsks: DskTarget[];
  transition: string;
  transitionDuration: number;
  demoMode: boolean;
  autoConnect: boolean;
  shortcuts: Shortcuts;
  /** Audio follows video: cam-named audio inputs unmute when their CAM is on air. */
  audioFollowVideo: boolean;
  /** Show real OBS video in the Preview / Program monitors. */
  liveVideo: boolean;
  /** Monitor refresh rate (frames per second, OBS screenshots). */
  monitorFps: number;
  graphics: GraphicsConfig;
  /** The ONE scene the MK Graphics scene is nested into ("" = not nested anywhere). */
  graphicsScene: string;
  /** WHEP address of the audio feed from the OBS PC ("" = derive from the OBS host). */
  listenUrl: string;
  /** Volume of the audio feed on this device, 0..1. */
  listenVolume: number;
  /** Remote listening: add a STUN server so the audio also connects across routers / the internet. */
  listenRemote: boolean;
  /** Extra ICE servers, separated by `;`. A TURN server is `turn:host:3478|user|password`. */
  listenIce: string;
  /** Master limiter: an OBS Limiter filter on every input that goes to the final mix. */
  limiter: LimiterConfig;
  /** Audio inputs the operator hid from the mixer (they stay in OBS and on the mix). */
  hiddenAudio: string[];
  /** Field feeds in FADER mode (own OBS strip, parked in every scene). Feeds not listed here are GLOBAL: sound goes through OBS Desktop Audio. */
  fieldAudioAlways: string[];
  /** Pre-planned run of show (titles + planned lengths) shown in the Tools panel. */
  rundown: RundownItem[];
  /** Squeeze / PiP / Merge settings. */
  fx: FxConfig;
  /** PIP 1 / PIP 2: persistent scene assignment + position + size. */
  pips: PipSlot[];
  /** The Squeeze Merge that is selected right now (a copy of adPresets[adActive]; the engine works with this one). */
  ad: AdConfig;
  /** Every Squeeze Merge made in Settings; the live screen just picks one from a drop-down. Always at least one. */
  adPresets: AdPreset[];
  adActive: number;
  /** Split-screen Merge looks (2..6 panes + borders), picked on the live screen, set up and saved in the Merge editor. Always at least one. */
  mergePresets: MergePreset[];
  mergeActive: number;
  /** Location tags: one label per cam, shown at the top of each pane (or where you place it). */
  tags: TagConfig;
}

/** What the live compositor is doing in OBS right now (confirmed from OBS, not assumed). */
export interface LiveState {
  /** OBS program is one of the MK LIVE buses. */
  on: boolean;
  /** PIP 1 / PIP 2 are showing in OBS. */
  pip: boolean[];
  /** Squeeze Merge is in (advertisement showing). */
  sqm: boolean;
  /** Split-screen Merge is showing (panes + borders in the live buses; PIPs / DSKs / the ad ride on top). */
  merge: boolean;
  /** Location tags are showing (one per pane while Merge is on, otherwise one for the cam on air). */
  tags: boolean;
  /** The scene shown in each pane right now (only while `merge`). */
  mergeScenes: string[];
  /** OBS scene names of the program / preview bus (for the monitors). */
  progBus: string | null;
  previewBus: string | null;
}

export const IDLE_LIVE: LiveState = { on: false, pip: [false, false], sqm: false, merge: false, tags: false, mergeScenes: [], progBus: null, previewBus: null };

export interface RundownItem {
  text: string;
  /** Planned length in seconds. 0 = untimed (counts up). */
  secs: number;
  /** Set when this segment is a video from the Playout list (its id there). */
  play?: string;
}

export interface LimiterConfig {
  on: boolean;
  /** Ceiling in dBFS. */
  threshold: number;
}

export const DEFAULT_LIMITER: LimiterConfig = { on: false, threshold: -6 };
export const LIMITER_MIN = -30;
export const LIMITER_MAX = 0;

export interface Shortcuts {
  cut: string;
  autoTake: string;
  dsk: string;
  dsk2: string;
  /** Keys for CAM 1..8 preview selection. */
  cams: string[];
}

export const TRANSITION_DURATIONS = [300, 500, 750, 1000, 1500, 2000];
/** Quick rate buttons on the transition panel. */
export const RATE_BUTTONS = [300, 500, 1000, 1500, 2000];
export const MONITOR_FPS_OPTIONS = [5, 8, 10, 15, 20];

export const DEFAULT_SHORTCUTS: Shortcuts = {
  cut: "x",
  autoTake: " ",
  dsk: "d",
  dsk2: "f",
  cams: ["1", "2", "3", "4", "5", "6", "7", "8"],
};

export const DEFAULT_DSKS: DskTarget[] = Array.from({ length: DSK_COUNT }, () => ({
  scene: "",
  source: "",
}));

export const DEFAULT_CONFIG: MkConfig = {
  host: "",
  port: 4455,
  password: "",
  camScenes: Array.from({ length: CAM_COUNT }, () => null),
  dsks: DEFAULT_DSKS,
  transition: "Fade",
  transitionDuration: 500,
  demoMode: true,
  autoConnect: false,
  shortcuts: DEFAULT_SHORTCUTS,
  audioFollowVideo: false,
  liveVideo: true,
  monitorFps: 10,
  graphics: DEFAULT_GRAPHICS,
  graphicsScene: "",
  listenUrl: "",
  listenVolume: 1,
  listenRemote: false,
  listenIce: "",
  limiter: DEFAULT_LIMITER,
  hiddenAudio: [],
  fieldAudioAlways: [],
  rundown: [],
  fx: DEFAULT_FX,
  pips: DEFAULT_PIPS,
  ad: DEFAULT_AD,
  adPresets: [{ name: "Squeeze Merge 1", ad: DEFAULT_AD }],
  adActive: 0,
  mergePresets: [{ name: "Split 2", merge: DEFAULT_MERGE }],
  mergeActive: 0,
  tags: DEFAULT_TAGS,
};

export interface SwitcherState {
  status: ConnectionStatus;
  statusMessage: string;
  demo: boolean;
  /** CAM index currently on air, or null when program scene is unmapped. */
  program: CamIndex | null;
  preview: CamIndex | null;
  programScene: string | null;
  previewScene: string | null;
  /** DSK 1 / DSK 2 on-air flags. */
  dskActive: boolean[];
  /** Built-in graphics on/off (independent of the DSKs). */
  gfxActive: Record<GfxId, boolean>;
  tBar: number; // 0..1 progress of the current take (0 = start of the pull, 1 = end)
  /** T-bar handle rests on the far (top) side after a take; the next pull runs back down. */
  tBarFlip: boolean;
  transitioning: boolean;
  /** Picture effects: `running` while one animates, `layout` while PiP / Merge is held on air. */
  fx: { running: boolean; layout: FxLayoutKind | null };
  live: LiveState;
  scenes: string[];
  transitions: string[];
  studioMode: boolean;
  config: MkConfig;
  audio: AudioChannel[];
  /** Name of the MAIN (desktop / master) audio input, if OBS has one. */
  mainAudio: string | null;
  /** Peak level in dB per input name (fast-changing telemetry). */
  levels: Record<string, number>;
  stream: OutputState;
  record: OutputState;
  /** Short-lived operator message (e.g. "DSK 1 has no source set"). */
  notice: string | null;
  /** Limiter gain reduction in dB (>= 0) when the backend reports it, else null (estimated). */
  gr: number | null;
  /** MUTE OUT is holding every final-mix input muted. */
  masterMuted: boolean;
  /** Console-style monitor section: MAIN / SOLO, staged EQ edits, copy buffer. */
  monitor: MonitorState;
}

export interface AudioChannel {
  name: string;
  /** Fader in dB, -60..+6 (-60 = -inf). */
  db: number;
  muted: boolean;
  /** OBS monitoring mode (what the operator hears locally). */
  monitor: MonitorType;
  /** Goes to the FINAL mix: what YouTube / the recording get (OBS audio track 1). */
  stream: boolean;
  /** Goes to the PRE-LISTEN mix (OBS audio track 2) — what the Listen button plays. */
  pre: boolean;
  /** All six OBS audio tracks this input feeds (index 0 = track 1). Absent until read. */
  tracks?: boolean[];
  /** Live gain + 3-band EQ (the MK Gain / MK EQ filters on the OBS input). Flat when absent. */
  eq?: EqValues;
}

/** Gain and 3-band EQ of one input, all in dB. */
export interface EqValues {
  gain: number;
  hi: number;
  mid: number;
  lo: number;
}

export const FLAT_EQ: EqValues = { gain: 0, hi: 0, mid: 0, lo: 0 };

/** Knob ranges: [min, max] in dB. */
export const EQ_RANGE: Record<keyof EqValues, [number, number]> = {
  gain: [-20, 20],
  hi: [-15, 15],
  mid: [-15, 15],
  lo: [-15, 15],
};

/** MAIN = the pre-listen feed follows the final mix. SOLO = it plays only the soloed inputs. */
export type MonitorMode = "main" | "solo";

export interface MonitorState {
  mode: MonitorMode;
  /** Soloed input names (SOLO mode only). */
  solo: string[];
  /** The soloed input whose knobs are shown. */
  select: string | null;
  /** Changes made in SOLO that are not on air yet (TAKE sends them). Keyed by input name. */
  staged: Record<string, EqValues>;
  /** COPY buffer. */
  clip: EqValues | null;
}

export const IDLE_MONITOR: MonitorState = { mode: "main", solo: [], select: null, staged: {}, clip: null };

export interface OutputState {
  active: boolean;
  paused: boolean;
  /** Epoch ms when the running clock started (null when stopped/paused). */
  since: number | null;
  /** Elapsed ms accumulated before `since`. */
  baseMs: number;
}

export const IDLE_OUTPUT: OutputState = { active: false, paused: false, since: null, baseMs: 0 };

/** Live stream health, polled from OBS while streaming. */
export interface StreamStats {
  bitrateKbps: number;
  totalFrames: number;
  droppedFrames: number;
  /** OBS CPU load, percent. */
  cpu: number;
  /** Rendered frames per second. */
  fps: number;
  /** Frames skipped because of rendering lag. */
  skippedRender: number;
}

export const FADER_MIN = -60;
export const FADER_MAX = 6;

export const camLabel = (index: CamIndex) => `CAM ${index + 1}`;

/** One line of the pre-listen output check (OBS Recording tab: Custom FFmpeg to MediaMTX). */
export interface OutputCheckRow {
  label: string;
  expected: string;
  actual: string;
  ok: boolean;
  /** MK changed it in OBS just now. */
  fixed: boolean;
  /** MK cannot change this one: do it in OBS Settings -> Output. */
  manual: boolean;
}

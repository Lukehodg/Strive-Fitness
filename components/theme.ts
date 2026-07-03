import { Appearance } from "react-native";

/**
 * Turnout brand tokens — "ink & amber": club colours under stadium lights.
 * Light: crisp cool paper, ink-navy text, one refined amber call to action.
 * Dark: the floodlit-night version — deep ink-navy ground, paper text, amber
 * turned up a stop. Same hierarchy, inverted ground.
 *
 * The palette is resolved ONCE at launch from the system setting: styles across
 * the app are static StyleSheets, so a mid-session OS theme change applies the
 * next time the app opens (an accepted trade-off — no flicker, no restyle pass).
 * Requires `userInterfaceStyle: "automatic"` in app.json (a native setting, so
 * dark mode ships with the next build).
 */
const light = {
  bg: "#F6F7F9", // Paper — cool off-white ground
  surface: "#FFFFFF", // white cards
  surfaceAlt: "#F3EEE2", // Linen — quiet amber wash for mono tags/fills
  border: "rgba(16,24,40,0.12)", // ink-navy line
  text: "#101828", // Ink Navy — professional, never flat black
  textMuted: "#5B6472", // Slate — metadata, captions (~5:1 on Paper)
  primary: "#E8A317", // Amber — the one call to action
  primaryText: "#101828", // ink on amber
  ember: "#A97108", // burnished amber — eyebrows, fine accents (~4.8:1)
  pine: "#1E5A44", // outdoors / success / grounding
  danger: "#B23B2C",
  warning: "#A97108",
};

const dark: typeof light = {
  bg: "#0C111A", // deep ink-navy ground
  surface: "#151C28", // navy charcoal cards
  surfaceAlt: "#2B2415", // warm amber-tinted chip fill
  border: "rgba(237,240,245,0.14)",
  text: "#EDF0F5", // Paper
  textMuted: "#9AA3B2", // light slate — comfortably AA on the dark ground
  primary: "#F2B024", // amber up a stop — it IS the floodlight
  primaryText: "#101828",
  ember: "#E4A83C", // eyebrow accents need more lumen on dark
  pine: "#3E8A68", // still a chip background; paper text stays readable
  danger: "#E06A57",
  warning: "#E4A83C",
};

/** Resolved at launch (see note above). */
export const isDark = Appearance.getColorScheme() === "dark";

export const colors = isDark ? dark : light;

/**
 * Brand type. Archivo carries the swagger (display + wordmark), Hanken Grotesk
 * keeps reading calm (body/UI), JetBrains Mono handles data (times, counts, tags).
 * Names match the @expo-google-fonts exports loaded in app/_layout.tsx.
 */
export const fonts = {
  display: "Archivo_800ExtraBold",
  displayBlack: "Archivo_900Black",
  body: "HankenGrotesk_500Medium",
  bodyBold: "HankenGrotesk_700Bold",
  mono: "JetBrainsMono_500Medium",
  monoBold: "JetBrainsMono_700Bold",
};

export const spacing = (n: number) => n * 4;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const font = {
  h1: 30,
  h2: 24,
  h3: 18,
  body: 15,
  small: 13,
};

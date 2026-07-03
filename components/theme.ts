import { Appearance } from "react-native";

/**
 * Turnout brand tokens — "floodlights at dusk".
 * Light: bone surfaces, ink text, marigold the one call to action.
 * Dark: the night-game version — warm ink surfaces, bone text, marigold as the
 * floodlight. Same hierarchy, inverted ground.
 *
 * The palette is resolved ONCE at launch from the system setting: styles across
 * the app are static StyleSheets, so a mid-session OS theme change applies the
 * next time the app opens (an accepted trade-off — no flicker, no restyle pass).
 * Requires `userInterfaceStyle: "automatic"` in app.json (a native setting, so
 * dark mode ships with the next build).
 */
const light = {
  bg: "#F3EEE5", // Bone — app background
  surface: "#FFFFFF", // white cards
  surfaceAlt: "#FFF1DA", // Tint — mono tags, subtle fills
  border: "rgba(23,20,15,0.12)", // Line
  text: "#17140F", // Ink — warm, never cold black
  // Stone — metadata, captions. Darkened from the kit's #8A847A: that was
  // ~3.1:1 on Bone (fails WCAG AA); this stays warm but reads at ~4.5:1.
  textMuted: "#6E6759",
  primary: "#FF9F1C", // Marigold — CTAs, join, active
  primaryText: "#17140F", // ink on marigold
  ember: "#E67E00", // pressed marigold, eyebrows, fine accents
  pine: "#1F4D3B", // outdoors / success / grounding
  danger: "#B23B2C",
  warning: "#E67E00",
};

const dark: typeof light = {
  bg: "#14110B", // deep warm ink, a shade under the brand Ink
  surface: "#201C14", // warm charcoal cards
  surfaceAlt: "#2E2513", // warm tint for mono tags
  border: "rgba(243,238,229,0.14)",
  text: "#F3EEE5", // Bone
  textMuted: "#A89F8F", // light stone — comfortably AA on the dark ground
  primary: "#FF9F1C", // marigold unchanged — it IS the floodlight
  primaryText: "#17140F",
  ember: "#FFB042", // eyebrow accents need more lumen on dark
  pine: "#2F6B4F", // still a chip background; bone text stays readable
  danger: "#E06A57",
  warning: "#FFB042",
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

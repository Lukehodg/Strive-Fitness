/**
 * Stride brand tokens — "floodlights at dusk".
 * Warm light theme: bone surfaces, ink text, marigold the one call to action.
 */
export const colors = {
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

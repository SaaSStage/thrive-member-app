/**
 * THE re-skin point for the whole app.
 *
 * Two layers, by design:
 *   1) `palette` — raw named colors (the literal hex values).
 *   2) `Colors.dark` / `Colors.light` — *semantic roles* (primary, surface,
 *      text, vitality, …) that point AT palette entries.
 *
 * Screens must consume semantic roles only (e.g. `theme.primary`), never raw
 * hex. To change the entire look, edit the palette and/or the role mapping here.
 *
 * Aesthetic source of truth: docs/wireframes/screens-thrive-concept.html
 * ("Resonance" — dark plum aurora, glass cards, sacred-geometry mandalas, all
 * color radiating from the mandala; Sora display + Inter body).
 */

import { Platform } from 'react-native';

/* ---------------------------------------------------------------------------
 * 1) Raw palette. Rename/retune here to re-skin.
 * ------------------------------------------------------------------------- */
const palette = {
  // Spectral accents (the mandala hues)
  teal: '#5eead4',
  indigo: '#818cf8',
  violet: '#a78bfa',
  rose: '#f0a6d8',
  gold: '#f3cd8b',
  amber: '#ff9f5a',
  onAccent: '#0a0814', // text/icon on bright accent fills

  // Deep plum surfaces
  bg: '#0b0814',
  bgElev: '#0d0a1b',
  glass: 'rgba(255,255,255,0.055)', // translucent card
  glass2: 'rgba(255,255,255,0.10)', // raised translucent
  hairline: 'rgba(255,255,255,0.11)',

  // Text
  textHi: '#f5f2ee',
  textMid: '#a8a6c0',
  textLo: '#6e6b8a',

  // Soft accent tints
  violetSoft: 'rgba(167,139,250,0.16)',
  tealSoft: 'rgba(94,234,212,0.14)',
} as const;

/* ---------------------------------------------------------------------------
 * 2) Semantic roles. Both schemes MUST declare the same keys. The app is
 *    dark-locked (see use-theme), so `light` simply mirrors `dark`.
 * ------------------------------------------------------------------------- */
const dark = {
  // surfaces
  background: palette.bg,
  backgroundElevated: palette.bgElev,
  surface: palette.glass,
  surfaceElevated: palette.glass2,
  hairline: palette.hairline,
  // text
  text: palette.textHi,
  textSecondary: palette.textMid,
  textTertiary: palette.textLo,
  // actions / accents
  primary: palette.violet,
  onPrimary: palette.onAccent,
  primarySoft: palette.violetSoft,
  vitality: palette.gold, // vitality / score
  onVitality: palette.onAccent,
  voice: palette.teal, // voice check-in accent
  onVoice: palette.onAccent,
  link: palette.teal,
  linkSoft: palette.tealSoft,
  live: palette.teal,
  // tab bar
  tabActive: palette.gold,
  tabInactive: palette.textLo,
  // status (voice validation: pass / warn / fail)
  success: palette.teal,
  warning: palette.amber,
  danger: palette.rose,
  // legacy aliases (kept so ThemedText/ThemedView don't break)
  backgroundElement: palette.glass,
  backgroundSelected: palette.glass2,
} as const;

export const Colors = { dark, light: dark } as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/* ---------------------------------------------------------------------------
 * Mandala / artwork gradients. Consumed by <Mandala> and <ArtTile>.
 * ------------------------------------------------------------------------- */
export const Gradients = {
  g1: ['#5eead4', '#818cf8'], // teal → indigo
  g2: ['#a78bfa', '#f0a6d8'], // violet → rose
  g3: ['#f3cd8b', '#f0a6d8'], // gold → rose
  g4: ['#22d3ee', '#a78bfa'], // cyan → violet
  g5: ['#34d399', '#5eead4'], // green → teal
  g6: ['#6366f1', '#a78bfa'], // indigo → violet
  g7: ['#2c2c3a', '#3a3a4c'], // neutral
  score: ['#5eead4', '#a78bfa', '#f3cd8b'], // vitality ring
  spectral: ['#5eead4', '#818cf8', '#a78bfa', '#f0a6d8', '#f3cd8b'],
  gold: ['#fff6d8', '#f3cd8b', '#c8961f', '#8a5a0f'],
  violet: ['#c4b5fd', '#a78bfa', '#6d28d9'],
  teal: ['#d6fff5', '#5eead4', '#0e8f80'],
  button: ['#5eead4', '#818cf8', '#a78bfa'], // primary CTA
} as const;

export type GradientName = keyof typeof Gradients;

/**
 * Hues for content tiles (stations/playlists/frequencies). Deliberately
 * EXCLUDES teal (reserved for Voice) and solid gold (reserved for Vitality) so
 * content never clashes with those fixed roles. Assign by list position for
 * variety, or hash a seed for a stable per-item color.
 */
export const ContentHues: string[][] = [
  ['#c4b5fd', '#a78bfa'], // violet
  ['#f3cd8b', '#f0a6d8'], // gold → rose
  ['#818cf8', '#a78bfa'], // indigo → violet
  ['#ffd9a0', '#ff9f5a'], // amber
  ['#a78bfa', '#f0a6d8'], // violet → rose
];

/* ---------------------------------------------------------------------------
 * Fonts. Sora = display/headings/numerals; Inter = body. Loaded in _layout.
 * (Weight-specific families — RN ignores fontWeight when fontFamily is set.)
 * ------------------------------------------------------------------------- */
export const Font = {
  displayLight: 'Sora_300Light',
  displayMed: 'Sora_500Medium',
  display: 'Sora_600SemiBold',
  displayBold: 'Sora_700Bold',
  body: 'Inter_400Regular',
  bodyMed: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

/* ---------------------------------------------------------------------------
 * Typography scale. Tokens carry fontFamily; spread them into text styles.
 * ------------------------------------------------------------------------- */
export const Type = {
  largeTitle: { fontFamily: Font.displayBold, fontSize: 32, letterSpacing: -0.5 },
  screenTitle: { fontFamily: Font.display, fontSize: 28, letterSpacing: -0.4 },
  sectionTitle: { fontFamily: Font.display, fontSize: 22, letterSpacing: -0.3 },
  headline: { fontFamily: Font.displayMed, fontSize: 19 },
  bodyStrong: { fontFamily: Font.bodySemi, fontSize: 15 },
  body: { fontFamily: Font.body, fontSize: 15, lineHeight: 21 },
  callout: { fontFamily: Font.body, fontSize: 14 },
  subhead: { fontFamily: Font.body, fontSize: 13 },
  footnote: { fontFamily: Font.body, fontSize: 12 },
  caption: { fontFamily: Font.bodySemi, fontSize: 11, letterSpacing: 0.6 },
  numeral: { fontFamily: Font.displayBold, letterSpacing: -1 }, // big scores; set fontSize at call site
} as const;

/* ---------------------------------------------------------------------------
 * Corner radii.
 * ------------------------------------------------------------------------- */
export const Radius = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 22,
  pill: 999,
} as const;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

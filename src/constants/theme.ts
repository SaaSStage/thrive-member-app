/**
 * THE re-skin point for the whole app.
 *
 * Two layers, by design:
 *   1) `palette` — raw named colors (the literal hex values).
 *   2) `Colors.dark` / `Colors.light` — *semantic roles* (primary, surface,
 *      textPrimary, vitality, …) that point AT palette entries.
 *
 * Screens must consume semantic roles only (e.g. `theme.primary`), never raw
 * hex. To change the entire look later, edit the palette and/or the role
 * mapping here — nothing else in the app should hardcode a color.
 *
 * Aesthetic source of truth: docs/wireframes/screens.html (Apple Music, dark).
 */

import { Platform } from 'react-native';

/* ---------------------------------------------------------------------------
 * 1) Raw palette. Rename/retune here to re-skin.
 * ------------------------------------------------------------------------- */
const palette = {
  // Brand accents (shared across light/dark)
  pink: '#fa2d48', // primary action · play · LIVE
  green: '#30d158', // vitality / score / "pass"
  blue: '#0a84ff', // links
  orange: '#ff9f0a', // "warn"
  purple: '#bf5af2',
  pinkSoft: 'rgba(250,45,72,0.16)', // tinted primary button bg
  blueSoft: 'rgba(10,132,255,0.12)', // tinted info banner bg
  onGreen: '#04210e', // text/icon on green fills

  // Dark neutrals
  black: '#000000',
  ink900: '#0c0c0e',
  ink800: '#161618',
  card: '#1c1c1e',
  card2: '#2c2c2e',
  hairlineDark: '#38383a',
  white: '#ffffff',
  grey2Dark: '#9a9aa0',
  grey3Dark: '#6c6c70',

  // Light neutrals
  paper: '#ffffff',
  paper2: '#f2f2f7',
  surfaceLight: '#ffffff',
  surfaceLight2: '#e5e5ea',
  hairlineLight: '#d1d1d6',
  textLight: '#000000',
  grey2Light: '#60646c',
  grey3Light: '#8a8a8e',
} as const;

/* ---------------------------------------------------------------------------
 * 2) Semantic roles. Both schemes MUST declare the same keys.
 * ------------------------------------------------------------------------- */
export const Colors = {
  dark: {
    // surfaces
    background: palette.black,
    backgroundElevated: palette.ink900,
    surface: palette.card,
    surfaceElevated: palette.card2,
    hairline: palette.hairlineDark,
    // text
    text: palette.white,
    textSecondary: palette.grey2Dark,
    textTertiary: palette.grey3Dark,
    // actions / accents
    primary: palette.pink,
    onPrimary: palette.white,
    primarySoft: palette.pinkSoft,
    vitality: palette.green,
    onVitality: palette.onGreen,
    link: palette.blue,
    linkSoft: palette.blueSoft,
    live: palette.pink,
    // tab bar
    tabActive: palette.pink,
    tabInactive: palette.grey3Dark,
    // status (voice validation: pass / warn / fail)
    success: palette.green,
    warning: palette.orange,
    danger: palette.pink,
    // legacy aliases (kept so ThemedText/ThemedView don't break)
    backgroundElement: palette.card,
    backgroundSelected: palette.card2,
  },
  light: {
    background: palette.paper,
    backgroundElevated: palette.paper2,
    surface: palette.surfaceLight,
    surfaceElevated: palette.surfaceLight2,
    hairline: palette.hairlineLight,
    text: palette.textLight,
    textSecondary: palette.grey2Light,
    textTertiary: palette.grey3Light,
    primary: palette.pink,
    onPrimary: palette.white,
    primarySoft: palette.pinkSoft,
    vitality: palette.green,
    onVitality: palette.onGreen,
    link: palette.blue,
    linkSoft: palette.blueSoft,
    live: palette.pink,
    tabActive: palette.pink,
    tabInactive: palette.grey3Light,
    success: palette.green,
    warning: palette.orange,
    danger: palette.pink,
    backgroundElement: palette.paper2,
    backgroundSelected: palette.surfaceLight2,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/* ---------------------------------------------------------------------------
 * Artwork gradients (decorative tiles). Consumed via a LinearGradient later.
 * Keys mirror the wireframe (g1..g7, score).
 * ------------------------------------------------------------------------- */
export const Gradients = {
  g1: ['#ff6a3d', '#fa2d48'],
  g2: ['#0a84ff', '#30d1c8'],
  g3: ['#bf5af2', '#fa2d48'],
  g4: ['#30d158', '#0a84ff'],
  g5: ['#ff9f0a', '#ff375f'],
  g6: ['#5e5ce6', '#0a84ff'],
  g7: ['#2c2c2e', '#3a3a3c'],
  score: ['#30d158', '#0a84ff'],
} as const;

export type GradientName = keyof typeof Gradients;

/* ---------------------------------------------------------------------------
 * Typography scale (maps to the wireframe's text sizes/weights).
 * ------------------------------------------------------------------------- */
export const Type = {
  largeTitle: { fontSize: 32, fontWeight: '800', letterSpacing: -0.6 },
  screenTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sectionTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  headline: { fontSize: 19, fontWeight: '700' },
  bodyStrong: { fontSize: 15, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  callout: { fontSize: 14, fontWeight: '400' },
  subhead: { fontSize: 13, fontWeight: '400' },
  footnote: { fontSize: 12, fontWeight: '400' },
  caption: { fontSize: 11, fontWeight: '700' },
} as const;

/* ---------------------------------------------------------------------------
 * Corner radii (from the wireframe: tiles, cards, buttons, phone frame).
 * ------------------------------------------------------------------------- */
export const Radius = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 14,
  xl: 16,
  xxl: 24,
  pill: 999,
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
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

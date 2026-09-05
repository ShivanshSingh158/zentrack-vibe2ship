import { Platform } from 'react-native';

/**
 * ZenTrack Mobile — Design Tokens v2
 *
 * Theme: "Obsidian Cosmos"
 * Philosophy: Absolute #000000 backgrounds and #1c1c1d surfaces, using the signature 
 * purple (#a599ff) for all interactive accents to provide a clean, hyper-responsive, 
 * and familiar feel.
 */

// ─── Colors ───────────────────────────────────────────────────────────────────

// ── Dark Theme: "Obsidian Cosmos" ────────────────────────────────────────────
export const DARK_COLORS = {

  // ── Backgrounds ─────────────────────────────────────────────────────────────
  background:    '#000000',              // true OLED pitch black canvas
  surface:       '#000000',              // true OLED pitch black surface for cards & rows
  surface2:      '#0d0d10',              // secondary elevated deep black for chips & inner sections
  surfaceRaised: '#000000',              // elevated modals, sheets & action cards (pure OLED black)

  // ── Borders ─────────────────────────────────────────────────────────────────
  border:        '#1c1c20',              // 1px sleek hairline dark border
  borderHover:   '#28282e',              // Interactive hover state
  borderGlow:    'rgba(165,153,255,0.40)', // Focus / active glow

  // ── Text ────────────────────────────────────────────────────────────────────
  textPrimary:   '#ffffff',              // headings, key numbers
  textSecondary: '#f2f2f7',              // body text on cards (primary soft)
  textMuted:     '#8e8e93',              // labels, subtitles (secondary)
  textTertiary:  '#636366',              // timestamps, least important text

  // ── Accent — Purple ────────────────────────────────────────────────
  accentPrimary:  '#a599ff',             // Signature purple
  accentLight:    '#b8afff',             // Lighter hover state
  accentDim:      'rgba(165,153,255,0.15)', // Tinted backgrounds
  accentGlow:     'rgba(165,153,255,0.24)', // Ambient glow effect

  // ── Success / Present — Green ───────────────────────────────────────────────
  accentGreen:     '#5eda9e',            // present, safe attendance %, completed
  accentGreenDim:  'rgba(94,218,158,0.12)',
  accentGreenGlow: 'rgba(94,218,158,0.28)',

  // ── Warning / At Risk — Orange ──────────────────────────────────────────────
  accentAmber:    '#ff9f4d',             // at-risk states, borderline values
  accentAmberDim: 'rgba(255,159,77,0.1)',

  // ── Sky Blue — Calendar / Schedule (Keeping from old theme for other screens)
  accentBlue:      '#89dceb',
  accentBlueDim:   'rgba(137, 220, 235, 0.14)',
  // Alias: Analytics and chart code references accentSecondary; maps to the same sky blue
  accentSecondary: '#89dceb',

  // ── Danger / Absent — Red ───────────────────────────────────────────────────
  error:    '#ff6961',                   // absent, below attendance threshold, overdue
  errorBg:  'rgba(255,105,97,0.12)',

  // ── Priority Colors ─────────────────────────────────────────────────────────
  priorityHigh:   '#ff6961',  // Danger (red)
  priorityMed:    '#ff9f4d',  // Warning (orange)
  priorityLow:    '#5eda9e',  // Success (green)
  success:        '#5eda9e',  // Alias for accentGreen (back-compat)

  // ── S.A.R.A Agent Colors ────────────────────────────────────────────────────
  agents: {
    ORACLE:      '#a599ff',
    HERMES:      '#ff9f4d',
    CHRONOS:     '#89dceb',
    TITAN:       '#5eda9e',
    AEGIS:       '#94e2d5',
    HEPHAESTUS:  '#fab387',
    GAINS:       '#ff6961',
  },
};

// ── Light Theme: "Frost Quartz" ───────────────────────────────────────────────
// iOS-native feel: warm off-white system background (#F4F3F8), deep charcoal text, rich royal amethyst accent (#6C5CE7).
export const LIGHT_COLORS = {

  // ── Backgrounds ─────────────────────────────────────────────────────────────
  background:    '#F4F3F8',              // warm alabaster / frost lilac canvas
  surface:       '#ffffff',              // crisp pure quartz white cards
  surface2:      '#F0EFF7',              // soft cool inset surface / secondary cards
  surfaceRaised: '#ffffff',              // modals / raised cards

  // ── Borders ─────────────────────────────────────────────────────────────────
  border:        '#E2E1EA',              // muted titanium lavender hairline
  borderHover:   '#D1D0DA',              // interactive hover state
  borderGlow:    'rgba(108,92,231,0.30)', // focus / active glow

  // ── Text ────────────────────────────────────────────────────────────────────
  textPrimary:   '#1C1C1E',              // Apple dark charcoal / jet black
  textSecondary: '#4B5563',              // graphite muted body text
  textMuted:     '#636366',              // secondary labels / inactive icons
  textTertiary:  '#8E8E93',              // tertiary label / timestamps / placeholders

  // ── Accent — Purple / Royal Amethyst ────────────────────────────────────────
  accentPrimary:  '#6C5CE7',             // Rich royal amethyst for crisp daylight contrast
  accentLight:    '#8274E8',             // hover state
  accentDim:      'rgba(108,92,231,0.12)', // tinted bg
  accentGlow:     'rgba(108,92,231,0.20)', // ambient glow

  // ── Success — Green ─────────────────────────────────────────────────────────
  accentGreen:     '#059669',            // deep emerald green
  accentGreenDim:  'rgba(5,150,105,0.10)',
  accentGreenGlow: 'rgba(5,150,105,0.24)',

  // ── Warning — Orange / Amber ────────────────────────────────────────────────
  accentAmber:    '#D97706',             // warm golden amber
  accentAmberDim: 'rgba(217,119,6,0.10)',

  // ── Sky Blue ─────────────────────────────────────────────────────────────────
  accentBlue:      '#0284C7',            // crisp ocean blue
  accentBlueDim:   'rgba(2,132,199,0.10)',
  accentSecondary: '#0284C7',

  // ── Danger — Red ─────────────────────────────────────────────────────────────
  error:    '#DC2626',                   // crisp crimson red
  errorBg:  'rgba(220,38,38,0.10)',

  // ── Priority ─────────────────────────────────────────────────────────────────
  priorityHigh:   '#DC2626',
  priorityMed:    '#D97706',
  priorityLow:    '#059669',
  success:        '#059669',

  // ── S.A.R.A Agent Colors (adjusted for high-contrast light mode readability) ───
  agents: {
    ORACLE:      '#6C5CE7',
    HERMES:      '#EA580C',
    CHRONOS:     '#0284C7',
    TITAN:       '#059669',
    AEGIS:       '#0D9488',
    HEPHAESTUS:  '#EA580C',
    GAINS:       '#DC2626',
  },
};

// ── Backwards-compat default export (default light — screens not yet theme-aware use this) ──
// Theme-aware code should use `useTheme().colors` from ThemeContext instead.
export const COLORS = LIGHT_COLORS;


// ─── Radius ───────────────────────────────────────────────────────────────────

export const RADIUS = {
  sm:   4,
  md:   8,
  lg:   12,
  xl:   16,
  xxl:  24,
  full: 999,
};

// ─── Spacing ──────────────────────────────────────────────────────────────────
// 8px base grid. All spacing is multiples of 4. Breathing room is cognitive rest.

export const SPACE = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  28,
  '2xl': 28,
  xxxl: 40,
  '3xl': 40,
};

// ─── Font ─────────────────────────────────────────────────────────────────────
// Keys must EXACTLY match useFonts() keys in App.tsx

export const FONT_FAMILY = {
  title:   'PlayfairDisplay_600SemiBold', // Editorial — headings, names
  heading: 'PlayfairDisplay_600SemiBold', // Alias for title (back-compat)
  serif:   'PlayfairDisplay_600SemiBold', // Alias for title (back-compat)
  body:    'Inter_400Regular',            // Readable — body text, labels
  regular: 'Inter_400Regular',            // Alias for body (back-compat)
  medium:  'Inter_500Medium',             // Emphasis — subheadings, amounts
  bold:    'Inter_600SemiBold',           // Strong — CTAs, stats
  mono:    'Inter_400Regular',            // Mono alias — back-compat
};

export const FONT_SIZE = {
  xs:   10,
  sm:   12,
  md:   14,
  base: 15,
  lg:   17,
  xl:   20,
  xxl:  26,
  hero: 40,
};

// ─── Shadows ──────────────────────────────────────────────────────────────────
// Shadows use the accent color at low opacity for an ambient glow effect,
// rather than plain black — creates a sense that surfaces float.

// Android note: shadowColor / shadowOffset / shadowOpacity / shadowRadius are iOS-only.
// On Android only `elevation` has an effect — and high values trigger an expensive
// RenderThread shadow pass on every frame. Keep Android elevation values minimal.
const IS_ANDROID = Platform.OS === 'android';

export const SHADOW = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: IS_ANDROID ? 1 : 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: IS_ANDROID ? 2 : 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: IS_ANDROID ? 3 : 14,
  },
  // Coloured ambient glow — use on accent buttons, progress rings, orbs.
  // iOS: uses shadowColor tint for ambient glow. Android: elevation only (no color).
  // FIX #11: Default was #cba6f7 (wrong theme purple). Corrected to ZenTrack's actual accent.
  accent: (color: string = '#a599ff') => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: IS_ANDROID ? 4 : 10,
  }),
};

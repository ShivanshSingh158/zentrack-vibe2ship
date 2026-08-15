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
  background:    '#000000',              // true black, OLED-friendly
  surface:       '#1c1c1d',              // primary card background (Telegram dark)
  surface2:      '#141415',              // for multi-row grouped cards
  surfaceRaised: '#2c2c2e',              // Modals / raised cards

  // ── Borders ─────────────────────────────────────────────────────────────────
  border:        '#2c2c2e',              // 0.5px lines inside grouped cards
  borderHover:   '#3c3c3e',              // Interactive hover state
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
// iOS-native feel: warm off-white system background, deep ink text, same purple accent.
export const LIGHT_COLORS = {

  // ── Backgrounds ─────────────────────────────────────────────────────────────
  background:    '#f2f1f6',              // iOS grouped background (warm off-white)
  surface:       '#ffffff',              // cards, input fields
  surface2:      '#f2f1f6',              // nested / secondary cards (same as bg)
  surfaceRaised: '#ffffff',              // modals / raised cards

  // ── Borders ─────────────────────────────────────────────────────────────────
  border:        '#e5e5ea',              // separator lines
  borderHover:   '#d1d1d6',              // interactive hover
  borderGlow:    'rgba(165,153,255,0.50)', // focus / active glow

  // ── Text ────────────────────────────────────────────────────────────────────
  textPrimary:   '#1c1c1e',              // near-black (iOS label)
  textSecondary: '#3a3a3c',              // body text
  textMuted:     '#636366',              // secondary label
  textTertiary:  '#8e8e93',              // tertiary label / timestamps

  // ── Accent — Purple (same across themes for brand consistency) ───────────────
  accentPrimary:  '#7c6ff7',             // slightly deeper purple for light bg contrast
  accentLight:    '#a599ff',             // hover state
  accentDim:      'rgba(124,111,247,0.12)', // tinted bg
  accentGlow:     'rgba(124,111,247,0.20)', // ambient glow

  // ── Success — Green ─────────────────────────────────────────────────────────
  accentGreen:     '#34c759',            // iOS system green (brighter on white)
  accentGreenDim:  'rgba(52,199,89,0.12)',
  accentGreenGlow: 'rgba(52,199,89,0.28)',

  // ── Warning — Orange ─────────────────────────────────────────────────────────
  accentAmber:    '#ff9500',             // iOS system orange
  accentAmberDim: 'rgba(255,149,0,0.10)',

  // ── Sky Blue ─────────────────────────────────────────────────────────────────
  accentBlue:      '#32ade6',            // iOS system blue
  accentBlueDim:   'rgba(50,173,230,0.12)',
  accentSecondary: '#32ade6',

  // ── Danger — Red ─────────────────────────────────────────────────────────────
  error:    '#ff3b30',                   // iOS system red
  errorBg:  'rgba(255,59,48,0.10)',

  // ── Priority ─────────────────────────────────────────────────────────────────
  priorityHigh:   '#ff3b30',
  priorityMed:    '#ff9500',
  priorityLow:    '#34c759',
  success:        '#34c759',

  // ── S.A.R.A Agent Colors (same hues, slightly adjusted for light bg) ──────────
  agents: {
    ORACLE:      '#7c6ff7',
    HERMES:      '#ff9500',
    CHRONOS:     '#32ade6',
    TITAN:       '#34c759',
    AEGIS:       '#30d5c8',
    HEPHAESTUS:  '#ff6b35',
    GAINS:       '#ff3b30',
  },
};

// ── Backwards-compat default export (always dark — screens not yet theme-aware use this) ──
// Theme-aware code should use `useTheme().colors` from ThemeContext instead.
export const COLORS = DARK_COLORS;


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

export const SHADOW = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 14,
  },
  // Coloured ambient glow — use on accent buttons, progress rings, orbs.
  // FIX #11: Default was #cba6f7 (wrong theme purple). Corrected to ZenTrack's actual accent.
  accent: (color: string = '#a599ff') => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  }),
};

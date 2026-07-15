/**
 * ZenTrack Mobile — Design Tokens v2
 *
 * Theme: "Obsidian Cosmos"
 * Philosophy: Absolute #000000 backgrounds and #1c1c1d surfaces, using the signature 
 * purple (#a599ff) for all interactive accents to provide a clean, hyper-responsive, 
 * and familiar feel.
 */

// ─── Colors ───────────────────────────────────────────────────────────────────

export const COLORS = {

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
  accentBlue:    '#89dceb',
  accentBlueDim: 'rgba(137, 220, 235, 0.14)',

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
  xxxl: 40,
};

// ─── Font ─────────────────────────────────────────────────────────────────────
// Keys must EXACTLY match useFonts() keys in App.tsx

export const FONT_FAMILY = {
  title:   'PlayfairDisplay_600SemiBold', // Editorial — headings, names
  heading: 'PlayfairDisplay_600SemiBold', // Alias for title (back-compat)
  serif:   'PlayfairDisplay_600SemiBold', // Alias for title (back-compat)
  body:    'Inter_400Regular',            // Readable — body text, labels
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
  // Default is the primary mauve. Pass any hex for module-specific glows.
  accent: (color: string = '#cba6f7') => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  }),
};

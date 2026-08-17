# ZenTrack Unified Design System & Iconography Specification
> **Universal Standard for ZenTrack Web & Mobile Applications**
> Theme: **Obsidian Cosmos (Pure Dark Mode)** & **Frost Quartz (Light Mode)**
> Design Philosophy: **Subtle, Intentional, Frictionless, iOS-Grade Fluidity**

---

## 1. Executive Aesthetic Philosophy

ZenTrack follows a **Pure Obsidian Cosmos** visual design language:
- **True OLED Pitch Black Canvas (`#000000`)**: Eliminates muddy gray backdrops and maximizes contrast and battery life.
- **Elevated Monolithic Slate Surfaces (`#141416`, `#1c1c1f`)**: Subtle hierarchy without heavy drop shadows or visual noise.
- **Hairline Precision Borders (`#242428`, `rgba(255, 255, 255, 0.08)`)**: Crisp structural separation that feels native to modern iOS and macOS.
- **Signature Cool Accent Harmony**: Tailored cool purples (`#A599FF`), celestial cyans (`#38BDF8`), mint emeralds (`#5EDA9E`), warm ambers (`#F59E0B`), and pulse roses (`#FF6961`).
- **Editorial Typography Pairing**:
  - **Headings & Key Metrics**: `Playfair Display (600)` / `Instrument Serif` — elevates the experience from a generic dashboard to a luxury personal operating system.
  - **Body & Data Grid**: `Inter (400, 500, 600, 700)` — hyper-legible, crisp numerals and clean tabular alignment.

---

## 2. Universal Color Palette (Web & Mobile)

### A. Dark Mode: "Obsidian Cosmos" (Default & Primary)

| Token Name | Hex Code | rgba / Opacity | Purpose & Application |
|---|---|---|---|
| `--color-bg` | `#000000` | `rgb(0, 0, 0)` | Root screen canvas / OLED black |
| `--color-surface` | `#141416` | `rgb(20, 20, 22)` | Primary card backgrounds, row containers |
| `--color-surface-2` | `#1c1c1f` | `rgb(28, 28, 31)` | Nested cards, pill buttons, search bars, inputs |
| `--color-surface-raised`| `#18181b` | `rgb(24, 24, 27)` | Modals, bottom sheets, floating overlays |
| `--color-border` | `#242428` | `rgba(255, 255, 255, 0.08)` | Standard hairline borders |
| `--color-border-hover`| `#2e2e34` | `rgba(255, 255, 255, 0.14)` | Hover & active stroke |
| `--color-border-glow` | `#a599ff` | `rgba(165, 153, 255, 0.35)` | Focused inputs, active tab rings |
| `--text-primary` | `#ffffff` | `rgba(255, 255, 255, 1.0)` | Headings, hero numbers, primary labels |
| `--text-secondary` | `#f2f2f7` | `rgba(242, 242, 247, 0.92)` | Card body text, standard readable copy |
| `--text-muted` | `#8e8e93` | `rgba(142, 142, 147, 0.70)` | Subtitles, metadata, inactive tab icons |
| `--text-tertiary` | `#636366` | `rgba(99, 99, 102, 0.50)` | Timestamps, micro-badges, hints |

### B. Cool Accent Palette

| Accent Name | Primary Hex | Soft Dim (Background) | Glow / Stroke | Mood / Semantic Domain |
|---|---|---|---|---|
| **Cosmic Lavender** | `#A599FF` | `rgba(165, 153, 255, 0.12)` | `rgba(165, 153, 255, 0.28)` | Signature ZenTrack brand, Tasks, Grades, SARA |
| **Celestial Cyan** | `#38BDF8` | `rgba(56, 189, 248, 0.12)` | `rgba(56, 189, 248, 0.28)` | Calendar, Schedules, Attendance Classes, Analytics |
| **Mint Emerald** | `#5EDA9E` | `rgba(94, 218, 158, 0.12)` | `rgba(94, 218, 158, 0.28)` | Success, Attendance Safe, Done status, High SGPA |
| **Solar Amber** | `#F59E0B` | `rgba(245, 158, 11, 0.12)` | `rgba(245, 158, 11, 0.28)` | Habits, Streaks, Warnings, Near-deadline tasks |
| **Pulse Rose** | `#FF6961` | `rgba(255, 105, 97, 0.12)` | `rgba(255, 105, 97, 0.28)` | Overdue items, Gym workouts, Attendance Low Alert |
| **Velvet Violet** | `#818CF8` | `rgba(129, 140, 248, 0.12)` | `rgba(129, 140, 248, 0.28)` | OKRs, Goals, Weekly Reviews, Learning Paths |
| **Alabaster Warm** | `#FAD7A1` | `rgba(250, 215, 161, 0.12)` | `rgba(250, 215, 161, 0.28)` | Notes Vault, Labs, Storage Nodes |

---

## 3. Module-by-Module Icon & Color Uniformity Matrix

Every single module in both Web and Mobile follows this exact icon and color mapping:

| Module / Feature | Web Icon (Lucide) | Mobile Icon (Ionicons) | Primary Color | Dim Tint | Semantic Badge / State |
|---|---|---|---|---|---|
| **1. Dashboard (Home)** | `LayoutDashboard` | `grid-outline` / `home-outline` | `#A599FF` | `rgba(165,153,255,0.12)` | Daily Briefing status pill |
| **2. Tasks & Todos** | `CheckSquare` | `checkbox-outline` | `#A599FF` | `rgba(165,153,255,0.12)` | Priority stripes (Red/Amber/Green) |
| **3. Calendar & Timeline** | `Calendar` | `calendar-outline` | `#38BDF8` | `rgba(56,189,248,0.12)` | Time blocks & Conflict alerts |
| **4. Notes Vault** | `BookOpen` | `book-outline` | `#FAD7A1` | `rgba(250,215,161,0.12)` | Storage Node & Tag chips |
| **5. Attendance Tracker** | `GraduationCap` | `school-outline` | `#38BDF8` | `rgba(56,189,248,0.12)` | Safe `≥75%` / Warning / Danger pills |
| **6. Habits & Streaks** | `Zap` | `flash-outline` | `#F59E0B` | `rgba(245,158,11,0.12)` | Flame streak count pill |
| **7. Grades & CGPA** | `Award` | `ribbon-outline` | `#A599FF` | `rgba(165,153,255,0.12)` | SGPA pill & Target simulator |
| **8. Assignments** | `FileText` | `document-text-outline`| `#F472B6` | `rgba(244,114,182,0.12)`| Due Relative badge (`Due Today!`) |
| **9. Zen Gym & Workout** | `Dumbbell` | `barbell-outline` | `#FF6961` | `rgba(255,105,97,0.12)` | Target Muscle & Rest Timer pill |
| **10. Learning Checklist** | `Compass` | `compass-outline` | `#5EDA9E` | `rgba(94,218,158,0.12)` | Subtask step checklist |
| **11. Goals & OKRs** | `Target` | `flag-outline` | `#818CF8` | `rgba(129,140,248,0.12)`| Key Results progress bar |
| **12. Weekly Review** | `Layers` | `layers-outline` | `#818CF8` | `rgba(129,140,248,0.12)`| Grade & reflection score |
| **13. Jobs & Careers** | `Briefcase` | `briefcase-outline` | `#FBBF24` | `rgba(251,191,36,0.12)` | Pipeline stage chip |
| **14. S.A.R.A Companion** | `Sparkles` / `Bot` | `sparkles-outline` | `#A599FF` | `rgba(165,153,255,0.18)`| Central Glass Orb Mascot |

---

## 4. Subtle, Minimalist iOS-Style Tab & Navigation Design

### A. Bottom Navigation Bar (Mobile) & Floating Navigation Dock (Web)
1. **Frosted Glassmorphism**:
   - `background: rgba(14, 14, 16, 0.78)`
   - `backdrop-filter: blur(20px) saturate(180%)`
   - `border-top: 1px solid rgba(255, 255, 255, 0.08)`
2. **Active Tab States**:
   - Icon glows in **`#A599FF`** with subtle ambient drop-shadow (`drop-shadow(0 0 6px rgba(165, 153, 255, 0.45))`).
   - Pill indicator or active dot below the active tab.
   - Text label transforms to `font-weight: 600`, color `#ffffff`.
3. **Inactive Tab States**:
   - Icon color: `#8E8E93` (muted iOS gray), opacity `0.65`.
   - Text label: `font-size: 0.65rem`, `font-weight: 500`, color `#8E8E93`.
   - Zero jarring borders or bulky box backgrounds.
4. **Scroll-Morphing Header Action Pills**:
   - When at the top of a screen: buttons sit transparently against the canvas.
   - On scroll (`scrollY > 20px`): action buttons smoothly morph into **frosted glass pills** (`padding: 6px 12px`, `background: rgba(28, 28, 31, 0.85)`, `border: 1px solid rgba(255, 255, 255, 0.08)`).

---

## 5. Subtle Micro-Interactions & Spring Dynamics

| Element | Spring Curve / Transition | Visual Effect |
|---|---|---|
| **Buttons & Interactive Cards** | `cubic-bezier(0.16, 1, 0.3, 1)` (300ms) | Scale `0.98` on press, subtle lavender border illumination |
| **Modals & Bottom Sheets** | Spring `{ damping: 24, stiffness: 300 }` | Smooth glide from bottom with backdrop blur `12px` |
| **Switches & Segmented Controls** | `spring({ stiffness: 500, damping: 35 })` | Gliding thumb with hairline outline and soft glow |
| **Progress Meters & Charts** | `ease-out-expo` (600ms) | Smooth stroke-dashoffset interpolation |
| **Toast & Floating Pill Badges** | `spring({ stiffness: 450, damping: 30 })` | Slide in from bottom-right / top with zero layout jitter |

---

## 6. Web & Mobile Real-Time Sync & Component Parity Checklist

When adding or refactoring ANY screen or component:
- [ ] **Exact Theme Tokens**: Use defined CSS variables on Web and `DARK_COLORS` tokens on Mobile.
- [ ] **Typography**: Titles use `Playfair Display (600)` with letter-spacing `-0.02em`. Subtitles and body use `Inter`.
- [ ] **Icons**: Use the exact icon pair defined in Section 3 (`lucide-react` on Web, `@expo/vector-icons (Ionicons)` on Mobile).
- [ ] **Borders**: Never use thick or colored borders on resting cards. Use `1px solid var(--color-border)` (`#242428`).
- [ ] **Badges & Pills**: Use `rgba(accent, 0.12)` background, `1px solid rgba(accent, 0.28)` border, and full-intensity accent color text.
- [ ] **No Dead Space**: Tight, lifted vertical rhythm with consistent padding (`14px` - `18px`).

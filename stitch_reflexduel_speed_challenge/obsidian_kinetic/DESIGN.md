---
name: Obsidian Kinetic
colors:
  surface: '#111317'
  surface-dim: '#111317'
  surface-bright: '#37393d'
  surface-container-lowest: '#0c0e11'
  surface-container-low: '#1a1c1f'
  surface-container: '#1e2023'
  surface-container-high: '#282a2d'
  surface-container-highest: '#333538'
  on-surface: '#e2e2e6'
  on-surface-variant: '#bbcabf'
  inverse-surface: '#e2e2e6'
  inverse-on-surface: '#2f3034'
  outline: '#86948a'
  outline-variant: '#3c4a42'
  surface-tint: '#4edea3'
  primary: '#4edea3'
  on-primary: '#003824'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#006c49'
  secondary: '#ffb2b7'
  on-secondary: '#67001b'
  secondary-container: '#b50036'
  on-secondary-container: '#ffc2c4'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#e29100'
  on-tertiary-container: '#523200'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#ffdadb'
  secondary-fixed-dim: '#ffb2b7'
  on-secondary-fixed: '#40000d'
  on-secondary-fixed-variant: '#92002a'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#111317'
  on-background: '#e2e2e6'
  surface-variant: '#333538'
typography:
  display-hero:
    fontFamily: JetBrains Mono
    fontSize: 72px
    fontWeight: '700'
    lineHeight: 80px
    letterSpacing: -0.04em
  display-hero-mobile:
    fontFamily: JetBrains Mono
    fontSize: 44px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.03em
  display-metric:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-metric-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  label-mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.06em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-desktop: 2rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system channels the focused kinetic energy of Monkeytype combined with the metric precision and fluid tactility of Apple Fitness. Designed specifically for competitive reaction speed, click tests, and high-frequency cognitive duels, the interface eliminates cognitive noise to maximize human reflex latency.

The aesthetic blends **Modern Dark Minimalism** with **Tactile Precision**. The user feels dialed into an ultra-low-latency cockpit: surfaces are deeply matte, text is hyper-legible, metrics read like instrument gauges, and micro-interactions reward physical performance with tactile visual feedback. The emotional cadence balances high-stakes anticipation with calm, frictionless focus.

## Colors

The palette establishes immediate situational awareness through strict functional role-mapping:

- **Neutral Canvas (`#0B0D10`)**: Deep matte obsidian background providing infinite contrast while eliminating eye strain during prolonged sessions.
- **Card & Surface Slate (`#14181F`)**: Elevated tactile deck layer paired with a structural hairline border (`#222936`).
- **Primary / Strike Emerald (`#10B981`)**: Signals "Go", active targets, optimal reflex triggers, accuracy confirmation, and personal best indicators.
- **Secondary / Tension Coral (`#F43F5E`)**: Signals "Ready / Hold / Wait", premature click faults, penalty states, and countdown friction.
- **Tertiary / Prestige Amber (`#F59E0B`)**: Reserved for trophies, leaderboard rank, win streaks, and percentile tiers.
- **Typography & Details**: Core typography relies on pure `#FFFFFF` for primary readouts and `#94A3B8` for secondary labels, stats headers, and inactive states.

## Typography

The typographic hierarchy separates structural clarity, narrative prose, and analytical telemetry:

- **Timers, Miliseconds & Raw Readouts**: Rendered exclusively in `JetBrains Mono` with tabular numbers enabled (`tnum`) to eliminate layout jitter during high-speed live counter ticks.
- **Display Headlines & Mode Selectors**: Styled in `Space Grotesk` for a sharp, technical, and kinetic silhouette.
- **Instructional Prose & UI Elements**: Styled in `Plus Jakarta Sans` for organic legibility, balance, and modern softness.
- **Labels & Micro-telemetry**: Monospaced small caps for stats, ranks, and split times (`label-mono-sm`), ensuring high scannability during fast-paced play.

## Layout & Spacing

This design system uses a centered, viewport-anchored layout optimized for zero eye movement during trials:

- **Canvas Architecture**: Centered fixed-width containers across desktop (max-width `1080px` for dashboards, max-width `760px` for the core duel arena) ensuring peripheral vision is completely focused on the trigger zone.
- **Grid Structure**: A responsive 12-column layout on desktop, 8 columns on tablet, and 4 columns on mobile.
- **Reflow & Breakpoints**:
  - **Desktop (≥1024px)**: Dual telemetry bars flanked around the primary interaction arena; side-by-side leaderboard and live duel splits.
  - **Tablet (768px - 1023px)**: Metrics collapse to a horizontal cluster directly above the duel trigger card.
  - **Mobile (<768px)**: Edge-to-edge arena card with `margin: 1rem` safe inset, fixed touch-target zones occupying minimum 55% of the viewport height.

## Elevation & Depth

Visual depth is achieved through **tonal stratification and sharp hairline separation** rather than heavy blurred drop shadows:

- **Base Layer**: Background Matte Obsidian (`#0B0D10`).
- **Surface Layer 1 (Arena & Dashboard Cards)**: Soft Slate (`#14181F`) overlaid with an ultra-crisp 1px border (`#222936`). No diffused outer shadow; this creates an athletic, flat deck profile.
- **Surface Layer 2 (Tactile Controls & Keys)**: Lifted slate (`#1C232D`) with a dual hairline border (top border highlighted at `#2E384A` for a physical top-lit beveled rim).
- **Interactive State Elevation**:
  - **Wait State**: Soft Slate glows with an ambient, tightly bound perimeter aura of Warm Coral (`rgba(244, 63, 94, 0.15)`).
  - **Reaction Active State**: Card instantly flashes or casts an intense, focused kinetic glow of Vibrant Emerald (`rgba(16, 185, 129, 0.25)`).
  - **Pressed / Depressed**: Scale transforms slightly down to `0.985` with zero offset shadow to mimic mechanical travel.

## Shapes

The design system incorporates oversized geometric curvatures to reference athletic hardware, smart ring tracking cards, and ergonomic game peripherals:

- **Arena Cards & Major Containers**: Styled with `rounded-3xl` (`2rem` / `32px`) radii, providing a generous curved framing that isolates central content.
- **Sub-cards, Stat Widgets, & Leaderboard Rows**: Formed with `rounded-2xl` (`1.5rem` / `24px`).
- **Interactive Controls, Chips & Pills**: Fully rounded pill shapes (`rounded-full` / `9999px`) to invite confident, rapid tapping.

## Components

### Duel Trigger Arena (Click/Reaction Target)
- The core interaction vessel. Renders as a massive card (`rounded-3xl`) with high touch/click affordance.
- **Idle State**: Dark Slate (`#14181F`), border `#222936`, mono prompt "Click or Press Space to Begin".
- **Wait State**: Background shifts to a deep crimson tint (`#1F1317`), border pulses in Warm Coral (`#F43F5E`), dynamic countdown or random latency delay text reads "WAIT FOR GREEN".
- **Trigger State**: Background shifts to deep emerald tint (`#0D281E`), border snaps to `#10B981`, bold Space Grotesk text reads "CLICK!".
- **Fault State**: Brief micro-shake animation, Warm Coral flash, score labeled as premature trigger.

### Buttons & Quick Actions
- **Primary Button**: Solid Vibrant Emerald (`#10B981`) text in `#0B0D10` (pure dark slate), pill-shaped, JetBrains Mono medium tracking. Hover states subtly lift opacity; active state initiates instant `transform: scale(0.96)`.
- **Secondary / Ghost Button**: Hairline border (`#222936`) over transparent slate surface, Crisp White typography, glowing to Emerald outline on hover.
- **Keycap Badges**: Rendered inline to indicate shortcuts (e.g., `SPACE`, `R` for restart) using monospaced styling, slight top border bevel (`#2E384A`), and muted gray labels.

### Mode & Difficulty Chips
- Pill-shaped selectors arranged in zero-gap segmented groups or spaced rows.
- Inactive: `#14181F` background, text `#94A3B8`.
- Active: Background shifts to `#1C232D` with a crisp 1px Emerald (`#10B981`) accent outline and Crisp White text.

### Metric & Telemetry Rings/Cards
- Inspired by Apple Fitness summary rings: compact, rounded cards displaying single reaction latency metrics (e.g., "162 ms", "98.4% Acc", "12.4 CPS").
- Metric numbers use `JetBrains Mono` or `Space Grotesk` with high visual weight, paired with an uppercase muted sub-label (`#94A3B8`).

### Leaderboard & Duel Lists
- Monolithic row cards with alternating subtle zebra states or separated by `space-sm` gaps.
- Rank column: Rank #1-3 highlighted with Golden Amber (`#F59E0B`) badges.
- Player identifier in crisp white `Plus Jakarta Sans`; reaction speed split displayed right-aligned in high-contrast emerald or white mono figures.

### Form Inputs & Sensitivity Sliders
- Minimal dark inputs with embedded mono unit labels (e.g., `ms`, `clicks`, `sec`). Focus states glow with 1px Vibrant Emerald border. Slider tracks feature high-contrast filled rails with physical emerald thumb heads.
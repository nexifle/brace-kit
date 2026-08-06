# /design.md — Whole-Deck Visual System Template

Define ONE visual system that applies across all slides and all variants.
Variants differ in content and layout (documented in `/brief.md`), NOT in the
design system — so `design.md` stays singular and shared. If a variant has a
small visual flavor (applies the accent more heavily, or swaps imagery style),
note it in "Variant notes" — as *application of the shared system*, never a
second system.

````markdown
# <Deck Title> — Design Concept

## Concept
The one-sentence creative idea / vibe behind the deck (e.g. "clean, light,
data-forward tech aesthetic with a neon accent").

## Canvas & Layout System
- Canvas: <width>×<height> (<aspect>) — must match /deck.json
- Safe zone: <inner bounds, margins — e.g. ~40–90px on a 1080-wide canvas>
- Margins & spacing scale: <consistent spacing values>
- Grid / layout template: <how slides are consistently laid out>

## Color Palette
- Background: <hex> — <usage>
- Primary: <hex> — <usage>
- Accent: <hex> — <usage>
- Text / supporting: <hex> — <usage>
- (2–5 colors max, used deliberately)

## Typography
- Fonts: <max 2 fonts> — <role for each>
- Sizes: headline / body / accent (≥40px headline on a 1080-wide canvas; scale
  with the canvas)
- Hierarchy: <how the 2–3 levels are weighted>

## Visual Style
- Imagery style: <photo vs illustration vs icon, and the mood>
- Illustration/icon treatment: <line style, fill, consistent stroke>
- Effects: <gradients, shadows, glows, noise — keep minimal>

## Elements & Decorative System
- **Element families in use:** <which families from the element palette this deck
  leans on — shapes, patterns, typographic devices, data elements, media, layout
  composition. Name the ones in use.>
- **Element styling:** <how each of those elements is styled in the shared
  system, e.g. gradient shapes at 10% opacity diagonal; dot patterns at 8px/12px
  spacing; stat slabs in primary at ≥120px; icon badges in a 160px circle with
  2px stroke; cards with 24px radius + hairline — all scaled to the canvas.>
- **Sample element mix:** <1–2 concrete examples of a slide's element
  composition, e.g. "stat slide = huge '68%' slab + footnote + thin rule" or
  "hook slide = gradient shape + single icon + continue chip".>
- **Consistency:** <which motifs recur across ≥2 slides so they read as a system,
  not one-offs.>

## Variant notes
This system is SHARED across all variants — variants differ in content and layout
(/brief.md), not in the design system. Note only the small ways each variant
applies the shared palette/typography/imagery differently (e.g. "Variant B
applies the accent color to headlines"). If a variant introduces a different
visual, it is an application of this system, not a new one.

## Consistency Rules
- Same template structure on every slide; vary content, never structure.
- Brand mark/logo/watermark in the same corner position on each slide.
- 2–5 brand colors max, used deliberately.

## Accessibility & Readability
- ≥40px headline type (scaled to canvas), high-contrast text on solid backgrounds,
  readable in any lighting.
````

## Rules

- **Singular, shared system** — variants differ in content/layout (`/brief.md`),
  never in the design system.
- **Write copy before design** — the brief (`/design.md`'s sibling) comes first.
- **Keep it buildable** — the build phase must translate this into
  `/theme.css` + per-slide HTML/CSS via `apply_patch`. Design is **HTML + CSS
  only** — no slide JS, no chat-HTML dumps as the delivery channel.
- Consistent radii/spacing/shadow vocabulary so every element reads as part of
  one system.

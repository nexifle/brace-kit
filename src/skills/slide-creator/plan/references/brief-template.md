# /brief.md — Per-Slide Content Spec Template

Use this structure so the build phase reads it deterministically. Write **REAL
copy** (actual headlines and subtext), not `[placeholder]` tokens, so the user
can review and edit. Prefer plain **markdown** over tables for the content spec.
Draw the decorative elements named below from the `element-palette.md` catalog.

````markdown
# <Deck Title> — Slide Brief

## Overview
- Niche: ...
- Audience: ...
- Goal: ...
- Slide count: N
- Canvas / aspect: <e.g. 16_9, 4_5, 9_16 — must match /deck.json>
- Variants per slide: M (if the user asked for variants; omit otherwise)

## Slide Arc
A one-line description of the deck's story arc (hook → value → proof/CTA) and
where each slide sits in it.

## Slide-by-Slide

### Slide 1 — <role/label>
**Purpose:** <what this slide must achieve in the hook/retention arc>
- **Layout:** <region arrangement, e.g. headline top / image center / CTA bottom>
- **Headline:** <exact copy, ~5–10 words on slide 1>
- **Supporting copy:** <short subtext, 30–50 words max>
- **Visual / image placeholder:** <what image / illustration / icon goes here and
  what it should depict — specific enough for a designer/builder to generate>
- **Elements:** <decorative elements from element-palette.md, named and located —
  e.g. gradient shape, dot pattern, stat slab, icon badge, tag chip, diagram.
  Omit if the slide reads better text-only.>
- **CTA / continue hint:** <any CTA or "keep going / swipe →" prompt>
- **Progress indicator:** <e.g. "1/10" if shown>
- **Editable / changeable elements:** <which elements are meant to be swapped —
  content, image, icon, CTA — and which are fixed>

### Slide 2 — <role/label>
… (repeat the same template for every slide, calling out where they differ)
````

## Per-slide fields to always cover

- **Purpose** — the slide's job in the arc (hook, context, value, proof, CTA).
- **Layout** — the region arrangement (top/middle/bottom).
- **Headline** — exact copy; 5–10 words on slide 1, one sentence elsewhere.
- **Supporting copy** — short subtext, 30–50 words max total.
- **Visual / image placeholder** — what image/illustration/icon to place and
  what it should depict; specific enough that a builder knows what to generate.
- **Elements** — decorative elements when appropriate, drawn from
  `element-palette.md`; name each and where it sits. Add them when they serve the
  slide or the user asked for a visually rich deck — a minimal/editorial brief
  may legitimately use none. Give every slide ≥1 visual anchor so none is bare
  text.
- **CTA / continue hint** — where the CTA / "keep going / swipe →" prompt goes.
- **Progress indicator** — "3/10" style, if present.
- **Editable / changeable elements** — which elements are meant to be swapped and
  which are fixed. This is the "what can be changed, shifted" part the brief must
  capture.

## Variants (only if the user asked for them)

Variant differences are **content/layout-level** (what's on the slide, how it's
arranged, what image/icon is used) — NOT a different design system. The design
system (colors/fonts) is shared and lives in `/design.md`. So the brief documents
each variant's layout, copy, and visual choices, and the design doc notes how
each variant applies the shared system.

While documenting a variant slide:
- Keep the same field set as Variant A; call out where B (C…) differs.
- **Layout:** how this variant differs from the first variant's layout.
- **Headline / copy:** exact text for this variant.
- **Elements:** how the element mix differs (same system, different elements —
  e.g. A uses a gradient + small icon; B uses a bold shape stack + big stat slab).

## Rules

- **Write copy before design** — draft the content spec first, then the visual
  system (`/design.md`).
- **One focal point per slide** — single concept, single visual, one short
  supporting sentence.
- **No paragraphs on slides** — if it looks like a paragraph, it belongs in
  supporting text, not on the slide.
- **Emit usable, real copy**, never `[headline]`-style placeholders.
- **Consistency is the cohesion signal** — same layout structure every slide,
  varied content.

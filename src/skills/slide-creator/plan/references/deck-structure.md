# Slide Deck — Story Structure & Design Best Practices Reference

Read this before writing `/brief.md` or `/design.md`. It captures what deck
research says about attention, retention, and visual design, generalized across
aspect ratios (the Slide Creator is canvas-agnostic — `16:9`, `4:5`, `9:16`, …).
Use it so the plan is *defensible*: every choice should trace back to a principle
here. When research tools are available, refresh/augment these with current
sources; this is the durable baseline, not the last word.

> **Caveat:** engagement benchmarks vary wildly across platforms and vendors
> (different denominators). Treat all figures as directional, not gospel.

---

## The story arc

Structure a deck like a story, not a slideshow:

- **Opening (hook + context).** A scroll-stopping first slide — bold, one focal
  point, opens an information gap so the viewer *needs* to advance. A short
  context/problem slide so it stands alone.
- **Value delivery (middle).** One idea, framework, tip, step, or data point per
  slide, with micro-hooks and open loops between slides that pull the viewer
  forward.
- **Proof / summary + CTA (end).** Recap the value, land one clear call to
  action. A soft mid-deck CTA plus a hard final CTA, since many viewers never
  reach the last slide.

### Opening slide

It's the 2-second audition — the only part most people ever see. If it doesn't
stop the scroll, the rest doesn't exist.

- Bold, high-contrast visual; **one sentence (5–10 words)** max.
- Single focal point, no clutter; open an **information gap**.
- Rotate hook types (curiosity gap → value promise → pattern interrupt) — any
  single format loses effectiveness after a few consecutive uses. Never open with
  a generic greeting.

### Follow-through

- Treat slide 2 as a **standalone hook** — a re-serve / re-show may present it to
  someone who never saw slide 1, so no slide should depend on a previous one.
- Use **open loops between slides** — tease the next slide ("slide 6 is where
  most decks go wrong →") to lift completion. Let no slide fully resolve —
  keep a thread dangling until the closing slide.
- **Slide count:** the sweet spot is **7–10**. Fewer than 5 is too shallow; 10+
  craters completion. Keep mid-slides tight (engagement sags in the middle).
- **Continue + progress indicators:** a "3/10" counter and a small
  "keep going / swipe" hint placeholders strategically (opening, mid, pre-CTA) —
  unknown length makes viewers bail early.
- **CTAs belong throughout**, not just the end: a soft mid-deck CTA plus the hard
  final one.

---

## Design principles

### Canvas & safe zones
- Use **one aspect ratio per deck** — the opening slide's ratio locks the whole
  deck; mixing ratios force-crops everything to match.
- Keep critical content (text, logos, faces) inside a **safe zone** with clear
  margins roughly **4–9% of the canvas width** (e.g. ~40–90px on a 1080-wide
  canvas), scaled to the deck, for device cropping and any UI chrome (slide
  counter, dots).

### Typography — hierarchy is the #1 design lever
- Minimum ~40px type on a 1080-wide canvas (24pt body / 36pt+ headings); scale
  with the canvas.
- One sentence per slide by default; **30–50 words absolute max** — a paragraph
  belongs in supporting text, not on the slide.
- **2–3 hierarchy levels:** headline in primary, data/example in accent,
  supporting copy in muted tone.
- **Max 2 fonts** per deck; prioritize legibility over decorative fonts.

### Contrast & readability
- Bold text on solid (non-busy) backgrounds; readable in any lighting.
- Vary color/size between levels so viewers never wonder what to read first.
- High contrast also serves accessibility.

### Consistency — the cohesion signal
- Same template, layout structure, margins, colors, and background treatment on
  every slide; vary the *content*, never the structure.
- Brand marks/watermarks in the same corner position on each slide.
- **2–5 brand colors max**, used deliberately (headers/CTAs in brand colors,
  backgrounds muted).

### One focal point per slide
- Single concept, single visual, one short supporting sentence.
- Viewers absorb a slide in ~2–3 seconds — if it takes longer, it's too dense.
- Whitespace is your friend; clutter is the #1 design error.

### Design process rules
- **Write copy before designing** — message first, visuals second.
- Design the opening slide as a scroll-stopper in its real context.
- Reuse a master template across posts/decks — recognizability compounds.

## DO vs AVOID

| DO | AVOID |
|---|---|
| 7–10 slides, one aspect ratio throughout | Epics with mixed ratios / force-crops |
| Bold 5–10 word hook on slide 1 + continue hint | Generic titles, no curiosity gap |
| Slide 2 as a standalone hook | Slide 2 that depends on slide 1 |
| Open loops / micro-hooks on every slide | Fully-resolved slides with nothing dangling |
| CTA mid-deck + final; progress "3/10" | CTA only on the last slide |
| ≥40px type, high contrast, ≤2 fonts, consistent template | Paragraphs on slides, low contrast, mismatched layouts |

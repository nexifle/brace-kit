# Decorative Element Palette — the "drag-and-drop" library

Think of the slide canvas as a blank workspace with a **drag-and-drop element
library** on the side. The plan decides which elements to place on each slide,
how many, and where; the build phase renders them. This catalog IS the library —
every element to choose from, when it's appropriate, and how to style it.

**How to use this reference:**
- **You decide** which elements each slide needs — never fill a slide with
  everything. Select a few supporting elements per slide and leave the rest out.
- Every decorative element you pick must obey the shared design system in
  `/design.md` (its palette, radius, stroke weight, pattern scale) so the deck
  stays one visual system.
- Elements are **supporting actors**. The headline + one focal point stay the
  lead. Decorative elements fill space, add rhythm, signal meaning — they never
  compete with the message.
- If a decoration would make the slide busier instead of clearer, drop it.
- Reference elements in `/brief.md` by these exact names so the builder knows
  precisely what to draw — and a designer could later swap anything in this
  catalog.

> Canvas note: sizes below assume a ~1080-wide canvas; **scale up/down with the
> actual canvas** (a `9:16` portrait or a `16:9` landscape re-weights spacing and
> type). The ratio is what matters, not absolute pixels.

---

## 1. Shape & geometry

Clean geometric forms layered behind/around content. The backbone of most modern
slide systems.

- **Gradient shape** — a soft (mostly transparent) color field behind a
  headline/visual to add depth or lift a focal area without a busy image.
  - *Use when:* a slide feels flat; to anchor a text zone; to add brand color in
    large doses without dominating. Great on the opening slide.
  - *Style:* diagonal or radial; primary→accent gradient at 8–20% opacity; one
    per slide.
- **Geometric shape / stencil** — solid or outlined circle, square, ring,
  triangle, hexagon, rounded rect. Used as a badge behind a number, a frame
  around an icon, or a corner accent.
  - *Use when:* you need to group things, badge a stat, or fill a blank corner.
  - *Style:* palette's surface shade or a hairline outline; a consistent radius
    family (e.g. 16/24/48px); max 2–3 shapes per slide.
- **Dividing line** — a thin hairline separating zones or stacking list items.
  - *Use when:* a list gets long, or headline vs content needs a clean edge.
  - *Style:* 1–2px, muted text color at 40–60% opacity, full or dashed.
- **Grid / layout guide** — faint grid, dot matrix, or column guides behind
  content.
  - *Use when:* a "spec / architecture / blueprint" look (tech, data, B2B).
  - *Style:* very low opacity (≤10%), mono-line or dots, strictly behind content.
- **Frame / border** — a thin box around a whole slide's content, or around one
  element.
  - *Use when:* an editorial, poster, or "window" mood; to contain a visual.
  - *Style:* 2–4px in accent or muted color; generous inner padding; consistent
    on the slides that use it.

## 2. Pattern & texture

Repeated motifs that fill backgrounds or bands. Use sparsely — patterns are the
easiest way to make a slide look busy.

- **Dot pattern** — evenly spaced dots, or a halftone gradient (large→small =
  depth).
  - *Use when:* filling an empty band; a "data/tech" or "playful" feel; subtle
    full-slide texture at low contrast.
  - *Style:* dot size 4–12px, spacing ≥2× size, ≤12% opacity if background.
- **Grid-line pattern** — repeating lines (graph paper) or a fine grid.
  - *Use when:* blueprint/technical/dashboard moods.
  - *Style:* same rules as the grid guide but as a repeating band or corner block.
- **Tessellation / geometric repeat** — repeating triangles, hexagons, waves,
  zigzags forming a texture.
  - *Use when:* an artful or brand-motif background across a few slides.
  - *Style:* palette's background-on-background (very muted); one motif per deck.
- **Noise / grain** — subtle film grain over a flat color for a tactile,
  printed, or artisanal feel.
  - *Use when:* warm, premium, editorial, vintage vibes. Avoid on purely "clean
    tech" decks.
  - *Style:* 2–4% opacity overlay; never over faces.
- **Line-work flourish** — hand-drawn-ish strokes: underlines, wavy rules,
  splatters, asterisks, arrows scribbled around text.
  - *Use when:* playful, artisanal, or "handcrafted" tone; to point at a headline
    or CTA without a stiff shape.
  - *Style:* consistent stroke ~2–3px; accent or warm-muted color; one flourish
    per slide.

## 3. Typographic devices

Elements made of type or from editorial conventions. High "meaning per pixel".

- **Pull quote / blockquote** — one important sentence displayed large, short
  rule + citation label, often an oversized quotation mark as the graphic.
  - *Use when:* a slide exists to land one memorable line (proof, principle,
    founder voice).
  - *Style:* headline font in primary; giant quote glyph (large) in accent at low
    opacity; label in caption style.
- **Kicker / eyebrow label** — a tiny uppercase label above a headline ("ORIGIN",
  "STEP 3 OF 6").
  - *Use when:* every slide that benefits from context or a section marker.
  - *Style:* mono or sans, letter-spaced 0.12–0.2em, accent color, small relative
    to headline.
- **Stat slab / big number** — an oversized numeral with a small unit/caption.
  The data-first slide's workhorse.
  - *Use when:* anything numeric is the point (stats, counts, time, cost).
  - *Style:* tabular numerals or mono, ≥120px on 1080-wide, primary color; unit
    in muted caption. Donut/gauge only as a complement.
- **List / checkmarks** — a stacked list with a marker ("—", "·", check, or
  numbered). The default for "steps", "tips", "features".
  - *Use when:* enumerating (3 principles, 5 steps, components).
  - *Style:* markers colored, items at body size, consistent vertical rhythm
    (≥1.4 line height), 2–6 items max.
- **Footnote / source tag** — small attribution ("Source: NIST SP 800-207").
  - *Use when:* any real stat or claim needs credibility — highly valuable in
    B2B/data decks.
  - *Style:* caption size, muted color, mono optional, bottom of the slide.
- **Hashtag / tag chip** — a pill or chip with a micro-label that groups/labels
  content.
  - *Use when:* to tag a slide's theme, or as a "part of a series" marker.
  - *Style:* pill with surface fill + hairline; caption text; consistent radius.

## 4. Data & diagram elements

Built-in charts and diagram scaffolding. Keep each simple; one per slide max.

- **Chart (mini)** — bar, donut, line, or sparkline. A real-data visual.
  - *Use when:* a number deserves a shape; comparing values; a "data/stats"
    variant.
  - *Style:* 1–2 colors max (primary data, accent highlight); no gridlines or
    legends on mini charts; label the single takeaway, not every axis.
- **Diagram / flow** — process nodes with connectors (routes, steps, branches).
  - *Use when:* teaching a sequence, system, or structure (how-it-works decks).
  - *Style:* nodes as shared-radius shapes, connectors 2–3px in primary/route
    color, arrowheads, left→right or top→bottom.
- **Timeline** — a milestone strip (dots on a line) with short labels.
  - *Use when:* chronology, roadmap, phases.
  - *Style:* line in muted color, milestone dots in accent, labels in caption,
    ≤5 milestones.
- **Comparison / 2-column** — two panels side by side (before/after, vs., pro/con).
  - *Use when:* contrast or choice ("old way vs new way").
  - *Style:* identical panels so the difference reads in content; one side gets
    the accent tint to mark the winner/right way.
- **Progress indicator** — the "3/10" counter or a thin progress bar.
  - *Use when:* near-mandatory on any multi-slide deck (see `deck-structure.md`).
  - *Style:* numerals bottom corner; optional slim rail in accent.

## 5. Media & imagery devices

Frames and treatments for photos and illustrations.

- **Photo frame / card** — image in a shaped frame (rounded-rect card, circle
  crop, polaroid with caption strip).
  - *Use when:* any photography on a designed slide.
  - *Style:* radius consistent with the system; optional hairline border;
    consistent shadows if the system uses them.
- **Image with overlay** — full-bleed photo under a dark/gradient scrim with text
  on top.
  - *Use when:* warmth/emotion slides (origin stories, lifestyle).
  - *Style:* scrim 40–75% dark at the bottom or whole-rake; text sized to the
    canvas on the scrim; never place text on busy image regions.
- **Icon** — a single line or filled icon as a symbol for a concept.
  - *Use when:* reinforcing a headline/list item; a visual anchor when no photo
    fits.
  - *Style:* consistent stroke (2px) or fill in a system shape; within a badge;
    one per concept.
- **Illustration** — custom scene or symbolism beyond icons.
  - *Use when:* explaining an abstract concept, or a mascot/character for
    personality.
  - *Style:* consistent color vocabulary from the palette; flat-ish or line-art
    matching the deck's imagery rule.

## 6. Layout-composition devices

Ways to carve the canvas itself — arguably the most powerful "decoration" of all.

- **Framing / blocks** — split the slide into distinct colored/toned regions
  (top band for headline, center field for visual) instead of one flat canvas.
  - *Use when:* you want bold structure and clear zones.
  - *Style:* palette's surfaces as bands; a deliberate margin system; identical
    across the deck where it appears.
- **Seam / continuity** — a graphic (a line, shape, or motif) that gently traces
  from one slide into the next, signaling there's more ahead.
  - *Use when:* a smooth-panorama mood or to boost advancing through the deck.
  - *Style:* the motif sits near a shared edge and continues on the next slide.
- **Overlap / stacking** — layered cards/shapes where one slightly overlaps
  another for depth.
  - *Use when:* a "layered/dimensional" premium feel; collage mood.
  - *Style:* 8–16% overlap, consistent shadow, front element fully readable.
- **Bento / card grid** — a collection of small cards (differing sizes) arranged
  on a grid — the modern "dashboard" look.
  - *Use when:* grouping several small facts, stats, or features on one slide.
  - *Style:* shared radii + hairlines; strong alignment so "mixed sizes" still
    reads structured.

## Selection rules (how you decide)

1. **Start from the medicine, not the menu.** Decide the slide's job first
   (hook, proof, stats, story). Pick elements that serve that job; skip the rest.
2. **≤3–4 decorative elements per slide**, and usually 1–2. A hook slide may
   legally hold: gradient shape + one icon + continue hint. Nothing more.
3. **Elements are optional — use them when they earn it.** A data or
   "how-it-works" slide genuinely benefits from a diagram or a stat slab. A
   minimal/editorial slide may be *stronger* with almost none. Match density to
   the user's prompt and the deck's concept; never garnish for its own sake.
   Give each slide ≥1 visual anchor so no slide is bare text.
4. **Elements must carry their weight** — adding meaning (badging a stat),
   structure (framing a zone), or texture (pattern in a corner); never filler.
5. **Consistency** — once a deck uses a motif (dots, frames, tabs), it should
   recur on ≥2 slides to read as a system, not a one-off.
6. **Variants can be element-driven** — Variant A = clean gradient + small icon;
   Variant B = bold shape stack + big stat slab — same system, different element
   mix. Document which elements differ per variant in the brief.

## Element vocabulary recap

Shapes: `gradient shape`, `geometric shape`, `dividing line`, `grid/guideline`,
`frame/border`. Patterns: `dot pattern`, `grid-line pattern`, `tessellation`,
`noise/grain`, `line-work flourish`. Typographic: `pull quote`, `kicker`,
`stat slab`, `list/checkmarks`, `footnote/source tag`, `tag chip`. Data:
`chart (mini)`, `diagram/flow`, `timeline`, `comparison/2-column`, `progress`.
Media: `photo frame`, `image with overlay`, `icon`, `illustration`. Layout:
`framing/blocks`, `seam/continuity`, `overlap/stacking`, `bento/card grid`.

Use these exact names in `/brief.md` so the builder knows precisely which element
to place and how the design system (`/design.md`) styles it.

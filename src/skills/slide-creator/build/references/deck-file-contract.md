# Deck File Contract — `/deck.json` + slide files

The deck must be files the projection and sandbox renderer can consume
deterministically. **`/deck.json` is maintained automatically by the harness
and MUST NOT be written by the agent** — it is regenerated after every
build/edit patch. The agent's job is to produce the slide files and `/theme.css`
correctly; `deck.json` is derived from them. The contract below documents the
shape the harness produces (so the agent can read it and confirm state), the
per-slide-file rules that must hold, and the `/theme.css` conventions.

## `/deck.json` (code-generated — read-only for the agent)

A JSON object the harness writes with exactly these fields:

```json
{
  "title": "<deck title>",
  "description": "<short one-line description>",
  "canvas": "16:9",
  "theme": "/theme.css",
  "slideOrder": ["01", "02", "03"]
}
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `title` | string | yes | Deck title shown in the UI. Seeded from the approved plan; otherwise `"Untitled deck"`. |
| `description` | string | optional | Short one-liner. Preserved if present. |
| `canvas` | string | yes | The **colon-form aspect preset key** only: `16:9`, `4:5`, `9:16`, or `1:1`. Set from the user's plan-phase canvas choice. |
| `theme` | string | yes | The **file path** to the shared stylesheet, pinned to `/theme.css` when that file exists (omitted otherwise). |
| `slideOrder` | string[] | yes | Slide ids in **natural (numeric-aware) sorted order** of the actual `/slides/*.html` basenames — derived, never hand-written. |

### Contract rules (how the harness derives /deck.json)

- `slideOrder` = the ids of every existing `/slides/{id}.html` file (id = the
  filename minus `.html`), sorted numerically-aware (`01 < 02 < 10`,
  `step-1 < step-2 < step-10`). A slide's deck position is its filename's sort
  position; to reorder, renumber a slide's id. The `reorder_slides` tool does
  this automatically — pass the current slide ids in the desired order and it
  renames the slide files to sequential ids (`01`, `02`, …) in place, shifting
  affected slides without rewriting their content. A bare `rename_file` op is
  also available via `apply_patch` for single-file renames. A deleted `.html`
  drops out of the deck automatically — dangling ids are impossible by
  construction.
- `theme` is pinned to `/theme.css`; a deck without that file is unstyled but
  renderable.
- `canvas`/`title` come from the user's plan choices; `description` is preserved
  if the deck already had one.

## Per-slide files

Each slide id `NN` (e.g. `01`) produces two sibling files. Use sequential
zero-padded ids (`01`, `02`, `03`, …) so deck order is predictable; a slide's
id is its filename without `.html`, and any basename the agent chooses becomes
a valid id (deck order is the natural sort of those basenames):

- **`/slides/NN.html`** — that slide's markup: root slide node, headline,
  supporting copy, visual/elements, CTA/progress per `/brief.md`. It should be
  structurally self-sufficient and reference the shared theme via the theme
  class / variables.
- **`/slides/NN.css`** — that slide's own rules (per-slide layout, unique
  element sizing). Shared/global styling belongs in `/theme.css`, not here.

The root element of every slide should carry a slide-classed markup so the
theme and the renderer can scope it (e.g. a `<section class="slide deck-theme">`
with the deck/theme classes applied).

## `/theme.css`

The single shared stylesheet implementing `/design.md`. Key conventions:

- Define the palette + type as CSS custom properties on a shared scope
  (e.g. `:root` / `.deck-theme`) so every slide reads one system.
- Include baseline canvas sizing + safe-zone margins, type scale, spacing,
  shared radius/shadow vocabulary, and classes for the shared element families
  (gradient shape, dot pattern, stat slab, card, tag chip, progress, …).
- Load the deck's fonts from Google Fonts: put the `@import url("…")` for the
  families recorded in `/design.md` at the top of `/theme.css`, before any other
  rules. Google Fonts is the only allowed external CSS resource.
- Slides import/use it through the theme path set in `deck.json` `theme`.

## Hard constraints (why this contract matters)

- **`/deck.json` named/ordered by the slide files.** The harness recomputes it
  after every build/edit patch, so the deck is always exactly the set of
  `/slides/*.html` files in natural sort order. If the deck shows the wrong
  slides, the slide files themselves are wrong — not `deck.json`.
- **Missing theme path → unstyled deck.** Create `/theme.css` so the deck has a
  shared stylesheet; `deck.json` picks it up automatically.
- **No `<script>`.** Everything is static HTML + CSS.

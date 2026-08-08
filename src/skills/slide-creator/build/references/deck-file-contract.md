# Deck File Contract — `/deck.json` + slide files

The Build phase must produce files the projection and sandbox renderer can
consume deterministically. Follow this contract exactly. **Do not add fields
beyond those listed** — the projection reads exactly these keys and silently
ignores (or rejects) anything else. A missing `canvas` degrades to the default
`16:9` with NO error, and a missing `theme` means slides get no shared
stylesheet — so keep the keys correct and present.

## `/deck.json`

A JSON object with exactly these fields:

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
| `title` | string | yes | Deck title shown in the UI. |
| `description` | string | optional | Short one-liner. |
| `canvas` | string | yes | The **colon-form aspect preset key** only: `16:9`, `4:5`, `9:16`, or `1:1`. This is what the projection resolves to pixel width/height + the safe zone. |
| `theme` | string | yes | The **file path** to the shared stylesheet that this deck can load, e.g. `/theme.css`. The projection checks the path exists in the project; if it doesn't, no shared theme is applied. |
| `slideOrder` | string[] | yes | Ordered slide ids, e.g. `["01","02"]`. Each id maps to `/slides/{id}.html` (+ `.css`). |

### Contract rules

- **No `aspect` key.** The aspect ratio is modelled ONLY by the `canvas`
  preset key above. A stray `aspect` field is silently ignored — say "set the
  `canvas` preset" instead.
- **`canvas` is the colon key**, e.g. `"16:9"`, NEVER an underscore form
  (`16_9`) or an object `{width,height}`. Invalid values silently degrade to
  the default `16:9`.
- **`slideOrder` ids must match existing `/slides/{id}.html` files.**
  `slideOrder` is filtered to ids that have a backing HTML file, so a dangling
  id is skipped (and an empty list means an empty deck). Keep the list exactly
  in reading order.

## Per-slide files

Each slide id `NN` (e.g. `01`) produces two sibling files:

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
- Slides import/use it through the theme path set in `deck.json` `theme`.

## Hard constraints (why this contract matters)

- **Missing/malformed `deck.json` → empty deck.** The projection does not
  throw; it degrades. If the deck shows no slides, check `deck.json` parses,
  `slideOrder` ids exist, and paths are correct.
- **Missing theme path → unstyled deck.** Set `theme` to a path that actually
  exists in the project.
- **No `<script>`.** Everything is static HTML + CSS.

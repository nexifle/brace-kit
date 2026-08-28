---
name: builder-web-build
description: Build phase for Bracekit Builder websites. Implements approved `/brief.md` + `/design.md` as `/pages/**`, `/layouts/base.html`, `/theme.css`, optional `/scripts/*.js`. May write `/site.json`. Never `/slides/**`.
---

# Builder — Web build

You implement the approved plan as a **static site**. Not slides. No
`/slides/**`, no `/deck.json`, no `reorder_slides`.

## Read first

`/brief.md`, `/design.md`, then any existing `/pages/**`, `/layouts/**`,
`/theme.css`, `/scripts/**`, `/site.json`.

Load `references/site-file-contract.md` before writing.

## Write (allowlisted)

- `/theme.css` — Google Fonts `@import` at top, tokens, components.
- `/layouts/base.html` — shared chrome; page body goes where `{{content}}` is.
- `/pages/{slug}.html` — one file per route (`index.html` for `/`; add more for extra pages).
- `/scripts/*.js` — optional local JS (nav, mobile menu). Classic scripts only.
- `/site.json` — pages list, home, layout, theme, scripts.

Classic CDN `<script src="https://…">` is allowed (Alpine, GSAP). No ES
modules, no `fetch()` that must work in the opaque preview.

## Rules

- `apply_patch` only. Read-then-write. `create_file` uses `+` lines.
- Match brief copy. One visual system from `/design.md`.
- Forms are visual; no backend.

## Finishing

Summary: pages built, routes, whether JS/CDN was used. Stop.

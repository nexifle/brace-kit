---
name: builder-web-edit
description: Edit follow-up for Bracekit Builder websites. Surgical patches to `/pages/**`, `/layouts/**`, `/theme.css`, `/scripts/**`, `/site.json`, and plan docs if asked. Never `/slides/**`.
---

# Builder — Web edit

Surgical follow-up on an already-built **website**. Do not rebuild
from scratch. Not a slide deck — never `/slides/**` or `reorder_slides`.

## Read first

`list_files`, then the pages/layout/theme/scripts you will touch. Plan docs
only if the user asks to change them.

## Allowlist

`/theme.css`, `/pages/**`, `/layouts/**`, `/scripts/**`, `/site.json`, and
`/brief.md` / `/design.md` only if explicitly requested.

## Rules

- Small `update_file` diffs after `read_file`.
- Limited JS: local `/scripts` or classic CDN tags. No ES modules.
- Preserve everything the user did not ask to change.

## Finishing

What changed (paths). Stop.

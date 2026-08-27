# Site file contract

## Paths

| Path | Role |
|---|---|
| `/site.json` | Manifest: kind, title, home, pages[], layout, theme, scripts[] |
| `/pages/{slug}.html` | Page body or full HTML document |
| `/layouts/base.html` | Optional shell with `{{content}}` |
| `/theme.css` | Shared CSS |
| `/scripts/*.js` | Local classic scripts |

## `/site.json` shape

```json
{
  "kind": "site",
  "title": "…",
  "home": "/pages/index.html",
  "pages": [
    { "id": "index", "path": "/", "htmlPath": "/pages/index.html" }
  ],
  "layout": "/layouts/base.html",
  "theme": "/theme.css",
  "scripts": ["/scripts/nav.js"]
}
```

The harness also heals `pages` from `/pages/*.html` after each patch.

## Preview

Pages render as a real document (`srcdoc`). Inline `<script>` and classic CDN
scripts run. ES modules and `fetch()` often fail (`Origin: null`).

import type { Conversation, Message } from '../types/index.ts';

// =============================================================================
// Conversation → self-contained HTML export
//
// Follows the pi coding-agent pattern: session data is base64-encoded into a
// <script type="application/json"> tag, and markdown + code highlighting are
// rendered client-side by embedded copies of marked + highlight.js. The visual
// theme, however, is BraceKit's own design language (indigo brand, sharp
// corners, Plus Jakarta Sans / JetBrains Mono, light+dark) — not pi's.
//
// marked.umd.js + highlight.min.js are shipped in dist/lib/ and fetched at
// export time (not bundled) so the sidebar bundle stays lean.
// =============================================================================

export interface ExportHtmlOptions {
  /** marked UMD source (injected in tests; otherwise fetched from dist/lib/) */
  markedSource?: string;
  /** highlight.js source (injected in tests; otherwise fetched from dist/lib/) */
  hljsSource?: string;
}

/** Sanitize a conversation title into a filesystem-safe base name. */
export function makeExportBasename(conversation: Conversation): string {
  const slug = conversation.title.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'conversation';
  const date = new Date(conversation.createdAt || Date.now()).toISOString().split('T')[0];
  return `${slug}_${date}`;
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchDistAsset(relativePath: string): Promise<string> {
  let url: string;
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    url = chrome.runtime.getURL(relativePath);
  } else {
    url = relativePath;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[export-html] failed to load ${relativePath} (${res.status})`);
  }
  return res.text();
}

/**
 * Build the complete self-contained HTML document for a conversation.
 * Async because the marked/highlight.js sources are fetched from dist/lib/.
 */
export async function exportConversationToHtml(
  conversation: Conversation,
  messages: Message[],
  options: ExportHtmlOptions = {}
): Promise<string> {
  const [markedSource, hljsSource] = await Promise.all([
    options.markedSource ?? fetchDistAsset('lib/marked.umd.js'),
    options.hljsSource ?? fetchDistAsset('lib/highlight.min.js'),
  ]);

  // Serialize a trimmed, self-contained snapshot of the conversation.
  const payload = {
    title: conversation.title || 'Untitled conversation',
    createdAt: conversation.createdAt,
    exportedAt: Date.now(),
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content ?? '',
      displayContent: m.displayContent,
      reasoningContent: m.reasoningContent,
      toolCalls: m.toolCalls ?? [],
      toolResults: m.toolResults ?? [],
      attachments: (m.attachments ?? []).map((a) => ({
        type: a.type,
        name: a.name,
        data: a.data ?? '',
      })),
      generatedImages: (m.generatedImages ?? []).map((g) => ({
        mimeType: g.mimeType,
        data: g.data ?? '',
      })),
      pageContext: m.pageContext
        ? { pageTitle: m.pageContext.pageTitle, pageUrl: m.pageContext.pageUrl, content: m.pageContext.content ?? '' }
        : undefined,
      selectedText: m.selectedText
        ? { text: m.selectedText.selectedText, pageTitle: m.selectedText.pageTitle, pageUrl: m.selectedText.pageUrl }
        : undefined,
      truncated: m.truncated,
      truncatedReason: m.truncatedReason,
      isCompacted: m.isCompacted,
      summary: m.summary,
    })),
  };

  // Make the JSON safe to inline in <script type="application/json">.
  const dataJson = JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  const dataBase64 = utf8ToBase64(dataJson);

  const css = CSS_TEMPLATE.trim();
  const renderJs = RENDER_JS_TEMPLATE.trim();

  return `<!DOCTYPE html>
<html lang="en" data-bk-export="bracekit">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtmlAttr(payload.title)} · BraceKit Export</title>
<style>${css}</style>
</head>
<body>
  <div class="bk-doc">
    <header class="bk-hero">
      <div class="bk-kicker">
        <span class="bk-logo" aria-hidden="true"></span>
        <span>BraceKit Conversation</span>
        <span class="bk-hero-rule" aria-hidden="true"></span>
        <span id="bk-badge-count"></span>
      </div>
      <h1 class="bk-title" id="bk-title"></h1>
      <p class="bk-subtitle" id="bk-subtitle"></p>
      <div class="bk-meta" id="bk-meta"></div>
    </header>

    <main class="bk-messages" id="bk-messages" aria-live="polite"></main>

    <footer class="bk-footer">
      <span>Exported with BraceKit · ${new Date().getFullYear()}</span>
    </footer>
  </div>

  <button id="bk-theme-toggle" class="bk-theme-toggle" type="button" aria-label="Toggle color theme" title="Toggle color theme">
    <svg class="bk-icon bk-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
    <svg class="bk-icon bk-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
  </button>

  <div id="bk-lightbox" class="bk-lightbox" role="dialog" aria-modal="true" aria-label="Image preview" hidden>
    <img id="bk-lightbox-img" alt="" />
  </div>

  <script id="bk-session-data" type="application/json">${dataBase64}</script>
  <script>${markedSource}</script>
  <script>${hljsSource}</script>
  <script>
${renderJs}
  </script>
</body>
</html>
`;
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Trigger a browser download of the generated HTML file. */
export function downloadHtml(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// =============================================================================
// Embedded CSS — BraceKit design language (indigo brand, sharp corners,
// Plus Jakarta Sans + JetBrains Mono, light + dark, fully responsive).
// =============================================================================

const CSS_TEMPLATE = `
  :root {
    /* BraceKit light tokens */
    --bk-bg: oklch(0.985 0 0);
    --bk-fg: oklch(0.145 0 0);
    --bk-card: oklch(1 0 0);
    --bk-card-2: oklch(0.97 0.011 265.8);
    --bk-primary: oklch(0.508 0.182 265.8);
    --bk-primary-soft: oklch(0.945 0.03 265.8);
    --bk-muted: oklch(0.556 0 0);
    --bk-border: oklch(0.9 0.01 265.8);
    --bk-border-strong: oklch(0.82 0.02 265.8);
    --bk-user-bg: oklch(0.962 0.02 265.8);
    --bk-tool-bg: oklch(0.14 0.015 265.8);
    --bk-tool-fg: oklch(0.93 0.01 265.8);
    --bk-reason-bg: oklch(0.975 0.02 85);
    --bk-reason-fg: oklch(0.35 0.03 75);
    --bk-success: oklch(0.55 0.14 163);
    --bk-danger: oklch(0.577 0.245 27.325);
    --bk-warning: oklch(0.655 0.145 65.7);
    --bk-shadow: 0 1px 2px oklch(0.2 0.02 265.8 / 0.04), 0 8px 24px oklch(0.2 0.02 265.8 / 0.05);
    --bk-code-bg: oklch(0.975 0.005 265.8);
    --bk-inline-code: oklch(0.35 0.09 300);
    --bk-link: oklch(0.47 0.18 265.8);
    --bk-table-border: oklch(0.9 0.01 265.8);
    --bk-table-head-bg: oklch(0.965 0.01 265.8);
    --bk-blockquote-border: oklch(0.85 0.03 265.8);
    --bk-print-adaptr: none;
  }

  [data-bk-theme="dark"] {
    --bk-bg: oklch(0.145 0.01 265.8);
    --bk-fg: oklch(0.96 0.005 265.8);
    --bk-card: oklch(0.185 0.012 265.8);
    --bk-card-2: oklch(0.225 0.015 265.8);
    --bk-primary: oklch(0.696 0.175 265.8);
    --bk-primary-soft: oklch(0.27 0.045 265.8);
    --bk-muted: oklch(0.708 0 0);
    --bk-border: oklch(0.32 0.02 265.8);
    --bk-border-strong: oklch(0.42 0.025 265.8);
    --bk-user-bg: oklch(0.23 0.03 265.8);
    --bk-tool-bg: oklch(0.115 0.012 265.8);
    --bk-tool-fg: oklch(0.9 0.01 265.8);
    --bk-reason-bg: oklch(0.24 0.025 75);
    --bk-reason-fg: oklch(0.82 0.045 85);
    --bk-success: oklch(0.72 0.15 163);
    --bk-danger: oklch(0.72 0.19 27);
    --bk-warning: oklch(0.8 0.14 65.7);
    --bk-shadow: 0 1px 2px oklch(0 0 0 / 0.3), 0 8px 24px oklch(0 0 0 / 0.35);
    --bk-code-bg: oklch(0.115 0.012 265.8);
    --bk-inline-code: oklch(0.78 0.08 310);
    --bk-link: oklch(0.75 0.15 265.8);
    --bk-table-border: oklch(0.3 0.02 265.8);
    --bk-table-head-bg: oklch(0.24 0.015 265.8);
    --bk-blockquote-border: oklch(0.45 0.06 265.8);
  }

  * { box-sizing: border-box; }

  html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }

  body {
    margin: 0;
    min-height: 100vh;
    background: var(--bk-bg);
    color: var(--bk-fg);
    font-family: 'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 16px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    transition: background 0.25s ease, color 0.25s ease;
  }

  body::before {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    background:
      radial-gradient(60rem 32rem at 50% -8rem, var(--bk-primary-soft), transparent 70%),
      radial-gradient(40rem 24rem at 85% 110%, var(--bk-primary-soft), transparent 70%);
    opacity: 0.55;
  }

  .bk-doc {
    position: relative;
    z-index: 1;
    max-width: 48rem;
    margin: 0 auto;
    padding: clamp(1.25rem, 4vw, 3.5rem) clamp(1rem, 3.5vw, 2rem) 4.5rem;
  }

  /* ============ THEME TOGGLE ============ */
  .bk-theme-toggle {
    position: fixed;
    top: 1.1rem;
    right: 1.1rem;
    z-index: 40;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border: 1px solid var(--bk-border);
    border-radius: 0.5rem;
    background: var(--bk-card);
    color: var(--bk-fg);
    cursor: pointer;
    box-shadow: var(--bk-shadow);
    transition: border-color 0.15s ease, transform 0.15s ease, background 0.2s ease;
  }
  .bk-theme-toggle:hover { border-color: var(--bk-border-strong); transform: translateY(-1px); }
  .bk-theme-toggle:focus-visible { outline: 2px solid var(--bk-primary); outline-offset: 2px; }
  .bk-icon { width: 1.1rem; height: 1.1rem; }
  .bk-icon-moon { display: none; }
  [data-bk-theme="dark"] .bk-icon-sun { display: none; }
  [data-bk-theme="dark"] .bk-icon-moon { display: block; }

  /* ============ HERO ============ */
  .bk-hero {
    padding-bottom: 2rem;
    margin-bottom: 2.25rem;
    border-bottom: 1px solid var(--bk-border);
  }

  .bk-kicker {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--bk-muted);
    margin-bottom: 1.25rem;
  }

  .bk-logo {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 0.15rem;
    background: linear-gradient(135deg, var(--bk-primary), oklch(0.62 0.2 303));
    box-shadow: 0 0 0 4px var(--bk-primary-soft);
  }

  .bk-hero-rule {
    flex: 1 1 2rem;
    height: 1px;
    background: linear-gradient(90deg, var(--bk-border), transparent);
  }

  .bk-title {
    margin: 0;
    font-size: clamp(1.7rem, 4.5vw, 2.5rem);
    font-weight: 750;
    line-height: 1.15;
    letter-spacing: -0.025em;
    color: var(--bk-fg);
  }

  .bk-subtitle {
    margin: 0.75rem 0 0;
    font-size: clamp(0.95rem, 2.5vw, 1.05rem);
    color: var(--bk-muted);
  }

  .bk-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1.25rem;
  }

  .bk-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.28rem 0.75rem;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: var(--bk-muted);
    background: var(--bk-card);
    border: 1px solid var(--bk-border);
    border-radius: 999px;
    box-shadow: 0 1px 2px oklch(0.2 0 0 / 0.03);
  }
  .bk-chip svg { width: 0.8rem; height: 0.8rem; flex-shrink: 0; }
  .bk-chip-badge { color: var(--bk-primary); font-weight: 700; }

  /* ============ MESSAGES ============ */
  .bk-messages {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .bk-msg {
    animation: bk-rise 0.45s cubic-bezier(0.16, 1, 0.3, 1) backwards;
    animation-delay: calc(var(--bk-i, 0) * 55ms);
  }
  @keyframes bk-rise {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .bk-rolebar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--bk-muted);
  }

  .bk-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: var(--bk-muted);
  }
  .bk-msg[data-role="user"] .bk-dot { background: var(--bk-primary); }
  .bk-msg[data-role="assistant"] .bk-dot { background: var(--bk-success); }
  .bk-msg[data-role="tool"] .bk-dot { background: var(--bk-warning); }
  .bk-msg[data-role="system"] .bk-dot, .bk-msg[data-role="error"] .bk-dot { background: var(--bk-danger); }

  .bk-ts {
    margin-left: auto;
    font-weight: 500;
    letter-spacing: 0.02em;
    text-transform: none;
    font-size: 0.72rem;
    color: var(--bk-muted);
    opacity: 0.8;
  }

  .bk-bubble {
    background: var(--bk-card);
    border: 1px solid var(--bk-border);
    border-radius: 0.625rem;
    padding: 1.1rem 1.25rem;
    box-shadow: var(--bk-shadow);
  }

  .bk-msg[data-role="user"] .bk-bubble {
    background: var(--bk-user-bg);
    border-color: color-mix(in oklab, var(--bk-primary) 18%, var(--bk-border));
  }

  .bk-msg[data-role="tool"] .bk-bubble,
  .bk-msg[data-role="system"] .bk-bubble,
  .bk-msg[data-role="error"] .bk-bubble {
    background: var(--bk-tool-bg);
    color: var(--bk-tool-fg);
    border-color: transparent;
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.82rem;
    padding: 1rem 1.1rem;
    overflow-x: auto;
  }

  .bk-msg[data-role="error"] .bk-bubble { border-left: 3px solid var(--bk-danger); }
  .bk-msg[data-role="system"] .bk-bubble { border-left: 3px solid var(--bk-warning); }

  .bk-label-chip {
    display: inline-block;
    margin-bottom: 0.6rem;
    padding: 0.2rem 0.55rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    border-radius: 0.25rem;
    background: var(--bk-primary-soft);
    color: var(--bk-primary);
  }

  .bk-truncated {
    margin-top: 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--bk-warning);
  }

  /* ---- reasoning ---- */
  .bk-reasoning {
    margin-bottom: 0.9rem;
    border: 1px dashed color-mix(in oklab, var(--bk-reason-fg) 35%, transparent);
    background: var(--bk-reason-bg);
    border-radius: 0.5rem;
    overflow: hidden;
  }
  .bk-reasoning-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.55rem 0.9rem;
    background: transparent;
    border: none;
    color: var(--bk-reason-fg);
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .bk-reasoning-head:hover { opacity: 0.85; }
  .bk-reasoning-head svg { width: 0.85rem; height: 0.85rem; transition: transform 0.2s ease; }
  .bk-reasoning[open] .bk-reasoning-head svg { transform: rotate(180deg); }
  .bk-reasoning-body {
    display: none;
    padding: 0.1rem 0.9rem 0.85rem;
    font-size: 0.85rem;
    line-height: 1.6;
    color: var(--bk-reason-fg);
    white-space: pre-wrap;
  }
  .bk-reasoning[open] .bk-reasoning-body { display: block; }
  .bk-reasoning-hint { font-weight: 500; text-transform: none; letter-spacing: 0; opacity: 0.75; margin-left: auto; }

  /* ---- context / selection callouts ---- */
  .bk-context {
    margin-bottom: 0.9rem;
    padding: 0.7rem 0.9rem;
    border: 1px solid var(--bk-border);
    border-left: 3px solid var(--bk-primary);
    background: var(--bk-card-2);
    border-radius: 0.375rem;
    font-size: 0.82rem;
    color: var(--bk-muted);
  }
  .bk-context-title {
    font-weight: 700;
    color: var(--bk-fg);
    margin-bottom: 0.15rem;
  }
  .bk-context a { color: var(--bk-link); }
  .bk-context-preview {
    margin-top: 0.3rem;
    font-size: 0.78rem;
    white-space: pre-wrap;
    max-height: 6rem;
    overflow: hidden;
    position: relative;
  }
  .bk-context-preview::after {
    content: '';
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    height: 1.5rem;
    background: linear-gradient(transparent, var(--bk-card-2));
  }

  /* ---- tool calls ---- */
  .bk-tool {
    margin-top: 0.9rem;
    border: 1px solid var(--bk-border);
    border-radius: 0.5rem;
    overflow: hidden;
    font-size: 0.82rem;
  }
  .bk-tool-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.8rem;
    background: var(--bk-card-2);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.78rem;
    border-bottom: 1px solid var(--bk-border);
  }
  .bk-tool-status { width: 0.5rem; height: 0.5rem; border-radius: 999px; background: var(--bk-muted); }
  .bk-tool-status[data-status="success"] { background: var(--bk-success); }
  .bk-tool-status[data-status="error"] { background: var(--bk-danger); }
  .bk-tool-args {
    padding: 0.55rem 0.8rem;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.76rem;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--bk-muted);
  }
  .bk-tool-result {
    margin: 0 0.8rem 0.8rem;
    padding: 0.6rem 0.8rem;
    background: var(--bk-tool-bg);
    color: var(--bk-tool-fg);
    border-radius: 0.375rem;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.78rem;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 16rem;
    overflow: auto;
  }
  .bk-tool-result.is-error { border-left: 3px solid var(--bk-danger); }

  /* ---- attachments / images ---- */
  .bk-media {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    gap: 0.6rem;
    margin-top: 0.9rem;
  }
  .bk-media img {
    width: 100%;
    height: auto;
    max-height: 14rem;
    object-fit: cover;
    border: 1px solid var(--bk-border);
    border-radius: 0.375rem;
    cursor: zoom-in;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .bk-media img:hover { transform: translateY(-2px); box-shadow: var(--bk-shadow); }
  .bk-attach {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0.9rem 0.4rem 0 0;
    padding: 0.3rem 0.7rem;
    font-size: 0.76rem;
    font-weight: 600;
    border: 1px solid var(--bk-border);
    border-radius: 999px;
    background: var(--bk-card);
    color: var(--bk-fg);
    text-decoration: none;
  }
  .bk-attach:hover { border-color: var(--bk-border-strong); }

  /* ============ LIGHTBOX ============ */
  .bk-lightbox {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    background: oklch(0 0 0 / 0.8);
    cursor: zoom-out;
  }
  .bk-lightbox img {
    max-width: 100%;
    max-height: 100%;
    border-radius: 0.5rem;
    box-shadow: 0 20px 60px oklch(0 0 0 / 0.5);
  }
  .bk-lightbox[hidden] { display: none; }

  /* ============ MARKDOWN ============ */
  .bk-md { font-size: 0.94rem; line-height: 1.7; overflow-wrap: break-word; }
  .bk-md > :first-child { margin-top: 0; }
  .bk-md > :last-child { margin-bottom: 0; }
  .bk-md p { margin: 0.55rem 0; }
  .bk-md h1, .bk-md h2, .bk-md h3, .bk-md h4, .bk-md h5, .bk-md h6 {
    margin: 1.4rem 0 0.6rem;
    font-weight: 750;
    line-height: 1.3;
    letter-spacing: -0.02em;
  }
  .bk-md h1 { font-size: 1.5rem; }
  .bk-md h2 { font-size: 1.28rem; }
  .bk-md h3 { font-size: 1.12rem; }
  .bk-md h4 { font-size: 1rem; }
  .bk-md ul, .bk-md ol { margin: 0.6rem 0; padding-left: 1.4rem; }
  .bk-md li { margin: 0.25rem 0; }
  .bk-md li::marker { color: var(--bk-primary); }
  .bk-md a { color: var(--bk-link); text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; }
  .bk-md a:hover { opacity: 0.8; }
  .bk-md blockquote {
    margin: 0.75rem 0;
    padding: 0.15rem 0 0.15rem 1rem;
    border-left: 3px solid var(--bk-blockquote-border);
    color: var(--bk-muted);
  }
  .bk-md hr { border: none; border-top: 1px solid var(--bk-border); margin: 1.25rem 0; }
  .bk-md code {
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.82em;
    padding: 0.15em 0.4em;
    border-radius: 0.25rem;
    background: var(--bk-code-bg);
    color: var(--bk-inline-code);
  }
  .bk-md pre {
    margin: 0.8rem 0;
    padding: 0.9rem 1rem;
    background: var(--bk-tool-bg);
    border-radius: 0.5rem;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .bk-md pre code {
    display: block;
    padding: 0;
    background: transparent;
    color: var(--bk-tool-fg);
    font-size: 0.82rem;
    line-height: 1.6;
  }
  .bk-table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    max-width: 100%;
    margin: 0.8rem 0;
    border-radius: 0.375rem;
  }
  .bk-md table {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
  }
  .bk-md th, .bk-md td {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--bk-table-border);
    text-align: left;
    vertical-align: top;
  }
  .bk-md th { background: var(--bk-table-head-bg); font-weight: 700; }
  .bk-table-wrap table { border-radius: 0.375rem; overflow: hidden; }
  .bk-md img { max-width: 100%; border-radius: 0.375rem; }
  .bk-md .bk-img-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 0.6rem; margin: 0.8rem 0; }
  .bk-md .bk-img-row img { width: 100%; cursor: zoom-in; }

  /* ---- syntax highlighting (BraceKit-tuned hljs theme) ---- */
  .hljs { color: var(--bk-tool-fg); background: transparent; }
  .hljs-comment, .hljs-quote { color: oklch(0.62 0.02 265.8); font-style: italic; }
  .hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-section, .hljs-link, .hljs-doctag, .hljs-type, .hljs-name { color: oklch(0.77 0.15 265.8); }
  .hljs-string, .hljs-title, .hljs-addition { color: oklch(0.75 0.16 155); }
  .hljs-attr, .hljs-symbol, .hljs-bullet, .hljs-variable, .hljs-template-variable, .hljs-number, .hljs-meta, .hljs-regexp, .hljs-selector-id, .hljs-selector-class { color: oklch(0.78 0.14 65.7); }
  .hljs-built_in, .hljs-builtin-name, .hljs-attribute { color: oklch(0.79 0.12 300); }
  .hljs-title.function_, .hljs-function .hljs-title.function_ { color: oklch(0.85 0.1 265.8); }
  .hljs-emphasis { font-style: italic; }
  .hljs-strong { font-weight: 700; }
  .hljs-deletion { color: var(--bk-danger); }

  [data-bk-theme="dark"] .hljs-comment, [data-bk-theme="dark"] .hljs-quote { color: oklch(0.62 0.02 265.8); }
  [data-bk-theme="dark"] .hljs-keyword, [data-bk-theme="dark"] .hljs-selector-tag, [data-bk-theme="dark"] .hljs-literal, [data-bk-theme="dark"] .hljs-section, [data-bk-theme="dark"] .hljs-link, [data-bk-theme="dark"] .hljs-doctag, [data-bk-theme="dark"] .hljs-type, [data-bk-theme="dark"] .hljs-name { color: oklch(0.76 0.14 265.8); }
  [data-bk-theme="dark"] .hljs-string, [data-bk-theme="dark"] .hljs-title, [data-bk-theme="dark"] .hljs-addition { color: oklch(0.74 0.14 155); }
  [data-bk-theme="dark"] .hljs-attr, [data-bk-theme="dark"] .hljs-symbol, [data-bk-theme="dark"] .hljs-bullet, [data-bk-theme="dark"] .hljs-variable, [data-bk-theme="dark"] .hljs-template-variable, [data-bk-theme="dark"] .hljs-number, [data-bk-theme="dark"] .hljs-meta, [data-bk-theme="dark"] .hljs-regexp, [data-bk-theme="dark"] .hljs-selector-id, [data-bk-theme="dark"] .hljs-selector-class { color: oklch(0.79 0.13 65.7); }
  [data-bk-theme="dark"] .hljs-built_in, [data-bk-theme="dark"] .hljs-builtin-name, [data-bk-theme="dark"] .hljs-attribute { color: oklch(0.79 0.1 300); }

  /* ============ FOOTER ============ */
  .bk-footer {
    margin-top: 3.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--bk-border);
    text-align: center;
    font-size: 0.78rem;
    color: var(--bk-muted);
  }

  /* ============ RESPONSIVE ============ */
  @media (max-width: 640px) {
    .bk-doc { padding: 1.1rem 0.9rem 3.5rem; }
    .bk-title { font-size: 1.5rem; }
    .bk-bubble { padding: 0.95rem 1rem; border-radius: 0.5rem; }
    .bk-theme-toggle { top: 0.8rem; right: 0.8rem; width: 2.25rem; height: 2.25rem; }
    .bk-msg { gap: 1.1rem; }
    .bk-media { grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr)); }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
    html { scroll-behavior: auto; }
  }

  /* ============ PRINT ============ */
  @media print {
    body { background: #ffffff !important; }
    body::before { display: none; }
    .bk-theme-toggle { display: none !important; }
    .bk-doc { max-width: none; padding: 0; }
    .bk-bubble, .bk-reasoning { box-shadow: none; break-inside: avoid; }
    .bk-reasoning[open] { page-break-inside: avoid; }
    .bk-msg { break-inside: avoid; }
    .bk-lightbox { display: none !important; }
  }
`;

// =============================================================================
// Embedded rendering JS — runs inside the exported document.
// NOTE: no template literals / backticks / ${...} here (it is injected into a
// TS template literal as a sibling script), so quotes + concatenation only.
// =============================================================================

const RENDER_JS_TEMPLATE = `
(function () {
  'use strict';

  // ---------- data ----------
  var raw = document.getElementById('bk-session-data').textContent.trim();
  var binary = atob(raw);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  var data = JSON.parse(new TextDecoder('utf-8').decode(bytes));

  // ---------- theme ----------
  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem('bk-export-theme'); } catch (e) {}
  function applyTheme(t) {
    root.setAttribute('data-bk-theme', t);
    try { localStorage.setItem('bk-export-theme', t); } catch (e) {}
  }
  applyTheme(stored || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  document.getElementById('bk-theme-toggle').addEventListener('click', function () {
    applyTheme(root.getAttribute('data-bk-theme') === 'dark' ? 'light' : 'dark');
  });

  // ---------- helpers ----------
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escAttr(s) { return esc(s).replace(/\\n/g, '&#10;'); }

  function fmtDate(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function safeUrl(value) {
    var href = String(value || '').trim().replace(/[\\x00-\\x1f\\x7f]/g, '');
    if (!href) return '';
    var m = href.match(/^([A-Za-z][A-Za-z0-9+.-]*):/);
    if (m && !/^(https?|mailto|tel|ftp)$/i.test(m[1])) return '';
    return href;
  }

  // ---------- marked ----------
  marked.use({
    breaks: true,
    gfm: true,
    tokenizer: {
      html: function () { return undefined; },
      tag: function () { return undefined; }
    },
    renderer: {
      link: function (token) {
        var href = safeUrl(token.href);
        if (!href) return this.parser.parseInline(token.tokens);
        var out = '<a href="' + escAttr(href) + '"';
        if (token.title) out += ' title="' + escAttr(token.title) + '"';
        out += '>' + this.parser.parseInline(token.tokens) + '</a>';
        return out;
      },
      image: function (token) {
        var src = String(token.href || '').trim().replace(/[\\x00-\\x1f\\x7f]/g, '');
        if (!/^https?:/i.test(src) && !/^data:image\//i.test(src)) src = '';
        var out = '<img src="' + escAttr(src) + '" alt="' + escAttr(token.text || '') + '"';
        if (token.title) out += ' title="' + escAttr(token.title) + '"';
        out += '>';
        return out;
      },
      code: function (token) {
        var code = token.text;
        var lang = (token.lang || '').toLowerCase();
        var escaped = esc(code);
        var cls = 'language-' + escAttr(lang);
        var highlighted = '';
        if (window.hljs) {
          try {
            if (lang && hljs.getLanguage(lang)) {
              highlighted = hljs.highlight(code, { language: lang }).value;
            } else if (!lang) {
              highlighted = hljs.highlightAuto(code).value;
            } else {
              highlighted = escaped;
            }
          } catch (e) { highlighted = escaped; }
        }
        return '<pre><code class="hljs ' + cls + '">' + (highlighted || escaped) + '</code></pre>';
      },
      codespan: function (token) { return '<code>' + esc(token.text) + '</code>'; }
    }
  });

  function renderMd(text) {
    if (!text) return '';
    var html = marked.parse(text);
    // Wrap tables in a scroll container so wide tables stay responsive
    // (table elements ignore overflow-x, so a wrapper div is required).
    html = html.replace(/<table>([\\s\\S]*?)<\\/table>/g, '<div class="bk-table-wrap"><table>$1</table></div>');
    return html;
  }

  // ---------- message rendering ----------
  function roleLabel(role) {
    switch (role) {
      case 'user': return 'You';
      case 'assistant': return 'Assistant';
      case 'tool': return 'Tool';
      case 'system': return 'System';
      case 'error': return 'Error';
      default: return role;
    }
  }

  function imagesOf(m) {
    var out = [];
    (m.generatedImages || []).forEach(function (g) {
      if (g.data && g.data !== '[IMAGE_DATA_NOT_SAVED]') {
        out.push({ src: 'data:' + (g.mimeType || 'image/png') + ';base64,' + g.data });
      }
    });
    (m.attachments || []).forEach(function (a) {
      if ((a.type === 'image' || /^image\\//.test(a.type || '')) && a.data && a.data !== '[IMAGE_DATA_NOT_SAVED]') {
        var src = a.data.indexOf('data:') === 0 ? a.data : 'data:image/png;base64,' + a.data;
        out.push({ src: src });
      }
    });
    return out;
  }

  function mediaHtml(m) {
    var imgs = imagesOf(m);
    var html = '';
    if (imgs.length) {
      html += '<div class="bk-media">';
      imgs.forEach(function (img) {
        html += '<img src="' + escAttr(img.src) + '" alt="attachment" loading="lazy" />';
      });
      html += '</div>';
    }
    (m.attachments || []).forEach(function (a) {
      if (a.type !== 'image' && !/^image\\//.test(a.type || '') && a.name && a.data) {
        var src = a.data.indexOf('data:') === 0 ? a.data : 'data:application/octet-stream;base64,' + a.data;
        html += '<a class="bk-attach" href="' + escAttr(src) + '" download="' + escAttr(a.name) + '">\u{1F4CE} ' + esc(a.name) + '</a>';
      }
    });
    return html;
  }

  function toolHtml(m) {
    var calls = m.toolCalls || [];
    var results = m.toolResults || [];
    var out = '';
    calls.forEach(function (tc, idx) {
      var res = null;
      results.forEach(function (r) {
        if (!res && (r.toolCallId === tc.id || idx === 0)) res = r;
      });
      var status = res ? (res.status === 'error' ? 'error' : 'success') : 'pending';
      out += '<div class="bk-tool"><div class="bk-tool-head">' +
        '<span class="bk-tool-status" data-status="' + escAttr(status) + '"></span>' +
        '<strong>' + esc(tc.name || 'tool') + '</strong>' +
        '</div>';
      if (tc.arguments) {
        out += '<div class="bk-tool-args">' + esc(tc.arguments) + '</div>';
      }
      if (res && res.content) {
        out += '<div class="bk-tool-result' + (res.status === 'error' ? ' is-error' : '') + '">' + esc(res.content) + '</div>';
      }
      out += '</div>';
    });
    return out;
  }

  function reasoningHtml(m) {
    if (!m.reasoningContent) return '';
    return '<details class="bk-reasoning">' +
      '<summary class="bk-reasoning-head">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 19l-2-2 2-2M19 19l2-2-2-2"/></svg>' +
      '<span>Thinking</span>' +
      '<span class="bk-reasoning-hint">' + esc(m.reasoningContent.length) + ' chars</span>' +
      '</summary>' +
      '<div class="bk-reasoning-body">' + esc(m.reasoningContent) + '</div>' +
      '</details>';
  }

  function renderMessage(m, idx) {
    if (m.role === 'tool') {
      return '<div class="bk-msg" data-role="tool" style="--bk-i:' + Math.min(idx, 30) + '">' +
        '<div class="bk-rolebar"><span class="bk-dot"></span><span>Tool · ' + esc(m.name || '') + '</span></div>' +
        '<div class="bk-bubble"><pre>' + esc(m.content) + '</pre></div>' +
        '</div>';
    }

    var label = roleLabel(m.role);
    var bodyHtml = '';

    // user: context / selection callouts
    if (m.role === 'user') {
      if (m.pageContext) {
        bodyHtml += '<div class="bk-context"><div class="bk-context-title">Page context · ' + esc(m.pageContext.pageTitle || '') + '</div>' +
          (m.pageContext.pageUrl ? '<a href="' + escAttr(safeUrl(m.pageContext.pageUrl)) + '" target="_blank" rel="noopener">' + esc(m.pageContext.pageUrl) + '</a>' : '') +
          (m.pageContext.content ? '<div class="bk-context-preview">' + esc(m.pageContext.content) + '</div>' : '') +
          '</div>';
      }
      if (m.selectedText) {
        bodyHtml += '<div class="bk-context"><div class="bk-context-title">Selected text' +
          (m.selectedText.pageTitle ? ' · ' + esc(m.selectedText.pageTitle) : '') + '</div>' +
          (m.selectedText.pageUrl ? '<a href="' + escAttr(safeUrl(m.selectedText.pageUrl)) + '" target="_blank" rel="noopener">' + esc(m.selectedText.pageUrl) + '</a>' : '') +
          '<div class="bk-context-preview">' + esc(m.selectedText.text || m.selectedText.selectedText || '') + '</div>' +
          '</div>';
      }
    }

    if (m.role === 'assistant') bodyHtml += reasoningHtml(m);

    var text = m.role === 'user' ? (m.displayContent || m.content) : m.content;
    if (text && text.trim()) {
      bodyHtml += '<div class="bk-md">' + renderMd(text) + '</div>';
    }

    if (m.role === 'assistant') bodyHtml += toolHtml(m);
    bodyHtml += mediaHtml(m);

    if (m.isCompacted) {
      bodyHtml += '<div class="bk-context"><div class="bk-context-title">\u{1F9E0} Compacted</div>' +
        (m.summary ? '<div class="bk-context-preview">' + esc(m.summary) + '</div>' : '') +
        '</div>';
    }

    if (m.truncated) {
      bodyHtml += '<div class="bk-truncated">\u26A0 Response interrupted (' + esc(m.truncatedReason || 'unknown') + ')</div>';
    }

    return '<article class="bk-msg" data-role="' + escAttr(m.role) + '" style="--bk-i:' + Math.min(idx, 30) + '">' +
      '<div class="bk-rolebar"><span class="bk-dot"></span><span>' + esc(label) + '</span></div>' +
      '<div class="bk-bubble">' + bodyHtml + '</div>' +
      '</article>';
  }

  // ---------- header ----------
  var userCount = 0, asstCount = 0, toolCount = 0, imageCount = 0, charCount = 0;
  data.messages.forEach(function (m) {
    if (m.role === 'user') userCount++;
    if (m.role === 'assistant') asstCount++;
    if (m.role === 'tool') toolCount++;
    charCount += (m.content || '').length;
    imageCount += (m.generatedImages || []).length;
  });

  document.getElementById('bk-title').textContent = data.title;
  document.getElementById('bk-subtitle').textContent = 'Exported ' + fmtDate(data.exportedAt);
  document.getElementById('bk-badge-count').textContent = (userCount + asstCount) + ' messages';

  var meta = document.getElementById('bk-meta');
  function chip(label, val) {
    if (!val) return;
    var c = document.createElement('span');
    c.className = 'bk-chip';
    c.innerHTML = '<span class="bk-chip-badge">' + esc(val) + '</span> ' + esc(label);
    meta.appendChild(c);
  }
  chip('user messages', userCount);
  chip('assistant messages', asstCount);
  if (toolCount) chip('tool calls', toolCount);
  if (imageCount) chip('images', imageCount);
  if (charCount) chip('characters', charCount);
  if (data.createdAt) {
    var c = document.createElement('span');
    c.className = 'bk-chip';
    c.textContent = 'Started ' + fmtDate(data.createdAt);
    meta.appendChild(c);
  }

  // ---------- messages ----------
  var container = document.getElementById('bk-messages');
  var frag = document.createDocumentFragment();
  data.messages.forEach(function (m, idx) {
    var el = document.createElement('div');
    el.innerHTML = renderMessage(m, idx);
    var article = el.firstElementChild;
    if (article) frag.appendChild(article);
  });
  container.appendChild(frag);

  // ---------- lightbox ----------
  var lightbox = document.getElementById('bk-lightbox');
  var lightboxImg = document.getElementById('bk-lightbox-img');
  function openLightbox(src) {
    lightboxImg.src = src;
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImg.src = '';
    document.body.style.overflow = '';
  }
  container.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && (t.closest('.bk-media') || t.closest('.bk-md'))) {
      e.preventDefault();
      openLightbox(t.src);
    }
  });
  lightbox.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
  });
})();
`;

// Export the source templates for tests
export const __exportHtmlTemplates = { css: CSS_TEMPLATE, js: RENDER_JS_TEMPLATE };

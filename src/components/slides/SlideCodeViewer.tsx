import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Braces, Check, Code2, Copy, FileCode2, X } from 'lucide-react';
import { useSlideStore } from '../../store/slideStore.ts';
import { getSlideFile } from '../../utils/slideVfs.ts';
import type { Slide, SlideFile } from '../../types/index.ts';

type CodeTab = 'html' | 'css';

/** Escape raw source when hljs is missing or throws (same entities markdown uses). */
export function escapeCodeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Highlight source with the same `window.hljs` path chat markdown uses
 * (`src/utils/markdown.ts` code-fence path). Falls back to escaped plain text.
 */
export function highlightSlideSource(code: string, language: string): string {
  if (!code) return '';
  const hljs = typeof window !== 'undefined' ? window.hljs : undefined;
  if (!hljs) return escapeCodeHtml(code);
  try {
    if (hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value;
    }
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeCodeHtml(code);
  }
}

/**
 * Split hljs HTML on newlines while re-opening any spans that crossed the break
 * so each row is self-contained (needed for per-line gutters).
 */
export function splitHighlightedHtmlLines(highlighted: string): string[] {
  if (!highlighted) return [''];

  type OpenTag = { open: string; name: string };
  const lines: string[] = [];
  let buf = '';
  const stack: OpenTag[] = [];
  let i = 0;

  const closeOpen = () => stack.map((t) => `</${t.name}>`).reverse().join('');
  const reopen = () => stack.map((t) => t.open).join('');

  while (i < highlighted.length) {
    const ch = highlighted[i];
    if (ch === '<') {
      const end = highlighted.indexOf('>', i);
      if (end === -1) {
        buf += highlighted.slice(i);
        break;
      }
      const tag = highlighted.slice(i, end + 1);
      if (tag.startsWith('</')) {
        const name = tag.slice(2, -1).trim().split(/\s+/)[0] ?? '';
        buf += tag;
        for (let s = stack.length - 1; s >= 0; s--) {
          if (stack[s].name === name) {
            stack.splice(s, 1);
            break;
          }
        }
      } else if (tag.endsWith('/>') || tag.startsWith('<!')) {
        buf += tag;
      } else {
        const m = /^<([a-zA-Z][\w:-]*)\b([^>]*)>/.exec(tag);
        if (m) {
          stack.push({ name: m[1], open: tag });
        }
        buf += tag;
      }
      i = end + 1;
      continue;
    }
    if (ch === '\n') {
      lines.push(buf + closeOpen());
      buf = reopen();
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  lines.push(buf + closeOpen());
  return lines;
}

/** Highlight + line-split for the slide code pane (testable without React). */
export function slideCodeHighlightedLines(code: string, language: CodeTab): string[] {
  if (!code) return [];
  // Keep a trailing empty line when the source ends with \n so gutter == file.
  const highlighted = highlightSlideSource(code, language);
  return splitHighlightedHtmlLines(highlighted);
}

export interface SlideCodeContent {
  html: string;
  css: string;
  hasCss: boolean;
  htmlPath?: string;
}

/** Pure VFS lookup for a slide's HTML + CSS sources (testable without a DOM). */
export function slideCodeFromVfs(
  files: SlideFile[],
  slide: Slide | undefined
): SlideCodeContent {
  if (!slide) return { html: '', css: '', hasCss: false };
  const htmlFile = getSlideFile(files, slide.htmlPath);
  const cssFile = slide.cssPath ? getSlideFile(files, slide.cssPath) : undefined;
  return {
    html: htmlFile?.content ?? '',
    css: cssFile?.content ?? '',
    hasCss: cssFile !== undefined,
    htmlPath: slide.htmlPath,
  };
}

/**
 * Read-only viewer for the current slide's HTML + CSS straight from the VFS
 * (PRD US-031). A compact icon trigger in the preview header opens a modal with
 * tabbed, monospace code panes for the active slide — no editing, v1 is read-only.
 * Sources the slide's files via `getSlideFile` on `activeProject.files`, so it
 * always reflects exactly what the agent wrote (not the composed/transformed HTML
 * the sandbox stage renders).
 */
export function SlideCodeViewer() {
  const activeProject = useSlideStore((s) => s.activeProject);
  const deckSlides = useSlideStore((s) => s.deckSlides);
  const currentSlideIndex = useSlideStore((s) => s.currentSlideIndex);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<CodeTab>('html');
  const [copied, setCopied] = useState(false);

  const files = activeProject?.files ?? [];
  const slide = deckSlides[currentSlideIndex];

  const { html, css, hasCss } = slideCodeFromVfs(files, slide);

  // Reset to the HTML tab whenever the viewer opens against a (possibly new) slide.
  useEffect(() => {
    if (open) setTab('html');
  }, [open, currentSlideIndex]);

  const activeCode = useMemo(
    () => (tab === 'html' ? html : css),
    [tab, html, css]
  );

  const totalLines = useMemo(
    () => (activeCode ? activeCode.replace(/\s+$/, '').split('\n').length : 0),
    [activeCode]
  );

  function copyActive() {
    if (!activeCode) return;
    void navigator.clipboard?.writeText(activeCode).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  }

  function onOpen() {
    setCopied(false);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        disabled={!slide}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
        title="View slide code (HTML/CSS)"
        aria-label="View slide code"
      >
        <Code2 size={15} />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-100 flex items-center justify-center p-4 pointer-events-auto"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
          >
            <div
              className="absolute inset-0 bg-background/60 backdrop-blur-md animate-in fade-in duration-300"
              onClick={() => setOpen(false)}
            />
            <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Braces size={16} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground tracking-tight">
                      {slide ? `Slide ${currentSlideIndex + 1} code` : 'Slide code'}
                    </h3>
                    <p className="truncate text-2xs text-muted-foreground">
                      {slide?.htmlPath ?? 'No slide selected'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Close"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 border-b border-border px-3 pt-2">
                <TabButton
                  active={tab === 'html'}
                  onClick={() => setTab('html')}
                  icon={<FileCode2 size={13} />}
                  label="HTML"
                  count={htmlLineCount(html)}
                />
                <TabButton
                  active={tab === 'css'}
                  onClick={() => setTab('css')}
                  icon={<Braces size={13} />}
                  label="CSS"
                  count={cssLineCount(css)}
                  disabled={!hasCss}
                />
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={copyActive}
                  disabled={!activeCode}
                  className="mb-1 flex h-6 items-center gap-1 rounded-md px-2 text-2xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  title="Copy to clipboard"
                >
                  {copied ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              {/* Code body */}
              <div className="min-h-0 flex-1 overflow-auto bg-[#0d0f14]">
                {!slide ? (
                  <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 p-8 text-center">
                    <Code2 size={22} className="text-zinc-500" />
                    <p className="text-xs text-zinc-400">Select a slide to view its source.</p>
                  </div>
                ) : tab === 'html' ? (
                  <CodePane code={html} language="html" empty={<span>No HTML on disk for {slide.htmlPath}.</span>} />
                ) : hasCss ? (
                  <CodePane code={css} language="css" empty={null} />
                ) : (
                  <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 p-8 text-center">
                    <Braces size={22} className="text-zinc-500" />
                    <p className="max-w-sm text-xs leading-relaxed text-zinc-400">
                      This slide has no separate CSS file — its styling is inlined into the HTML or
                      shared via the deck theme.
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-border px-4 py-2 text-2xs text-muted-foreground/70">
                <span className="flex items-center gap-1.5">
                  <Code2 size={12} />
                  {totalLines} lines
                </span>
                <span>Read-only · from project files</span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count: number;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mb-0 flex h-8 items-center gap-1.5 rounded-t-lg border-b-2 px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {icon}
      {label}
      <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground/80">
        {count}
      </span>
    </button>
  );
}

function CodePane({
  code,
  language,
  empty,
}: {
  code: string;
  language: CodeTab;
  empty: ReactNode | null;
}) {
  // Same window.hljs pipeline as chat markdown fences; per-line rows keep the
  // gutter locked even when tokens span newlines.
  const lines = useMemo(() => slideCodeHighlightedLines(code, language), [code, language]);
  if (!lines.length) {
    return (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 p-8 text-center">
        <FileCode2 size={22} className="text-zinc-500" />
        <p className="max-w-sm text-xs leading-relaxed text-zinc-400">{empty}</p>
      </div>
    );
  }
  return (
    <div className="flex min-h-full w-full text-left font-mono text-[12px] leading-5">
      <div
        aria-hidden
        className="sticky left-0 shrink-0 select-none border-r border-white/10 bg-[#0d0f14] px-3 py-3 text-right text-zinc-500"
      >
        {lines.map((_, i) => (
          <div key={i} className="h-5">
            {i + 1}
          </div>
        ))}
      </div>
      {/*
        Neutralize highlight-github-dark `code.hljs` padding/background so the
        gutter row height stays 20px (theme defaults add padding and a solid bg).
      */}
      <pre className="m-0 flex-1 overflow-visible px-4 py-3 whitespace-pre">
        <code className={`hljs language-${language} block bg-transparent p-0 text-zinc-200`}>
          {lines.map((lineHtml, i) => (
            <div
              key={i}
              className="h-5"
              // hljs output is trusted (our string → hljs → spans only).
              dangerouslySetInnerHTML={{ __html: lineHtml.length > 0 ? lineHtml : '&nbsp;' }}
            />
          ))}
        </code>
      </pre>
    </div>
  );
}

function htmlLineCount(html: string): number {
  return html ? html.split('\n').length : 0;
}

function cssLineCount(css: string): number {
  return css ? css.split('\n').length : 0;
}

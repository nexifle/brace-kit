import { marked } from 'marked';

declare global {
  interface Window {
    hljs?: {
      highlight: (code: string, options: { language: string }) => { value: string };
      getLanguage: (lang: string) => unknown;
      highlightAuto: (code: string) => { value: string };
    };
  }
}

// Configure marked with hljs integration
marked.setOptions({
  breaks: true,
  gfm: true,
});

// GitHub-style callout types configuration
type CalloutType = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';

interface CalloutConfig {
  icon: string;
  borderColor: string;
  iconBg: string;
  titleColor: string;
}

const calloutConfigs: Record<CalloutType, CalloutConfig> = {
  NOTE: {
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>`,
    borderColor: 'border-l-blue-500',
    iconBg: 'text-blue-400',
    titleColor: 'text-blue-400',
  },
  TIP: {
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
    borderColor: 'border-l-green-500',
    iconBg: 'text-green-400',
    titleColor: 'text-green-400',
  },
  IMPORTANT: {
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
    borderColor: 'border-l-purple-500',
    iconBg: 'text-purple-400',
    titleColor: 'text-purple-400',
  },
  WARNING: {
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`,
    borderColor: 'border-l-amber-500',
    iconBg: 'text-amber-400',
    titleColor: 'text-amber-400',
  },
  CAUTION: {
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>`,
    borderColor: 'border-l-red-500',
    iconBg: 'text-red-400',
    titleColor: 'text-red-400',
  },
};

// Custom renderer: buka semua link external di tab baru
const renderer = new marked.Renderer();
renderer.link = ({ href, title, text }: { href: string; title?: string | null; text: string }) => {
  const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
  const titleAttr = title ? ` title="${title}"` : '';
  if (isExternal) {
    return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  }
  return `<a href="${href}"${titleAttr}>${text}</a>`;
};

marked.use({ renderer });

// Store for blockquote placeholders (regular + callouts)
const blockquotePlaceholders = new Map<string, { type: 'blockquote' | CalloutType; content: string; config?: CalloutConfig }>();

// Pre-process markdown to convert GitHub-style callouts AND regular blockquotes to custom HTML
// This must be done BEFORE marked parses the markdown
function processBlockquotes(markdown: string): string {
  // First, process GitHub-style callouts
  const calloutPattern = /^> *\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n((?:>.*\n?)+)/gim;

  markdown = markdown.replace(calloutPattern, (_match, type: string, content: string) => {
    const calloutType = type.toUpperCase() as CalloutType;
    const config = calloutConfigs[calloutType];

    // Remove the leading '> ' from each line of content
    const cleanContent = content
      .split('\n')
      .map((line: string) => line.replace(/^> ?/, ''))
      .join('\n')
      .trim();

    // Create a unique placeholder
    const placeholder = `[[BLOCKQUOTE-${calloutType}-${Date.now()}-${Math.random().toString(36).slice(2)}-END]]`;

    blockquotePlaceholders.set(placeholder, {
      type: calloutType,
      content: cleanContent,
      config,
    });

    return placeholder + '\n';
  });

  // Then, process regular blockquotes (that are NOT callouts)
  // Match blockquote lines, including multi-line and nested content
  const blockquotePattern = /^((?:>.*\n?)+)/gm;

  markdown = markdown.replace(blockquotePattern, (match) => {
    // Skip if this was already processed as a callout (placeholder)
    if (match.includes('[[BLOCKQUOTE-')) return match;

    // Remove the leading '> ' from each line
    const cleanContent = match
      .split('\n')
      .map((line: string) => line.replace(/^> ?/, ''))
      .filter((line: string) => line.trim())
      .join('\n')
      .trim();

    if (!cleanContent) return match;

    // Create a unique placeholder
    const placeholder = `[[BLOCKQUOTE-REGULAR-${Date.now()}-${Math.random().toString(36).slice(2)}-END]]`;

    blockquotePlaceholders.set(placeholder, {
      type: 'blockquote',
      content: cleanContent,
    });

    return placeholder + '\n';
  });

  return markdown;
}

// Replace placeholders with actual blockquote HTML after markdown parsing
function replaceBlockquotePlaceholders(html: string): string {
  blockquotePlaceholders.forEach((data, placeholder) => {
    // Parse the markdown content inside the blockquote
    const parsedContent = marked.parse(data.content, { async: false }) as string;

    let blockquoteHtml: string;

    if (data.type === 'blockquote') {
      // Regular blockquote
      blockquoteHtml = `<blockquote class="border-l-4 border-l-accent bg-white/5 rounded-r-md my-3 p-3 pl-4 text-text-muted">${parsedContent}</blockquote>`;
    } else {
      // Callout blockquote
      const config = data.config!;
      blockquoteHtml = `
      <div class="border-l-4 ${config.borderColor} bg-white/5 rounded-r-md my-3 p-3 pl-4">
        <div class="flex items-center gap-2 mb-1">
          <div class="flex-shrink-0 ${config.iconBg}">
            ${config.icon}
          </div>
          <div class="font-semibold uppercase tracking-wide ${config.titleColor}">${data.type.charAt(0) + data.type.slice(1).toLowerCase()}</div>
        </div>
        <div class="text-text-default leading-relaxed prose-p:my-2">${parsedContent}</div>
      </div>
    `;
    }

    // Escape special regex characters in placeholder
    const escapedPlaceholder = placeholder.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

    // Replace both with and without surrounding <p> tags
    html = html.replace(new RegExp(`<p>${escapedPlaceholder}</p>`, 'g'), blockquoteHtml);
    html = html.replace(new RegExp(escapedPlaceholder, 'g'), blockquoteHtml);
  });

  // Clear the placeholders after use
  blockquotePlaceholders.clear();

  return html;
}

function decodeHtmlEntities(code: string): string {
  return code
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function encodeForAttribute(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderMarkdown(text: string): string {
  if (!text) return '';

  // Convert citation markers [1][2] to clickable superscript links
  let processedText = text.replace(/\[(\d+)\]/g, '<sup><a href="#cite-$1" class="citation-link">[$1]</a></sup>');

  // Pre-process blockquotes (callouts + regular) BEFORE markdown parsing
  processedText = processBlockquotes(processedText);

  // Parse markdown
  let html = marked.parse(processedText, { async: false }) as string;

  // Replace blockquote placeholders with actual HTML
  html = replaceBlockquotePlaceholders(html);

  // Add code block copy buttons, language labels, and syntax highlighting
  html = html.replace(
    /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
    (_match, lang, code) => {
      // Decode HTML entities back to raw text for copy button and hljs
      const rawCode = decodeHtmlEntities(code);
      const escapedCode = encodeForAttribute(rawCode);

      // Highlight with hljs if available
      let highlightedCode = code;
      if (window.hljs) {
        try {
          if (window.hljs.getLanguage(lang)) {
            highlightedCode = window.hljs.highlight(rawCode, { language: lang }).value;
          } else {
            highlightedCode = window.hljs.highlightAuto(rawCode).value;
          }
        } catch {
          highlightedCode = code;
        }
      }

      return `
        <div class="md-codeblock-wrapper">
          <span class="code-lang">${lang}</span>
          <button class="copy-code-btn" data-code="${escapedCode}" title="Copy code">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <pre class="md-codeblock"><code class="hljs language-${lang}">${highlightedCode}</code></pre>
        </div>
      `;
    }
  );

  // Handle code blocks without language
  html = html.replace(
    /<pre><code>([\s\S]*?)<\/code><\/pre>/g,
    (_match, code) => {
      const rawCode = decodeHtmlEntities(code);
      const escapedCode = encodeForAttribute(rawCode);

      // Auto-detect language with hljs
      let highlightedCode = code;
      if (window.hljs) {
        try {
          highlightedCode = window.hljs.highlightAuto(rawCode).value;
        } catch {
          highlightedCode = code;
        }
      }

      return `
        <div class="md-codeblock-wrapper">
          <button class="copy-code-btn" data-code="${escapedCode}" title="Copy code">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <pre class="md-codeblock"><code class="hljs">${highlightedCode}</code></pre>
        </div>
      `;
    }
  );

  // Wrap markdown images with overlay buttons
  html = html.replace(
    /<img([^>]*?)src="([^"]*?)"([^>]*?)>/g,
    (_match, before, src, after) => {
      const encodedSrc = src.replace(/"/g, '&quot;');
      return `
        <span class="md-image-wrapper">
          <img${before}src="${src}"${after}>
          <span class="md-image-actions">
            <button class="md-image-btn md-image-copy-btn" data-src="${encodedSrc}" title="Copy image">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
            <button class="md-image-btn md-image-download-btn" data-src="${encodedSrc}" title="Download image">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
          </span>
        </span>
      `;
    }
  );

  // Style inline code
  html = html.replace(
    /<code>([^<]+)<\/code>/g,
    '<code class="md-inline-code">$1</code>'
  );

  // Wrap tables with toolbar for horizontal scrolling and actions
  html = html.replace(
    /<table>([\s\S]*?)<\/table>/g,
    (match) => {
      // Encode table HTML for data attributes
      const encodedTable = encodeURIComponent(match);
      return `
        <div class="table-wrapper">
          <div class="table-container">
            ${match}
          </div>
          <div class="table-toolbar">
            <button class="table-btn table-fullscreen-btn" title="Fullscreen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            </button>
            <div class="table-dropdown">
              <button class="table-btn table-download-btn" title="Download">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
              <div class="table-dropdown-menu">
                <button class="table-dropdown-item" data-action="download-csv" data-table="${encodedTable}">Download CSV</button>
                <button class="table-dropdown-item" data-action="download-markdown" data-table="${encodedTable}">Download Markdown</button>
              </div>
            </div>
            <div class="table-dropdown">
              <button class="table-btn table-copy-btn" title="Copy to clipboard">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
              <div class="table-dropdown-menu">
                <button class="table-dropdown-item" data-action="copy-csv" data-table="${encodedTable}">CSV</button>
                <button class="table-dropdown-item" data-action="copy-markdown" data-table="${encodedTable}">Markdown</button>
                <button class="table-dropdown-item" data-action="copy-plain" data-table="${encodedTable}">Plain</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  );

  return html;
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

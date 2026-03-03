import { marked } from 'marked';
import { ALERT_TRIANGLE_ICON, CHECK_ICON, COLLAPSE_ROWS_ICON, COPY_ICON, CSV_ICON, DOWNLOAD_ICON, EXPAND_ICON, EXPAND_ROWS_ICON, FILE_TEXT_ICON, INFO_ICON, LIGHTBULB_ICON, MARKDOWN_ICON, PLAIN_TEXT_ICON, STAR_ICON, TABLE_ICON, X_CIRCLE_ICON } from './markdown-icons';

declare global {
  interface Window {
    hljs?: {
      highlight: (code: string, options: { language: string }) => { value: string };
      getLanguage: (lang: string) => unknown;
      highlightAuto: (code: string) => { value: string };
    };
  }
}

// Store for mermaid placeholders
const mermaidPlaceholders = new Map<string, string>();

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
    icon: FILE_TEXT_ICON,
    borderColor: 'border-l-blue-500',
    iconBg: 'text-blue-400',
    titleColor: 'text-blue-400',
  },
  TIP: {
    icon: LIGHTBULB_ICON,
    borderColor: 'border-l-green-500',
    iconBg: 'text-green-400',
    titleColor: 'text-green-400',
  },
  IMPORTANT: {
    icon: INFO_ICON,
    borderColor: 'border-l-purple-500',
    iconBg: 'text-purple-400',
    titleColor: 'text-purple-400',
  },
  WARNING: {
    icon: ALERT_TRIANGLE_ICON,
    borderColor: 'border-l-amber-500',
    iconBg: 'text-amber-400',
    titleColor: 'text-amber-400',
  },
  CAUTION: {
    icon: X_CIRCLE_ICON,
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

/**
 * Extract mermaid code blocks and replace them with placeholders.
 * This allows React components to hydrate them with interactive diagrams.
 */
function extractMermaidBlocks(markdown: string): string {
  // Clear previous placeholders
  mermaidPlaceholders.clear();

  // Match mermaid code blocks: ```mermaid ... ```
  const mermaidPattern = /```mermaid\n([\s\S]*?)```/g;

  let result = markdown.replace(mermaidPattern, (match, code) => {
    const trimmedCode = code.trim();
    if (!trimmedCode) return match;

    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const placeholder = `[[MERMAID-${id}-END]]`;

    mermaidPlaceholders.set(placeholder, trimmedCode);

    return placeholder;
  });

  return result;
}

/**
 * Replace mermaid placeholders with HTML placeholder divs for React hydration.
 */
function replaceMermaidPlaceholders(html: string): string {
  mermaidPlaceholders.forEach((code, placeholder) => {
    const id = placeholder.replace('[[MERMAID-', '').replace('-END]]', '');
    const encodedCode = encodeForAttribute(code);

    // Create a placeholder div that will be hydrated by React
    const placeholderHtml = `
      <div
        data-mermaid-placeholder="true"
        data-mermaid-code="${encodedCode}"
        data-mermaid-id="${id}"
        class="mermaid-placeholder my-4"
      >
        <div class="rounded-lg border border-border bg-muted/30 p-8 flex items-center justify-center min-h-50">
          <div class="flex items-center gap-2 text-muted-foreground">
            <div class="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
            <span class="text-sm">Loading diagram...</span>
          </div>
        </div>
      </div>
    `;

    const escapedPlaceholder = placeholder.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    html = html.replace(new RegExp(`<p>${escapedPlaceholder}</p>`, 'g'), placeholderHtml);
    html = html.replace(new RegExp(escapedPlaceholder, 'g'), placeholderHtml);
  });

  return html;
}

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
function replaceBlockquotePlaceholders(html: string, _isStreaming?: boolean): string {
  blockquotePlaceholders.forEach((data, placeholder) => {
    // Parse the markdown content inside the blockquote
    const parsedContent = marked.parse(data.content, { async: false }) as string;

    let blockquoteHtml: string;

    if (data.type === 'blockquote') {
      // Regular blockquote
      blockquoteHtml = `<blockquote class="border-l-4 border-l-primary bg-primary/5 rounded-r-md my-4 p-4 text-sm text-foreground italic leading-relaxed">${parsedContent}</blockquote>`;
    } else {
      // Callout blockquote
      const config = data.config!;
      blockquoteHtml = `
      <div class="border-l-4 ${config.borderColor} bg-muted/30 rounded-r-md my-4 p-4 shadow-2xs border border-border/50">
        <div class="flex items-center gap-2 mb-2">
          <div class="shrink-0 ${config.iconBg}">
            ${config.icon}
          </div>
          <div class="text-2xs font-bold uppercase tracking-widest ${config.titleColor}">${data.type}</div>
        </div>
        <div class="text-sm text-foreground leading-relaxed prose-p:my-2">${parsedContent}</div>
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

export function renderMarkdown(text: string, isStreaming?: boolean): string {
  if (!text) return '';

  // Store for footnote definitions and references
  const footnoteDefs = new Map<string, string>();
  const footnoteRefs: { id: string; num: number }[] = [];
  const idToNum = new Map<string, number>();
  let nextNum = 1;

  // 0. Extract mermaid code blocks FIRST (before any other processing)
  let processedText = extractMermaidBlocks(text);

  // 1. Extract footnote definitions first (Gfm style: [^id]: content)
  // We do this by line to handle multi-line indented content properly
  const lines = processedText.split('\n');
  const nonDefLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check for footnote definition start: [^id]: content
    const match = line.match(/^\[\^([^\]\s]+)\]: +(.*)/);

    if (match) {
      const id = match[1];
      let content = match[2];

      // Look ahead for subsequent lines that are indented by 4 spaces or a tab
      // or empty lines that might be followed by indented lines
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (nextLine.startsWith('    ') || nextLine.startsWith('\t') || nextLine.trim() === '') {
          // Check if this is truly part of the footnote or just an empty line
          // If it's an empty line, we peek further to see if there's more indented content
          if (nextLine.trim() === '') {
            let foundMore = false;
            for (let j = i + 2; j < lines.length; j++) {
              if (lines[j].trim() === '') continue;
              if (lines[j].startsWith('    ') || lines[j].startsWith('\t')) {
                foundMore = true;
                break;
              }
              break;
            }
            if (!foundMore) break;
          }

          content += '\n' + nextLine;
          i++;
        } else {
          break;
        }
      }

      // Store cleaned content (removing indentation)
      footnoteDefs.set(id, content.replace(/^(?: {4}|\t)/gm, '').trim());
    } else {
      nonDefLines.push(line);
    }
  }
  processedText = nonDefLines.join('\n');

  // 2. Process footnote references: [^id]
  // We replace them with placeholders FIRST to avoid issues during markdown parsing
  processedText = processedText.replace(/\[\^([^\]\s]+)\]/g, (match, id) => {
    // Only turn into a footnote if we actually have a definition for it
    if (!footnoteDefs.has(id)) return match;

    if (!idToNum.has(id)) {
      const num = nextNum++;
      idToNum.set(id, num);
      footnoteRefs.push({ id, num });
    }

    const num = idToNum.get(id)!;
    // Use a unique placeholder that marked won't mess with
    return `[[FOOTNOTE-REF-${num}-${id}-END]]`;
  });

  // Convert citation markers [1][2] to clickable superscript links (non-footnote citations)
  processedText = processedText.replace(/\[(\d+)\]/g, '<sup><a href="#cite-$1" class="citation-link text-primary hover:underline">[$1]</a></sup>');

  // Pre-process blockquotes (callouts + regular) BEFORE markdown parsing
  processedText = processBlockquotes(processedText);

  // Fix incomplete markdown tables during streaming
  if (isStreaming) {
    const lines = processedText.split('\n');
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1].trim();
      if (lastLine.startsWith('|') && !lastLine.endsWith('|') && lastLine.length > 1) {
        processedText += ' |';
      }
    }
  }

  // Parse markdown
  let html = marked.parse(processedText, { async: false }) as string;

  // Replace blockquote placeholders with actual HTML
  html = replaceBlockquotePlaceholders(html, isStreaming);

  // Replace mermaid placeholders with HTML placeholder divs
  html = replaceMermaidPlaceholders(html);

  // 3. Post-process footnote references in the generated HTML
  footnoteRefs.forEach(({ id, num }) => {
    const fnHtml = `<sup><a href="#fn-${id}" id="fnref-${id}" class="footnote-link inline-block px-0.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors" title="Jump to footnote ${num}">[${num}]</a></sup>`;

    // Replace placeholders: they might be wrapped in <p> tags by marked if they were alone
    const placeholder = `[[FOOTNOTE-REF-${num}-${id}-END]]`;
    const escapedPlaceholder = placeholder.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

    // Replace all occurrences
    html = html.replace(new RegExp(escapedPlaceholder, 'g'), fnHtml);
  });

  // 4. Append Footnote Section at the bottom if any exist
  if (footnoteRefs.length > 0) {
    let fnSectionHtml = `
      <div class="mt-12 pt-6 border-t border-border/60 not-prose">
        <h3 class="text-2xs font-black uppercase tracking-[0.2em] text-muted-foreground/50 mb-2">References & Notes</h3>
        <ol class="space-y-1">
    `;

    footnoteRefs.forEach(({ id, num }) => {
      const content = footnoteDefs.get(id) || '';
      // Parse the content of the footnote as markdown
      fnSectionHtml += `
        <li id="fn-${id}" class="footnote-item group/fn flex gap-3 text-xs leading-relaxed text-muted-foreground hover:text-foreground transition-all duration-300">
          <div class="shrink-0 font-bold text-primary/40 group-hover/fn:text-primary transition-colors mt-0.5 min-w-[1.2rem]">
            ${num}.
          </div>
          <div class="grow prose-compact">
          <a href="#fnref-${id}" class="text-primary underline" title="Back to content">
          ${content}
              ⏎
            </a>
          </div>
        </li>
      `;
    });

    fnSectionHtml += `
        </ol>
      </div>
    `;

    html += fnSectionHtml;
  }

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
        <div class="not-prose md-codeblock-wrapper group relative my-4 rounded-md border border-white/10 bg-[#0d1117] overflow-hidden shadow-xl">
          <div class="flex items-center justify-between px-3 py-1.5 bg-black/30 border-b border-white/5">
            <span class="text-2xs font-bold uppercase tracking-widest text-white/50">${lang}</span>
            <button class="copy-code-btn group/copy h-6 px-2 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-tight text-white/50 hover:text-white transition-all rounded-sm hover:bg-white/10" data-code="${escapedCode}" title="Copy code">
              <span class="flex items-center gap-1.5 group-data-[state=success]/copy:hidden">
                ${COPY_ICON}
              </span>
              <span class="hidden items-center gap-1.5 group-data-[state=success]/copy:flex text-green-400">
                ${CHECK_ICON}
              </span>
            </button>
          </div>
          <pre class="not-prose md-codeblock text-xs leading-relaxed overflow-x-auto"><code class="hljs language-${lang}">${highlightedCode}</code></pre>
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
        <div class="not-prose md-codeblock-wrapper group relative my-4 rounded-md border border-white/10 bg-[#0d1117] overflow-hidden shadow-xl">
          <div class="flex items-center justify-between px-3 py-1.5 bg-black/30 border-b border-white/5">
            <span class="text-2xs font-bold uppercase tracking-widest text-white/50">code</span>
            <button class="copy-code-btn group/copy h-6 px-2 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-tight text-white/50 hover:text-white transition-all rounded-sm hover:bg-white/10" data-code="${escapedCode}" title="Copy code">
              <span class="flex items-center gap-1.5 group-data-[state=success]/copy:hidden">
                ${COPY_ICON}
              </span>
              <span class="hidden items-center gap-1.5 group-data-[state=success]/copy:flex text-green-400">
                ${CHECK_ICON}
              </span>
            </button>
          </div>
          <pre class="not-prose md-codeblock text-xs leading-relaxed overflow-x-auto"><code class="hljs">${highlightedCode}</code></pre>
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
        <span class="md-image-wrapper group relative inline-block my-2 overflow-hidden rounded-md border border-border/50" data-src="${encodedSrc}">
          <img${before}src="${src}"${after} class="max-w-full h-auto cursor-zoom-in transition-transform duration-300 group-hover:scale-105 my-0!">
          <span class="md-image-fav-indicator absolute top-2.5 left-2.5 p-1 bg-amber-500 rounded-sm shadow-sm z-10 hidden">
            ${STAR_ICON}
          </span>
          <span class="md-image-actions absolute top-2 right-2 flex gap-1.5 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
            <button class="md-image-btn md-image-favorite-btn h-7 w-7 flex items-center justify-center bg-black/60 backdrop-blur-md text-white rounded-sm hover:bg-primary transition-all shadow-lg" data-src="${encodedSrc}" title="Favorite image">
              <span class="fav-icon">
                ${STAR_ICON}
              </span>
            </button>
            <button class="group/img md-image-btn md-image-copy-btn h-7 w-7 flex items-center justify-center bg-black/60 backdrop-blur-md text-white rounded-sm hover:bg-primary transition-all shadow-lg" data-src="${encodedSrc}" title="Copy image">
              <span class="group-data-[state=success]/img:hidden">
                ${COPY_ICON}
              </span>
              <span class="hidden group-data-[state=success]/img:block text-green-400">
                ${CHECK_ICON}
              </span>
            </button>
            <button class="group/img md-image-btn md-image-download-btn h-7 w-7 flex items-center justify-center bg-black/60 backdrop-blur-md text-white rounded-sm hover:bg-primary transition-all shadow-lg" data-src="${encodedSrc}" title="Download image">
              <span class="group-data-[state=success]/img:hidden">
                ${DOWNLOAD_ICON}
              </span>
              <span class="hidden group-data-[state=success]/img:block text-green-400">
                ${CHECK_ICON}
              </span>
            </button>
          </span>
        </span>
      `;
    }
  );

  // Style inline code
  html = html.replace(
    /<code>([^<]+)<\/code>/g,
    '<code class="md-inline-code px-1.5 py-0.5 rounded-sm bg-muted/60 text-primary font-mono text-base border border-border/40">$1</code>'
  );

  // Wrap tables with premium, compact, elegant toolbar for horizontal scrolling and actions
  html = html.replace(
    /<table>([\s\S]*?)<\/table>/g,
    (match) => {
      // Style the table for a refined, premium look with proper scrolling
      let tableHtml = match.replace('<table>', '<table class="w-full min-w-max text-sm border-collapse">');

      // Post-process table HTML with refined styling
      // Header: compact, elegant with subtle background
      tableHtml = tableHtml.replace(/<thead>/g, '<thead class="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">');
      tableHtml = tableHtml.replace(/<th(?:\s[^>]*)?>/g, '<th class="h-9 px-3 text-left align-middle font-semibold text-xs uppercase tracking-[0.08em] text-muted-foreground/90 border-b border-border/60 whitespace-nowrap">');

      // Body rows: subtle zebra striping and refined hover
      tableHtml = tableHtml.replace(/<tbody>/g, '<tbody class="[&_:nth-child(odd)]:bg-transparent [&_:nth-child(even)]:bg-muted/20">');
      tableHtml = tableHtml.replace(/<tr>/g, '<tr class="group/row border-b border-border/30 last:border-0 transition-colors hover:bg-primary/5">');

      // Cells: compact with click-to-expand truncation and ellipsis
      tableHtml = tableHtml.replace(/<td(?:\s[^>]*)?>([^]*?)<\/td>/g, (_, content) => {
        const styledContent = content.replace(/class="md-inline-code/g, 'class="md-inline-code !px-1.5 !py-0.5 !text-xs !bg-muted/70 !border-border/50 !rounded font-medium');
        return `<td class="h-8 px-3 align-middle text-sm text-foreground/90 max-w-[40ch] min-w-8 text-ellipsis whitespace-nowrap overflow-hidden cursor-pointer hover:bg-muted/30 transition-all duration-200 md-expandable-cell" title="Click to expand">${styledContent}</td>`;
      });

      // First column: slightly emphasized for hierarchy
      tableHtml = tableHtml.replace(/<tr>\s*<td/g, '<tr class="group/row border-b border-border/30 last:border-0 transition-colors hover:bg-primary/5"><td class="h-8 px-3 align-middle text-xs font-medium text-foreground max-w-[40ch] min-w-8 text-ellipsis whitespace-nowrap overflow-hidden cursor-pointer hover:bg-muted/30 transition-all duration-200 md-expandable-cell" title="Click to expand"');

      // Encode table HTML for data attributes
      const encodedTable = encodeURIComponent(match);

      return `
        <div class="table-wrapper not-prose group/table-wrapper relative my-5 rounded-xl border border-border/50 bg-linear-to-b from-card to-muted/10 overflow-hidden shadow-sm hover:shadow-md hover:border-border/70 transition-all duration-300">
          <!-- Floating Header Bar -->
          <div class="table-header-bar flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/40">
            <div class="flex items-center gap-2 text-muted-foreground">
              <span class="opacity-60">${TABLE_ICON}</span>
              <span class="text-xs font-semibold uppercase tracking-widest">Table</span>
            </div>
            <div class="flex items-center gap-0.5">
              <!-- Expand All Rows -->
              <button class="table-btn table-expand-all-btn h-7 w-7 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 rounded-md transition-all duration-200" title="Expand all cells">
                <span class="expand-icon">${EXPAND_ROWS_ICON}</span>
                <span class="collapse-icon hidden">${COLLAPSE_ROWS_ICON}</span>
              </button>

              <!-- Fullscreen -->
              <button class="table-btn table-fullscreen-btn h-7 w-7 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 rounded-md transition-all duration-200" data-table="${encodedTable}" title="Fullscreen">
                ${EXPAND_ICON}
              </button>

              <!-- Download Dropdown -->
              <div class="table-dropdown relative">
                <button class="table-btn table-download-btn h-7 w-7 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 rounded-md transition-all duration-200" title="Download">
                  ${DOWNLOAD_ICON}
                </button>
                <div class="table-dropdown-menu invisible opacity-0 absolute right-0 top-full mt-1 w-40 bg-popover border border-border rounded-lg shadow-xl z-50 flex flex-col p-1 transition-all duration-200">
                  <div class="px-2 py-1.5 text-2xs font-bold uppercase tracking-[0.15em] text-muted-foreground/50 border-b border-border/50 mb-1">Download as</div>
                  <button class="flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-left text-popover-foreground/80 hover:text-popover-foreground hover:bg-muted/50 rounded-md transition-all" data-action="download-csv" data-table="${encodedTable}">
                    ${CSV_ICON}
                    <span>CSV Spreadsheet</span>
                  </button>
                  <button class="flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-left text-popover-foreground/80 hover:text-popover-foreground hover:bg-muted/50 rounded-md transition-all" data-action="download-markdown" data-table="${encodedTable}">
                    ${MARKDOWN_ICON}
                    <span>Markdown</span>
                  </button>
                </div>
              </div>

              <!-- Copy Dropdown -->
              <div class="table-dropdown relative">
                <button class="group/copy table-btn table-copy-btn h-7 w-7 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 rounded-md transition-all duration-200" title="Copy">
                  <span class="group-data-[state=success]/copy:hidden">${COPY_ICON}</span>
                  <span class="hidden group-data-[state=success]/copy:block text-emerald-500">${CHECK_ICON}</span>
                </button>
                <div class="table-dropdown-menu invisible opacity-0 absolute right-0 top-full mt-1 w-36 bg-popover border border-border rounded-lg shadow-xl z-50 flex flex-col p-1 transition-all duration-200">
                  <div class="px-2 py-1.5 text-2xs font-bold uppercase tracking-[0.15em] text-muted-foreground/50 border-b border-border/50 mb-1">Copy as</div>
                  <button class="flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-left text-popover-foreground/80 hover:text-popover-foreground hover:bg-muted/50 rounded-md transition-all" data-action="copy-csv" data-table="${encodedTable}">
                    ${CSV_ICON}
                    <span>CSV</span>
                  </button>
                  <button class="flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-left text-popover-foreground/80 hover:text-popover-foreground hover:bg-muted/50 rounded-md transition-all" data-action="copy-markdown" data-table="${encodedTable}">
                    ${MARKDOWN_ICON}
                    <span>Markdown</span>
                  </button>
                  <button class="flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-left text-popover-foreground/80 hover:text-popover-foreground hover:bg-muted/50 rounded-md transition-all" data-action="copy-plain" data-table="${encodedTable}">
                    ${PLAIN_TEXT_ICON}
                    <span>Plain Text</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Table Container -->
          <div class="table-container overflow-x-auto overscroll-x-contain max-h-105">
            ${tableHtml}
          </div>

          <!-- Subtle Footer Indicator -->
          <div class="table-footer h-1 bg-linear-to-r from-transparent via-border/30 to-transparent"></div>
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

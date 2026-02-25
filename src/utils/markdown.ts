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
function replaceBlockquotePlaceholders(html: string, isStreaming?: boolean): string {
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
          <div class="text-[10px] font-bold uppercase tracking-widest ${config.titleColor}">${data.type}</div>
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

  // 1. Extract footnote definitions first (Gfm style: [^id]: content)
  // We do this by line to handle multi-line indented content properly
  let processedText = text;
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

  // 3. Post-process footnote references in the generated HTML
  footnoteRefs.forEach(({ id, num }) => {
    const fnHtml = `<sup><a href="#fn-${id}" id="fnref-${id}" class="footnote-link inline-block px-0.5 text-[0.75rem] font-bold text-primary hover:text-primary/80 transition-colors" title="Jump to footnote ${num}">[${num}]</a></sup>`;
    
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
        <h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 mb-2">References & Notes</h3>
        <ol class="space-y-1">
    `;

    footnoteRefs.forEach(({ id, num }) => {
      const content = footnoteDefs.get(id) || '';
      // Parse the content of the footnote as markdown
      fnSectionHtml += `
        <li id="fn-${id}" class="footnote-item group/fn flex gap-3 text-[13px] leading-relaxed text-muted-foreground hover:text-foreground transition-all duration-300">
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
            <span class="text-[10px] font-bold uppercase tracking-widest text-white/50">${lang}</span>
            <button class="copy-code-btn group/copy h-6 px-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tight text-white/50 hover:text-white transition-all rounded-sm hover:bg-white/10" data-code="${escapedCode}" title="Copy code">
              <span class="flex items-center gap-1.5 group-data-[state=success]/copy:hidden">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                <span>Copy</span>
              </span>
              <span class="hidden items-center gap-1.5 group-data-[state=success]/copy:flex text-green-400">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>Copied</span>
              </span>
            </button>
          </div>
          <pre class="not-prose md-codeblock text-[13px] leading-relaxed overflow-x-auto"><code class="hljs language-${lang}">${highlightedCode}</code></pre>
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
            <span class="text-[10px] font-bold uppercase tracking-widest text-white/50">code</span>
            <button class="copy-code-btn group/copy h-6 px-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tight text-white/50 hover:text-white transition-all rounded-sm hover:bg-white/10" data-code="${escapedCode}" title="Copy code">
              <span class="flex items-center gap-1.5 group-data-[state=success]/copy:hidden">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                <span>Copy</span>
              </span>
              <span class="hidden items-center gap-1.5 group-data-[state=success]/copy:flex text-green-400">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>Copied</span>
              </span>
            </button>
          </div>
          <pre class="not-prose md-codeblock text-[13px] leading-relaxed overflow-x-auto"><code class="hljs">${highlightedCode}</code></pre>
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
            <svg width="10" height="10" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </span>
          <span class="md-image-actions absolute top-2 right-2 flex gap-1.5 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
            <button class="md-image-btn md-image-favorite-btn h-7 w-7 flex items-center justify-center bg-black/60 backdrop-blur-md text-white rounded-sm hover:bg-primary transition-all shadow-lg" data-src="${encodedSrc}" title="Favorite image">
              <svg class="fav-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
            <button class="group/img md-image-btn md-image-copy-btn h-7 w-7 flex items-center justify-center bg-black/60 backdrop-blur-md text-white rounded-sm hover:bg-primary transition-all shadow-lg" data-src="${encodedSrc}" title="Copy image">
              <svg class="group-data-[state=success]/img:hidden" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              <svg class="hidden group-data-[state=success]/img:block text-green-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
            <button class="group/img md-image-btn md-image-download-btn h-7 w-7 flex items-center justify-center bg-black/60 backdrop-blur-md text-white rounded-sm hover:bg-primary transition-all shadow-lg" data-src="${encodedSrc}" title="Download image">
              <svg class="group-data-[state=success]/img:hidden" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <svg class="hidden group-data-[state=success]/img:block text-green-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
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
    '<code class="md-inline-code px-1.5 py-0.5 rounded-sm bg-muted/60 text-primary font-mono text-[0.9em] border border-border/40">$1</code>'
  );

  // Wrap tables with toolbar for horizontal scrolling and actions
  html = html.replace(
    /<table>([\s\S]*?)<\/table>/g,
    (match) => {
      // Style the table for the premium look
      let tableHtml = match.replace('<table>', '<table class="w-full caption-bottom text-sm m-0! border-collapse border-hidden">');
      
      // Post-process table HTML to add specific styling classes matching user request
      tableHtml = tableHtml.replace(/<thead>/g, '<thead class="[&_tr]:border-b sticky top-0 z-20 bg-secondary/95 backdrop-blur-md rounded-t-lg">');
      tableHtml = tableHtml.replace(/<th(?:\s[^>]*)?>/g, '<th class="h-10 px-3 align-middle font-bold text-start text-[10px] uppercase tracking-wider text-muted-foreground py-2 border-b border-border/50">');
      tableHtml = tableHtml.replace(/<tr>/g, '<tr class="border-b border-border/5 last:border-0 transition-colors hover:bg-muted/40 group/row">');
      
      // Target cells with truncation and min-w logic
      tableHtml = tableHtml.replace(/<td(?:\s[^>]*)?>([^]*?)<\/td>/g, (_, content) => {
        const styledContent = content.replace(/class="md-inline-code/g, 'class="md-inline-code table-chip px-2 py-0.5 bg-muted/50 border-0 rounded-md text-foreground shadow-sm font-semibold');
        
        // Added expandable-cell class and the requested truncation classes
        return `<td class="p-3 align-top text-xs text-ellipsis whitespace-nowrap overflow-hidden max-w-[40ch] min-w-8 cursor-pointer hover:bg-muted/10 transition-all duration-200 md-expandable-cell" title="Click to expand">${styledContent}</td>`;
      });
      
      // Ensure the first td has slightly different bolding if needed, but keeping the truncation
      tableHtml = tableHtml.replace(/<tr>\s*<td/g, '<tr><td class="first-col p-3 align-top font-bold text-foreground text-ellipsis whitespace-nowrap overflow-hidden max-w-[40ch] min-w-8 cursor-pointer hover:bg-muted/10 transition-all duration-200 md-expandable-cell" title="Click to expand"');

      // Encode table HTML for data attributes
      const encodedTable = encodeURIComponent(match);
            
      return `
        <div class="table-wrapper not-prose group relative my-6 rounded-lg border border-border/80 overflow-hidden bg-card/40 flex flex-col">
          <div class="table-container overflow-x-auto max-h-[500px]">
            ${tableHtml}
          </div>
          <div class="control flex items-center justify-between px-3 py-2 bg-muted/40 border-t border-border/50">
            <button class="table-btn table-fullscreen-btn h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm transition-all" title="Fullscreen">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-maximize2-icon lucide-maximize-2"><path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/></svg>
            </button>
            <div class="flex items-center gap-1.5">
              <div class="table-dropdown relative">
                <button class="table-btn table-download-btn h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm transition-all" title="Download">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                  </svg>
                </button>
                <div class="table-dropdown-menu hidden absolute right-0 bottom-full mb-2 w-36 bg-card border border-border rounded-md shadow-2xl z-50 flex-col p-1 animate-in fade-in slide-in-from-bottom-2">
                  <button class="flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-tight text-left hover:bg-muted rounded-sm transition-all text-muted-foreground hover:text-foreground" data-action="download-csv" data-table="${encodedTable}">
                    <svg fill="currentColor" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="16" height="16" viewBox="0 0 548.29 548.291" xml:space="preserve"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <path d="M486.2,196.121h-13.164V132.59c0-0.399-0.064-0.795-0.116-1.2c-0.021-2.52-0.824-5-2.551-6.96L364.656,3.677 c-0.031-0.034-0.064-0.044-0.085-0.075c-0.629-0.707-1.364-1.292-2.141-1.796c-0.231-0.157-0.462-0.286-0.704-0.419 c-0.672-0.365-1.386-0.672-2.121-0.893c-0.199-0.052-0.377-0.134-0.576-0.188C358.229,0.118,357.4,0,356.562,0H96.757 C84.893,0,75.256,9.649,75.256,21.502v174.613H62.093c-16.972,0-30.733,13.756-30.733,30.73v159.81 c0,16.966,13.761,30.736,30.733,30.736h13.163V526.79c0,11.854,9.637,21.501,21.501,21.501h354.777 c11.853,0,21.502-9.647,21.502-21.501V417.392H486.2c16.966,0,30.729-13.764,30.729-30.731v-159.81 C516.93,209.872,503.166,196.121,486.2,196.121z M96.757,21.502h249.053v110.006c0,5.94,4.818,10.751,10.751,10.751h94.973v53.861 H96.757V21.502z M258.618,313.18c-26.68-9.291-44.063-24.053-44.063-47.389c0-27.404,22.861-48.368,60.733-48.368 c18.107,0,31.447,3.811,40.968,8.107l-8.09,29.3c-6.43-3.107-17.862-7.632-33.59-7.632c-15.717,0-23.339,7.149-23.339,15.485 c0,10.247,9.047,14.769,29.78,22.632c28.341,10.479,41.681,25.239,41.681,47.874c0,26.909-20.721,49.786-64.792,49.786 c-18.338,0-36.449-4.776-45.497-9.77l7.38-30.016c9.772,5.014,24.775,10.006,40.264,10.006c16.671,0,25.488-6.908,25.488-17.396 C285.536,325.789,277.909,320.078,258.618,313.18z M69.474,302.692c0-54.781,39.074-85.269,87.654-85.269 c18.822,0,33.113,3.811,39.549,7.149l-7.392,28.816c-7.38-3.084-17.632-5.939-30.491-5.939c-28.822,0-51.206,17.375-51.206,53.099 c0,32.158,19.051,52.4,51.456,52.4c10.947,0,23.097-2.378,30.241-5.238l5.483,28.346c-6.672,3.34-21.674,6.919-41.208,6.919 C98.06,382.976,69.474,348.424,69.474,302.692z M451.534,520.962H96.757v-103.57h354.777V520.962z M427.518,380.583h-42.399 l-51.45-160.536h39.787l19.526,67.894c5.479,19.046,10.479,37.386,14.299,57.397h0.709c4.048-19.298,9.045-38.352,14.526-56.693 l20.487-68.598h38.599L427.518,380.583z"></path> </g> </g></svg>
                    Download CSV
                  </button>
                  <button class="flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-tight text-left hover:bg-muted rounded-sm transition-all text-muted-foreground hover:text-foreground" data-action="download-markdown" data-table="${encodedTable}">
                    <svg fill="currentColor" width="16" height="16" viewBox="0 0 16.00 16.00" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M6.345 5h2.1v6.533H6.993l.055-5.31-1.774 5.31H4.072l-1.805-5.31c.04.644.06 5.31.06 5.31H1V5h2.156s1.528 4.493 1.577 4.807L6.345 5zm6.71 3.617v-3.5H11.11v3.5H9.166l2.917 2.916L15 8.617h-1.945z"></path></g></svg>
                    Markdown
                  </button>
                </div>
              </div>
              <div class="table-dropdown relative">
                <button class="group/table table-btn table-copy-btn h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm transition-all" title="Copy">
                  <svg class="group-data-[state=success]/table:hidden" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  <svg class="hidden group-data-[state=success]/table:block text-green-500" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </button>
                <div class="table-dropdown-menu hidden absolute right-0 bottom-full mb-2 w-32 bg-card border border-border rounded-md shadow-2xl z-50 flex-col p-1 animate-in fade-in slide-in-from-bottom-2">
                  <button class="flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-tight text-left hover:bg-muted rounded-sm transition-all text-muted-foreground hover:text-foreground" data-action="copy-csv" data-table="${encodedTable}">
                    <svg fill="currentColor" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="16" height="16" viewBox="0 0 548.29 548.291" xml:space="preserve"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <path d="M486.2,196.121h-13.164V132.59c0-0.399-0.064-0.795-0.116-1.2c-0.021-2.52-0.824-5-2.551-6.96L364.656,3.677 c-0.031-0.034-0.064-0.044-0.085-0.075c-0.629-0.707-1.364-1.292-2.141-1.796c-0.231-0.157-0.462-0.286-0.704-0.419 c-0.672-0.365-1.386-0.672-2.121-0.893c-0.199-0.052-0.377-0.134-0.576-0.188C358.229,0.118,357.4,0,356.562,0H96.757 C84.893,0,75.256,9.649,75.256,21.502v174.613H62.093c-16.972,0-30.733,13.756-30.733,30.73v159.81 c0,16.966,13.761,30.736,30.733,30.736h13.163V526.79c0,11.854,9.637,21.501,21.501,21.501h354.777 c11.853,0,21.502-9.647,21.502-21.501V417.392H486.2c16.966,0,30.729-13.764,30.729-30.731v-159.81 C516.93,209.872,503.166,196.121,486.2,196.121z M96.757,21.502h249.053v110.006c0,5.94,4.818,10.751,10.751,10.751h94.973v53.861 H96.757V21.502z M258.618,313.18c-26.68-9.291-44.063-24.053-44.063-47.389c0-27.404,22.861-48.368,60.733-48.368 c18.107,0,31.447,3.811,40.968,8.107l-8.09,29.3c-6.43-3.107-17.862-7.632-33.59-7.632c-15.717,0-23.339,7.149-23.339,15.485 c0,10.247,9.047,14.769,29.78,22.632c28.341,10.479,41.681,25.239,41.681,47.874c0,26.909-20.721,49.786-64.792,49.786 c-18.338,0-36.449-4.776-45.497-9.77l7.38-30.016c9.772,5.014,24.775,10.006,40.264,10.006c16.671,0,25.488-6.908,25.488-17.396 C285.536,325.789,277.909,320.078,258.618,313.18z M69.474,302.692c0-54.781,39.074-85.269,87.654-85.269 c18.822,0,33.113,3.811,39.549,7.149l-7.392,28.816c-7.38-3.084-17.632-5.939-30.491-5.939c-28.822,0-51.206,17.375-51.206,53.099 c0,32.158,19.051,52.4,51.456,52.4c10.947,0,23.097-2.378,30.241-5.238l5.483,28.346c-6.672,3.34-21.674,6.919-41.208,6.919 C98.06,382.976,69.474,348.424,69.474,302.692z M451.534,520.962H96.757v-103.57h354.777V520.962z M427.518,380.583h-42.399 l-51.45-160.536h39.787l19.526,67.894c5.479,19.046,10.479,37.386,14.299,57.397h0.709c4.048-19.298,9.045-38.352,14.526-56.693 l20.487-68.598h38.599L427.518,380.583z"></path> </g> </g></svg>
                    CSV
                  </button>
                  <button class="flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-tight text-left hover:bg-muted rounded-sm transition-all text-muted-foreground hover:text-foreground" data-action="copy-markdown" data-table="${encodedTable}">
                     <svg fill="currentColor" width="16" height="16" viewBox="0 0 16.00 16.00" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M6.345 5h2.1v6.533H6.993l.055-5.31-1.774 5.31H4.072l-1.805-5.31c.04.644.06 5.31.06 5.31H1V5h2.156s1.528 4.493 1.577 4.807L6.345 5zm6.71 3.617v-3.5H11.11v3.5H9.166l2.917 2.916L15 8.617h-1.945z"></path></g></svg>
                    Markdown
                  </button>
                  <button class="flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-tight text-left hover:bg-muted rounded-sm transition-all text-muted-foreground hover:text-foreground" data-action="copy-plain" data-table="${encodedTable}">
                    <svg fill="currentColor" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="16" height="16" viewBox="0 0 548.291 548.291" xml:space="preserve"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <path d="M486.201,196.124h-13.166V132.59c0-0.396-0.062-0.795-0.115-1.196c-0.021-2.523-0.825-5-2.552-6.963L364.657,3.677 c-0.033-0.031-0.064-0.042-0.085-0.075c-0.63-0.704-1.364-1.29-2.143-1.796c-0.229-0.154-0.461-0.283-0.702-0.418 c-0.672-0.366-1.387-0.671-2.121-0.892c-0.2-0.055-0.379-0.134-0.577-0.188C358.23,0.118,357.401,0,356.562,0H96.757 C84.894,0,75.256,9.649,75.256,21.502v174.616H62.09c-16.968,0-30.729,13.753-30.729,30.73v159.812 c0,16.961,13.761,30.731,30.729,30.731h13.166V526.79c0,11.854,9.638,21.501,21.501,21.501h354.776 c11.853,0,21.501-9.647,21.501-21.501V417.392h13.166c16.966,0,30.729-13.764,30.729-30.731V226.854 C516.93,209.872,503.167,196.124,486.201,196.124z M96.757,21.502h249.054v110.006c0,5.943,4.817,10.751,10.751,10.751h94.972 v53.864H96.757V21.502z M202.814,225.042h41.68l14.063,29.3c4.756,9.756,8.336,17.622,12.147,26.676h0.48 c3.798-10.242,6.9-17.392,10.95-26.676l13.587-29.3h41.449l-45.261,78.363l47.638,82.185h-41.927l-14.525-29.06 c-5.956-11.197-9.771-19.528-14.299-28.825h-0.478c-3.334,9.297-7.381,17.628-12.381,28.825l-13.336,29.06h-41.455l46.455-81.224 L202.814,225.042z M66.08,255.532v-30.489h123.382v30.489h-43.828v130.049h-36.434V255.532H66.08z M451.534,520.962H96.757v-103.57 h354.776V520.962z M471.764,255.532h-43.831v130.049h-36.442V255.532h-43.119v-30.489h123.393V255.532z"></path> </g> </g></svg>
                    Plain
                  </button>
                </div>
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

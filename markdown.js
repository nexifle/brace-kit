// Markdown rendering using the 'marked' library
// Re-exports configured marked instance for use in sidebar

import { marked } from './lib/marked.esm.js';

// Configure marked for safe, good-looking output
marked.setOptions({
  gfm: true,           // GitHub Flavored Markdown
  breaks: true,         // Convert \n to <br>
  pedantic: false,
});

// Custom renderer for enhanced styling
const renderer = new marked.Renderer();

// Open links in new tab
renderer.link = ({ href, title, text }) => {
  const titleAttr = title ? ` title="${title}"` : '';
  return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
};

// Code blocks with copy button + language label
renderer.code = ({ text, lang }) => {
  const langClass = lang ? ` class="language-${lang}"` : '';
  const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
  const escapedCode = escapeHtml(text);
  // Store raw code in data attribute for copy button
  const dataCode = text.replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
  return `<div class="md-codeblock-wrapper">${langLabel}<button class="copy-code-btn" data-code="${dataCode}" title="Copy code"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button><pre class="md-codeblock"><code${langClass}>${escapedCode}</code></pre></div>`;
};

// Style inline code
renderer.codespan = ({ text }) => {
  return `<code class="md-inline-code">${text}</code>`;
};

marked.use({ renderer });

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Main render function
export function renderMarkdown(text) {
  if (!text) return '';
  try {
    return marked.parse(text);
  } catch (e) {
    console.warn('Markdown parse error:', e);
    return `<p>${escapeHtml(text)}</p>`;
  }
}

// Streaming renderer — incrementally renders markdown as tokens arrive
export class StreamRenderer {
  constructor(element) {
    this.element = element;
    this.buffer = '';
  }

  append(text) {
    this.buffer += text;
    try {
      this.element.innerHTML = marked.parse(this.buffer);
    } catch (e) {
      // If partial markdown fails, show raw text
      this.element.textContent = this.buffer;
    }
  }

  getContent() {
    return this.buffer;
  }

  clear() {
    this.buffer = '';
    this.element.innerHTML = '';
  }
}

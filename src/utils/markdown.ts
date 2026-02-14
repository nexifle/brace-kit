import { marked } from 'marked';

declare global {
  interface Window {
    hljs?: {
      highlightElement: (element: HTMLElement) => void;
    };
  }
}

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

export function renderMarkdown(text: string): string {
  if (!text) return '';

  // Escape HTML entities first for safety
  let html = marked.parse(text, { async: false }) as string;

  // Add code block copy buttons and language labels
  html = html.replace(
    /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
    (_match, lang, code) => {
      const escapedCode = code
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      return `
        <div class="md-codeblock-wrapper">
          <span class="code-lang">${lang}</span>
          <button class="copy-code-btn" data-code="${escapedCode}" title="Copy code">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <pre class="md-codeblock"><code class="language-${lang}">${code}</code></pre>
        </div>
      `;
    }
  );

  // Handle code blocks without language
  html = html.replace(
    /<pre><code>([\s\S]*?)<\/code><\/pre>/g,
    (_match, code) => {
      const escapedCode = code
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      return `
        <div class="md-codeblock-wrapper">
          <button class="copy-code-btn" data-code="${escapedCode}" title="Copy code">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <pre class="md-codeblock"><code>${code}</code></pre>
        </div>
      `;
    }
  );

  // Style inline code
  html = html.replace(
    /<code>([^<]+)<\/code>/g,
    '<code class="md-inline-code">$1</code>'
  );

  return html;
}

export function highlightCodeBlocks(element: HTMLElement) {
  if (window.hljs) {
    const codeBlocks = element.querySelectorAll('pre code');
    codeBlocks.forEach((block) => {
      window.hljs!.highlightElement(block as HTMLElement);
    });
  }
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

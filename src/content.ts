/// <reference types="chrome" />
import TurndownService from 'turndown';
import { initSelectionUI } from './content/selection-ui/index.ts';

// Content script — smart page reader with HTML-to-Markdown conversion
// Uses Turndown to convert page HTML to clean markdown, stripping scripts, styles, etc.
// Also provides text selection UI for quick AI actions

// Listen for messages from the service worker / sidebar
chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (message.type === 'GET_PAGE_CONTENT') {
    getPageContent().then(sendResponse);
    return true;
  }

  if (message.type === 'GET_SELECTED_TEXT') {
    const selection = window.getSelection();
    let selectedText = '';
    let selectedHtml = '';

    if (selection && selection.rangeCount > 0) {
      selectedText = selection.toString().trim();
      // Also get HTML of selection for richer conversion
      const container = document.createElement('div');
      for (let i = 0; i < selection.rangeCount; i++) {
        container.appendChild(selection.getRangeAt(i).cloneContents());
      }
      selectedHtml = container.innerHTML;
    }

    // Convert selected HTML to markdown
    let selectedMarkdown = selectedText;
    if (selectedHtml) {
      try {
        const td = createTurndown();
        selectedMarkdown = td.turndown(selectedHtml);
      } catch (e) {
        selectedMarkdown = selectedText;
      }
    }

    sendResponse({
      selectedText: selectedMarkdown || selectedText,
      pageTitle: document.title,
      pageUrl: window.location.href,
    });
    return true;
  }
});

// Send selected text to sidebar when user makes a selection
document.addEventListener('mouseup', () => {
  const selection = window.getSelection();
  const selectedText = selection ? selection.toString().trim() : '';
  if (selectedText.length > 0) {
    try {
      chrome.runtime.sendMessage(
        {
          type: 'TEXT_SELECTED',
          data: {
            selectedText,
            pageTitle: document.title,
            pageUrl: window.location.href,
          },
        },
        () => {
          // Accessing lastError inside the callback silences the
          // "Unchecked runtime.lastError" warning when the service worker
          // is sleeping and there is no receiving end for the message.
          void chrome.runtime.lastError;
        },
      );
    } catch {
      // Extension context may be invalidated — fail silently
    }
  }
});

// Create a configured Turndown instance
function createTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });

  // Remove unwanted elements entirely
  td.remove(['script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'nav', 'footer'] as any);

  // Custom rule: treat <aside> as removed (ads, sidebar widgets)
  td.addRule('removeAside', {
    filter: ['aside'],
    replacement: () => '',
  });

  // Custom rule: handle images gracefully
  td.addRule('images', {
    filter: 'img',
    replacement: (_content, node) => {
      const img = node as HTMLImageElement;
      const alt = img.getAttribute('alt') || '';
      const src = img.getAttribute('src') || '';
      if (!src || src.startsWith('data:')) return ''; // skip inline images
      return alt ? `![${alt}](${src})` : '';
    },
  });

  // Custom rule: handle code blocks better
  td.addRule('pre', {
    filter: (node) => node.nodeName === 'PRE' && node.querySelector('code') !== null,
    replacement: (_content, node) => {
      const pre = node as HTMLElement;
      const code = pre.querySelector('code');
      if (!code) return '';
      const lang = (code.className.match(/language-(\w+)/) || [])[1] || '';
      const text = code.textContent || '';
      return `\n\`\`\`${lang}\n${text}\n\`\`\`\n`;
    },
  });

  return td;
}

async function getPageContent() {
  // Get meta description
  const metaDesc =
    (document.querySelector('meta[name="description"]') as HTMLMetaElement)?.content || '';

  let markdown = '';

  // Try to find main content area
  const mainEl =
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('.post-content') ||
    document.querySelector('.article-content') ||
    document.querySelector('.entry-content') ||
    document.querySelector('#content');

  const targetEl = mainEl || document.body;

  // Clone the element to avoid modifying the DOM
  const clone = targetEl.cloneNode(true) as HTMLElement;

  // Remove elements we don't want
  const removeSelectors = [
    'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
    'nav', 'footer', 'header',
    '.ad', '.ads', '.advertisement', '.sponsored',
    '[role="banner"]', '[role="navigation"]', '[role="complementary"]',
    '.sidebar', '.widget', '.popup', '.modal', '.overlay',
    '.cookie-banner', '.cookie-consent',
    '.social-share', '.share-buttons',
    '.comments', '#comments',
    'form', 'button',
  ];

  for (const sel of removeSelectors) {
    clone.querySelectorAll(sel).forEach((el) => el.remove());
  }

  // Remove hidden elements
  clone.querySelectorAll('[hidden], [aria-hidden="true"]').forEach((el) => el.remove());

  try {
    const td = createTurndown();
    markdown = td.turndown(clone.innerHTML);
  } catch (e) {
    console.warn('Turndown conversion failed, falling back to text:', e);
    markdown = cleanText(clone.innerText);
  }

  // Clean up excessive whitespace in markdown
  markdown = markdown
    .replace(/\n{4,}/g, '\n\n\n') // max 3 newlines
    .replace(/^[\s\n]+/, '') // trim start
    .replace(/[\s\n]+$/, ''); // trim end

  // Smart truncation — try to keep at reasonable size
  const maxLen = 30000;
  if (markdown.length > maxLen) {
    // Try to truncate at a paragraph boundary
    const truncated = markdown.substring(0, maxLen);
    const lastParagraph = truncated.lastIndexOf('\n\n');
    markdown = (lastParagraph > maxLen * 0.8 ? truncated.substring(0, lastParagraph) : truncated)
      + '\n\n---\n*[Content truncated — page too long]*';
  }

  return {
    pageTitle: document.title,
    pageUrl: window.location.href,
    metaDescription: metaDesc,
    content: markdown,
    contentType: 'markdown',
    timestamp: new Date().toISOString(),
  };
}

function cleanText(text: string) {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// Initialize text selection UI
initSelectionUI().catch(() => {
  // Silent fail - selection UI is optional
});

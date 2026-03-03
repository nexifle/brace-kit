import { useCallback, useEffect } from 'react';
import type { RefObject } from 'react';
import {
  copyTableAsCsv,
  copyTableAsMarkdown,
  copyTableAsPlain,
  showButtonFeedback,
  downloadTableAsCsv,
  downloadTableAsMarkdown,
} from '../components/message/utils/tableConverters';
import { copyImageToClipboard } from '../components/message/utils/imageProcessing';

/**
 * useMarkdownInteractions
 *
 * Memasang event listener untuk semua elemen interaktif yang dihasilkan oleh
 * renderMarkdown(): copy button di code block, aksi table (copy/download/fullscreen/expand),
 * klik link anchor, dan aksi gambar (copy/download).
 *
 * Hook ini dipakai bersama oleh MessageBubble dan StreamingBubble agar tidak
 * ada duplikasi logic.
 */
export function useMarkdownInteractions(bubbleRef: RefObject<HTMLElement | null>) {
  const handleCopyCode = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.copy-code-btn');
    if (!btn) return;

    e.stopPropagation();
    e.preventDefault();

    const code = btn.getAttribute('data-code');
    if (!code) return;

    const decodedCode = code
      .replace(/&#10;/g, '\n')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

    import('../utils/formatters').then(({ copyToClipboard }) => {
      copyToClipboard(decodedCode).then(() => {
        btn.setAttribute('data-state', 'success');
        setTimeout(() => btn.removeAttribute('data-state'), 1500);
      });
    });
  }, []);

  const handleTableActions = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;

    const closeAllDropdowns = () => {
      document.querySelectorAll('.table-dropdown.open').forEach((el) => el.classList.remove('open'));
    };

    const downloadBtn = target.closest('.table-download-btn');
    if (downloadBtn) {
      const dropdown = downloadBtn.closest('.table-dropdown');
      if (dropdown) {
        document.querySelectorAll('.table-dropdown.open').forEach((el) => {
          if (el !== dropdown) el.classList.remove('open');
        });
        dropdown.classList.toggle('open');
        e.stopPropagation();
      }
      return;
    }

    const copyBtn = target.closest('.table-copy-btn');
    if (copyBtn) {
      const dropdown = copyBtn.closest('.table-dropdown');
      if (dropdown) {
        document.querySelectorAll('.table-dropdown.open').forEach((el) => {
          if (el !== dropdown) el.classList.remove('open');
        });
        dropdown.classList.toggle('open');
        e.stopPropagation();
      }
      return;
    }

    const dropdownItem = target.closest('.table-dropdown-menu button[data-action]');
    if (dropdownItem) {
      const action = dropdownItem.getAttribute('data-action');
      const tableHtml = decodeURIComponent(dropdownItem.getAttribute('data-table') || '');

      if (tableHtml) {
        // DOMParser is safer than innerHTML for parsing trusted internal HTML
        const doc = new DOMParser().parseFromString(tableHtml, 'text/html');
        const table = doc.querySelector('table');

        if (table) {
          const dropdown = dropdownItem.closest('.table-dropdown');
          const copyBtnEl = dropdown?.querySelector('.table-copy-btn') as HTMLElement | null;

          switch (action) {
            case 'copy-csv':
              copyTableAsCsv(table).then(() => {
                if (copyBtnEl) showButtonFeedback(copyBtnEl);
              });
              break;
            case 'copy-markdown':
              copyTableAsMarkdown(table).then(() => {
                if (copyBtnEl) showButtonFeedback(copyBtnEl);
              });
              break;
            case 'copy-plain':
              copyTableAsPlain(table).then(() => {
                if (copyBtnEl) showButtonFeedback(copyBtnEl);
              });
              break;
            case 'download-csv':
              downloadTableAsCsv(table);
              break;
            case 'download-markdown':
              downloadTableAsMarkdown(table);
              break;
          }
        }
      }

      closeAllDropdowns();
      return;
    }

    const fullscreenBtn = target.closest('.table-fullscreen-btn');
    if (fullscreenBtn) {
      const wrapper = fullscreenBtn.closest('.table-wrapper');
      if (wrapper) {
        wrapper.classList.toggle('fullscreen');
        const btn = fullscreenBtn as HTMLElement;
        const isFullscreen = wrapper.classList.contains('fullscreen');
        btn.setAttribute('title', isFullscreen ? 'Exit fullscreen' : 'Fullscreen');
      }
      return;
    }

    const expandAllBtn = target.closest('.table-expand-all-btn');
    if (expandAllBtn) {
      const wrapper = expandAllBtn.closest('.table-wrapper');
      if (wrapper) {
        const cells = wrapper.querySelectorAll('.md-expandable-cell');
        const btn = expandAllBtn as HTMLElement;
        const isExpanded = wrapper.classList.contains('all-expanded');

        cells.forEach((cell) => cell.classList.toggle('expanded', !isExpanded));
        wrapper.classList.toggle('all-expanded', !isExpanded);
        btn.setAttribute('title', isExpanded ? 'Expand all cells' : 'Collapse all cells');

        btn.querySelector('.expand-icon')?.classList.toggle('hidden', !isExpanded);
        btn.querySelector('.collapse-icon')?.classList.toggle('hidden', isExpanded);
      }
      return;
    }

    if (!target.closest('.table-dropdown')) {
      closeAllDropdowns();
    }
  }, []);

  const handleTableExpand = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const cell = target.closest('.md-expandable-cell');
    if (cell) {
      cell.classList.toggle('expanded');
    }
  }, []);

  const handleLinkClick = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href) return;

      if (href.startsWith('http://') || href.startsWith('https://')) return;

      if (href.startsWith('#')) {
        e.preventDefault();
        const targetId = href.substring(1);
        const host = bubbleRef.current;
        if (host) {
          const targetElement = host.querySelector(`[id="${targetId}"]`);
          if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetElement.classList.add('footnote-active');
            setTimeout(() => targetElement.classList.remove('footnote-active'), 2500);
          }
        }
        return;
      }

      e.preventDefault();
    },
    [bubbleRef]
  );

  const handleMdImageActions = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;

    const copyBtn = target.closest('.md-image-copy-btn');
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const src = (copyBtn as HTMLElement).dataset.src;
      if (src) {
        copyImageToClipboard(src).then((ok) => {
          if (ok) {
            copyBtn.setAttribute('data-state', 'success');
            setTimeout(() => copyBtn.removeAttribute('data-state'), 1500);
          }
        });
      }
      return;
    }

    const downloadBtn = target.closest('.md-image-download-btn');
    if (downloadBtn) {
      e.preventDefault();
      e.stopPropagation();
      const src = (downloadBtn as HTMLElement).dataset.src;
      if (src) {
        downloadBtn.setAttribute('data-state', 'success');
        const link = document.createElement('a');
        link.href = src;
        link.download = `image-${Date.now()}.${src.split('.').pop()?.split('?')[0] || 'png'}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => downloadBtn.removeAttribute('data-state'), 1500);
      }
    }
  }, []);

  useEffect(() => {
    const ref = bubbleRef.current;
    if (!ref) return;

    ref.addEventListener('click', handleCopyCode);
    ref.addEventListener('click', handleTableActions);
    ref.addEventListener('click', handleTableExpand);
    ref.addEventListener('click', handleLinkClick);
    ref.addEventListener('click', handleMdImageActions);

    return () => {
      ref.removeEventListener('click', handleCopyCode);
      ref.removeEventListener('click', handleTableActions);
      ref.removeEventListener('click', handleTableExpand);
      ref.removeEventListener('click', handleLinkClick);
      ref.removeEventListener('click', handleMdImageActions);
    };
  }, [handleCopyCode, handleTableActions, handleTableExpand, handleLinkClick, handleMdImageActions]);
}

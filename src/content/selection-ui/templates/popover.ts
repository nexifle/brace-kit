/**
 * Popover templates for selection-ui
 */

import { html, type TemplateResult } from 'lit-html';
import type { QuickAction, SelectionPosition } from '../types.ts';
import { QUICK_ACTIONS } from '../constants.ts';
import { loadingSpinnerTemplate, errorTemplate } from './shared.ts';

// === Types ===

export type PopoverViewState =
  | { type: 'loading' }
  | { type: 'content'; content: string }
  | { type: 'error'; message: string };

export interface PopoverState {
  action: QuickAction['id'];
  position: SelectionPosition;
  isEditable: boolean;
  viewState: PopoverViewState;
  copyButtonText: string;
}

export interface PopoverCallbacks {
  onClose: () => void;
  onRegenerate: () => void;
  onCopy: () => void;
  onApply: () => void;
}

// === Main Template ===

/**
 * Popover template with ARIA attributes for accessibility
 */
export function popoverTemplate(
  state: PopoverState,
  callbacks: PopoverCallbacks
): TemplateResult {
  const actionConfig = QUICK_ACTIONS.find(a => a.id === state.action);
  const actionLabel = actionConfig?.label || 'AI Result';
  const actionIcon = actionConfig?.icon || '✨';

  return html`
    <div
      class="bk-popover"
      style="top: ${state.position.top}px; left: ${state.position.left}px; z-index: 2147483647;"
      role="dialog"
      aria-label="${actionLabel} result"
      aria-modal="true"
    >
      <div class="bk-popover-header">
        <div class="bk-popover-title">
          <span aria-hidden="true">${actionIcon}</span>
          <span>${actionLabel}</span>
        </div>
        <button
          class="bk-popover-close"
          aria-label="Close ${actionLabel}"
          @click=${callbacks.onClose}
        >
          ×
        </button>
      </div>
      <div class="bk-popover-content" role="region" aria-live="polite">
        ${viewStateTemplate(state.viewState)}
      </div>
      <div class="bk-popover-actions" role="group" aria-label="Actions">
        <button
          class="bk-btn bk-btn-secondary"
          aria-label="Regenerate ${actionLabel}"
          @click=${callbacks.onRegenerate}
        >
          <span aria-hidden="true">🔄</span> Regenerate
        </button>
        <button
          class="bk-btn bk-btn-ghost"
          aria-label="Copy to clipboard"
          @click=${callbacks.onCopy}
        >
          ${state.copyButtonText}
        </button>
        ${state.isEditable
          ? html`
              <button
                class="bk-btn bk-btn-primary"
                aria-label="Apply to text field"
                @click=${callbacks.onApply}
              >
                <span aria-hidden="true">✓</span> Apply
              </button>
            `
          : ''}
      </div>
    </div>
  `;
}

// === Sub-Templates ===

function viewStateTemplate(viewState: PopoverViewState): TemplateResult {
  switch (viewState.type) {
    case 'loading':
      return loadingSpinnerTemplate();
    case 'content':
      return html`<div class="bk-result">${viewState.content}</div>`;
    case 'error':
      return errorTemplate(viewState.message);
    default:
      return html``;
  }
}

/**
 * Popover templates for selection-ui
 * Redesigned with refined professional minimal aesthetic
 */

import { html, type TemplateResult } from 'lit-html';
import type { QuickAction, SelectionPosition } from '../types.ts';
import { QUICK_ACTIONS } from '../constants.ts';
import { loadingSpinnerTemplate, errorTemplate, icons } from './shared.ts';

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
  isCopied: boolean;
}

export interface PopoverCallbacks {
  onClose: () => void;
  onRegenerate: () => void;
  onCopy: () => void;
  onApply: () => void;
}

// === Icon Mapping ===

function getActionIcon(actionId: QuickAction['id']): TemplateResult {
  switch (actionId) {
    case 'summarize':
      return icons.summarize;
    case 'explain':
      return icons.explain;
    case 'translate':
      return icons.translate;
    case 'rephrase':
      return icons.rephrase;
    default:
      return icons.summarize;
  }
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

  return html`
    <div
      class="bk-popover"
      style="top: ${state.position.top}px; left: ${state.position.left}px; z-index: 2147483647;"
      role="dialog"
      aria-label="${actionLabel} result"
      aria-modal="true"
    >
      <!-- Header -->
      <div class="bk-popover-header">
        <div class="bk-popover-title">
          <span class="bk-icon" aria-hidden="true">
            ${getActionIcon(state.action)}
          </span>
          <span>${actionLabel}</span>
        </div>
        <button
          class="bk-popover-close"
          aria-label="Close ${actionLabel}"
          @click=${callbacks.onClose}
        >
          ${icons.close}
        </button>
      </div>

      <!-- Content -->
      <div class="bk-popover-content" role="region" aria-live="polite">
        ${viewStateTemplate(state.viewState)}
      </div>

      <!-- Actions -->
      <div class="bk-popover-actions" role="group" aria-label="Actions">
        <button
          class="bk-btn bk-btn-secondary"
          aria-label="Regenerate ${actionLabel}"
          ?disabled=${state.viewState.type === 'loading'}
          @click=${callbacks.onRegenerate}
        >
          ${icons.regenerate}
          <span>Regenerate</span>
        </button>
        <button
          class="bk-btn bk-btn-ghost"
          data-copied=${state.isCopied}
          aria-label="Copy to clipboard"
          ?disabled=${state.viewState.type === 'loading'}
          @click=${callbacks.onCopy}
        >
          ${state.isCopied ? icons.check : icons.copy}
          <span>${state.copyButtonText}</span>
        </button>
        ${state.isEditable && state.viewState.type === 'content'
          ? html`
              <button
                class="bk-btn bk-btn-primary"
                aria-label="Apply to text field"
                @click=${callbacks.onApply}
              >
                ${icons.apply}
                <span>Apply</span>
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
      return html`
        <div class="bk-result">${viewState.content}</div>
      `;
    case 'error':
      return errorTemplate(viewState.message);
    default:
      return html``;
  }
}

/**
 * Toolbar templates for selection-ui
 */

import { html, type TemplateResult } from 'lit-html';
import type { QuickAction, SelectionPosition } from '../types.ts';
import { QUICK_ACTIONS, TRANSLATION_TARGETS } from '../constants.ts';
import { logoSvgTemplate } from './shared.ts';

// === Types ===

export interface ToolbarState {
  isExpanded: boolean;
  isTranslateMode: boolean;
  selectedLang: string;
  position: SelectionPosition;
}

export interface ToolbarCallbacks {
  onIconClick: (e: Event) => void;
  onActionClick: (e: Event, actionId: QuickAction['id']) => void;
  onTranslateClick: (e: Event) => void;
  onBackClick: (e: Event) => void;
  onLangChange: (e: Event) => void;
  onGoClick: (e: Event) => void;
}

// === Main Template ===

/**
 * Toolbar template with ARIA attributes for accessibility
 */
export function toolbarTemplate(
  state: ToolbarState,
  callbacks: ToolbarCallbacks
): TemplateResult {
  return html`
    <div
      class="bk-toolbar"
      data-placement=${state.position.placement}
      style="top: ${state.position.top}px; left: ${state.position.left}px;"
      role="toolbar"
      aria-label="BraceKit AI Actions"
    >
      <div class="bk-toolbar-arrow" aria-hidden="true"></div>
      ${!state.isExpanded
        ? iconButtonTemplate(callbacks.onIconClick)
        : actionsContainerTemplate(state, callbacks)}
    </div>
  `;
}

// === Sub-Templates ===

function iconButtonTemplate(onClick: (e: Event) => void): TemplateResult {
  return html`
    <button
      class="bk-icon-btn"
      title="BraceKit AI"
      aria-label="Open BraceKit AI actions"
      aria-expanded="false"
      @click=${onClick}
    >
      ${logoSvgTemplate}
    </button>
  `;
}

function actionsContainerTemplate(
  state: ToolbarState,
  callbacks: ToolbarCallbacks
): TemplateResult {
  return html`
    <div class="bk-actions-container" role="group" aria-label="AI actions">
      ${QUICK_ACTIONS.map((action, index) =>
        actionButtonTemplate(action, index, state, callbacks)
      )}
      ${languageSelectorTemplate(state.isTranslateMode, state.selectedLang, callbacks)}
    </div>
  `;
}

function actionButtonTemplate(
  action: QuickAction,
  index: number,
  state: ToolbarState,
  callbacks: ToolbarCallbacks
): TemplateResult {
  const { isTranslateMode } = state;

  // In translate mode, hide all buttons except translate
  if (isTranslateMode && action.id !== 'translate') {
    return html``;
  }

  // Translate button behavior depends on mode
  if (action.id === 'translate') {
    if (isTranslateMode) {
      // In translate mode: show as disabled indicator
      return html`
        <button
          class="bk-action-btn"
          style="opacity: 0.6; cursor: default;"
          disabled
          aria-disabled="true"
          aria-label="${action.label} (selected)"
        >
          <span class="bk-icon" aria-hidden="true">${action.icon}</span>
          <span>${action.label}</span>
        </button>
      `;
    } else {
      // Normal mode: clickable to enter translate mode
      return html`
        <button
          class="bk-action-btn"
          aria-label="${action.label} selected text"
          @click=${callbacks.onTranslateClick}
        >
          <span class="bk-icon" aria-hidden="true">${action.icon}</span>
          <span>${action.label}</span>
        </button>
      `;
    }
  }

  // Normal mode: show other action buttons (Summarize, Explain, Rephrase)
  // Add divider after Explain (index 1)
  const isAfterDivider = index === 1;

  return html`
    <button
      class="bk-action-btn"
      aria-label="${action.label} selected text"
      @click=${(e: Event) => callbacks.onActionClick(e, action.id)}
    >
      <span class="bk-icon" aria-hidden="true">${action.icon}</span>
      <span>${action.label}</span>
    </button>
    ${isAfterDivider ? html`<div class="bk-divider" aria-hidden="true"></div>` : ''}
  `;
}

function languageSelectorTemplate(
  isTranslateMode: boolean,
  selectedLang: string,
  callbacks: ToolbarCallbacks
): TemplateResult {
  if (!isTranslateMode) {
    return html``;
  }

  return html`
    <div
      class="bk-lang-container"
      style="display: flex;"
      role="group"
      aria-label="Language selection"
    >
      <button
        class="bk-btn bk-btn-ghost"
        title="Back to actions"
        aria-label="Back to actions"
        @click=${callbacks.onBackClick}
      >
        ←
      </button>
      <label class="sr-only" for="bk-lang-select">Target language</label>
      <select
        id="bk-lang-select"
        class="bk-lang-select"
        aria-label="Select target language"
        @change=${callbacks.onLangChange}
        @click=${(e: Event) => e.stopPropagation()}
      >
        ${TRANSLATION_TARGETS.map(lang => html`
          <option value=${lang} ?selected=${lang === selectedLang}>${lang}</option>
        `)}
      </select>
      <button
        class="bk-btn bk-btn-primary"
        aria-label="Translate to ${selectedLang}"
        @click=${callbacks.onGoClick}
      >
        Go
      </button>
    </div>
  `;
}

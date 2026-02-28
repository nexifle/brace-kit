/**
 * Toolbar templates for selection-ui
 * Scalable design with primary actions + dropdown menu for additional options
 */

import { html, type TemplateResult } from 'lit-html';
import type { QuickAction, SelectionPosition, MenuState } from '../types.ts';
import { QUICK_ACTIONS, TRANSLATION_TARGETS, MAX_PRIMARY_ACTIONS, ACTION_CATEGORIES } from '../constants.ts';
import { logoSvgTemplate, icons } from './shared.ts';

// === Types ===

export interface ToolbarState {
  isExpanded: boolean;
  isTranslateMode: boolean;
  selectedLang: string;
  position: SelectionPosition;
  menuState: MenuState;
  providerState: {
    isOpen: boolean;
    currentProvider: string;
    currentModel: string;
    providers: { id: string; name: string; models: string[] }[];
  };
}

export interface ToolbarCallbacks {
  onIconClick: (e: Event) => void;
  onActionClick: (e: Event, actionId: QuickAction['id']) => void;
  onTranslateClick: (e: Event) => void;
  onBackClick: (e: Event) => void;
  onLangChange: (e: Event) => void;
  onGoClick: (e: Event) => void;
  onMenuToggle: (e: Event) => void;
  onMenuClose: (e?: Event) => void;
  onProviderMenuToggle: (e: Event) => void;
  onProviderMenuClose: (e?: Event) => void;
  onModelSelect: (e: Event, providerId: string, model: string) => void;
}

// === Icon Mapping ===

function getActionIcon(iconName: string): TemplateResult {
  const icon = icons[iconName as keyof typeof icons];
  return icon || icons.summarize;
}

// === Derived Data ===

function getPrimaryActions(): QuickAction[] {
  return QUICK_ACTIONS.filter(a => a.isPrimary !== false).slice(0, MAX_PRIMARY_ACTIONS);
}

function getSecondaryActions(): QuickAction[] {
  return QUICK_ACTIONS.filter(a => a.isPrimary === false);
}

function hasSecondaryActions(): boolean {
  return getSecondaryActions().length > 0;
}

function groupActionsByCategory(actions: QuickAction[]): Map<string, QuickAction[]> {
  const groups = new Map<string, QuickAction[]>();
  for (const action of actions) {
    const category = action.category || 'other';
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category)!.push(action);
  }
  // Sort by category order
  return new Map(
    [...groups.entries()].sort((a, b) => {
      const orderA = ACTION_CATEGORIES[a[0]]?.order ?? 999;
      const orderB = ACTION_CATEGORIES[b[0]]?.order ?? 999;
      return orderA - orderB;
    })
  );
}

// === Main Template ===

/**
 * Toolbar template with ARIA attributes for accessibility
 */
export function toolbarTemplate(
  state: ToolbarState,
  callbacks: ToolbarCallbacks
): TemplateResult {
  // FAB state - no toolbar wrapper, just the button
  if (!state.isExpanded) {
    return html`
      <div
        class="bk-fab-container"
        style="position: absolute; top: ${state.position.top}px; left: ${state.position.left}px;"
        role="toolbar"
        aria-label="BraceKit AI Actions"
      >
        ${fabTemplate(callbacks.onIconClick)}
      </div>
    `;
  }

  // Expanded toolbar with actions
  return html`
    <div
      class="bk-toolbar"
      data-placement=${state.position.placement}
      style="top: ${state.position.top}px; left: ${state.position.left}px;"
      role="toolbar"
      aria-label="BraceKit AI Actions"
    >
      <div class="bk-toolbar-arrow" aria-hidden="true"></div>
      ${actionsContainerTemplate(state, callbacks)}
    </div>
  `;
}

// === Sub-Templates ===

/**
 * Floating Action Button (initial collapsed state)
 */
function fabTemplate(onClick: (e: Event) => void): TemplateResult {
  return html`
    <button
      class="bk-fab"
      title="BraceKit AI"
      aria-label="Open BraceKit AI actions"
      aria-expanded="false"
      @click=${onClick}
    >
      ${logoSvgTemplate}
    </button>
  `;
}

/**
 * Actions container with primary buttons and optional more menu
 */
function actionsContainerTemplate(
  state: ToolbarState,
  callbacks: ToolbarCallbacks
): TemplateResult {
  if (state.isTranslateMode) {
    return translateModeTemplate(state, callbacks);
  }

  const primaryActions = getPrimaryActions();
  const showMoreButton = hasSecondaryActions();

  return html`
    <div class="bk-actions-container" role="group" aria-label="AI actions">
      <div class="bk-toolbar-header" style="position: relative;">
        ${providerSelectorTemplate(state, callbacks)}
        ${showMoreButton ? moreButtonTemplate(state, callbacks) : ''}
        ${state.menuState.isOpen ? menuOverlayTemplate(state, callbacks) : ''}
        ${state.providerState.isOpen ? providerMenuOverlayTemplate(state, callbacks) : ''}
      </div>
      <div class="bk-divider-horizontal" aria-hidden="true"></div>
      <div class="bk-actions-grid">
        ${primaryActions.map((action) =>
    actionButtonTemplate(action, callbacks)
  )}
      </div>
    </div>
  `;
}

/**
 * Provider and model selector button
 */
function providerSelectorTemplate(
  state: ToolbarState,
  callbacks: ToolbarCallbacks
): TemplateResult {
  const currentProviderObj = state.providerState.providers.find(p => p.id === state.providerState.currentProvider);

  if (!currentProviderObj && state.providerState.providers.length === 0) {
    return html`
    <button class="bk-action-btn bk-model-selector-btn" disabled>
      <span class="bk-label">Loading...</span>
    </button>
    `;
  }

  const providerName = currentProviderObj?.name || state.providerState.currentProvider;
  const modelName = state.providerState.currentModel || 'Default';
  const displayText = `${providerName}: ${modelName}`;

  return html`
    <button
      class="bk-action-btn bk-model-selector-btn"
      aria-label="Select AI Model"
      aria-expanded=${state.providerState.isOpen}
      aria-haspopup="menu"
      title="${displayText}"
      @click=${callbacks.onProviderMenuToggle}
    >
      <span class="bk-label">${displayText}</span>
      <span class="bk-chevron" aria-hidden="true">${icons.chevronDown}</span>
    </button>
  `;
}

/**
 * Translate mode with language selector
 */
function translateModeTemplate(
  state: ToolbarState,
  callbacks: ToolbarCallbacks
): TemplateResult {
  return html`
    <div class="bk-actions-container" role="group" aria-label="Translate mode">
      <button
        class="bk-action-btn"
        data-primary="true"
        disabled
        aria-disabled="true"
        aria-label="Translate (selected)"
      >
        <span class="bk-icon" aria-hidden="true">${getActionIcon('translate')}</span>
        <span class="bk-label">Translate</span>
      </button>
      <div class="bk-lang-container" data-visible="true">
        <button
          class="bk-back-btn"
          title="Back to actions"
          aria-label="Back to actions"
          @click=${callbacks.onBackClick}
        >
          ${icons.back}
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
            <option value=${lang} ?selected=${lang === state.selectedLang}>${lang}</option>
          `)}
        </select>
        <button
          class="bk-btn bk-btn-primary"
          aria-label="Translate to ${state.selectedLang}"
          @click=${callbacks.onGoClick}
        >
          ${icons.check}
          <span>Go</span>
        </button>
      </div>
    </div>
  `;
}

/**
 * Individual action button with icon and label
 */
function actionButtonTemplate(
  action: QuickAction,
  callbacks: ToolbarCallbacks
): TemplateResult {
  // Translate button has special behavior
  if (action.id === 'translate') {
    return html`
      <button
        class="bk-action-btn"
        aria-label="${action.label} selected text"
        @click=${callbacks.onTranslateClick}
      >
        <span class="bk-icon" aria-hidden="true">${getActionIcon(action.icon)}</span>
        <span class="bk-label">${action.label}</span>
      </button>
    `;
  }

  return html`
    <button
      class="bk-action-btn"
      aria-label="${action.label} selected text"
      @click=${(e: Event) => callbacks.onActionClick(e, action.id)}
    >
      <span class="bk-icon" aria-hidden="true">${getActionIcon(action.icon)}</span>
      <span class="bk-label">${action.label}</span>
    </button>
  `;
}

/**
 * "More" button to open dropdown menu
 */
function moreButtonTemplate(
  state: ToolbarState,
  callbacks: ToolbarCallbacks
): TemplateResult {
  return html`
    <button
      class="bk-action-btn bk-more-btn"
      aria-label="More actions"
      aria-expanded=${state.menuState.isOpen}
      aria-haspopup="menu"
      @click=${callbacks.onMenuToggle}
    >
      <span class="bk-icon" aria-hidden="true">${icons.more}</span>
      <span class="bk-label">More</span>
      <span class="bk-chevron" aria-hidden="true">${icons.chevronDown}</span>
    </button>
  `;
}

/**
 * Menu overlay with dropdown content
 */
function menuOverlayTemplate(
  _state: ToolbarState,
  callbacks: ToolbarCallbacks
): TemplateResult {
  const secondaryActions = getSecondaryActions();
  const groupedActions = groupActionsByCategory(secondaryActions);

  return html`
    <div class="bk-menu-overlay" @click=${callbacks.onMenuClose} aria-hidden="true"></div>
    <div
      class="bk-menu"
      role="menu"
      aria-label="More actions"
      style="top: 36px; right: 0; left: auto;"
      @click=${(e: Event) => e.stopPropagation()}
    >
      <div class="bk-menu-content">
        ${Array.from(groupedActions.entries()).map(([category, actions]) =>
    menuCategoryTemplate(category, actions, callbacks)
  )}
      </div>
    </div>
  `;
}

/**
 * Provider & Model Menu overlay
 */
function providerMenuOverlayTemplate(
  state: ToolbarState,
  callbacks: ToolbarCallbacks
): TemplateResult {
  return html`
    <div class="bk-menu-overlay" @click=${callbacks.onProviderMenuClose} aria-hidden="true"></div>
    <div
      class="bk-menu bk-provider-menu"
      role="menu"
      aria-label="Select Model"
      style="top: 36px; left: 0;"
      @click=${(e: Event) => e.stopPropagation()}
    >
      <div class="bk-menu-content">
        ${state.providerState.providers.map(provider =>
    provider.models.length > 0 ? html`
            <div class="bk-menu-category">
              <div class="bk-menu-category-label">${provider.name}</div>
              ${provider.models.map(model => html`
                <button
                  class="bk-menu-item bk-model-item"
                  role="menuitem"
                  title="${model}"
                  aria-label="${model}"
                  @click=${(e: Event) => {
        e.stopPropagation();
        callbacks.onModelSelect(e, provider.id, model);
      }}
                >
                  <span class="bk-menu-item-icon" style="visibility: ${state.providerState.currentProvider === provider.id && state.providerState.currentModel === model ? 'visible' : 'hidden'}">
                    ${icons.check}
                  </span>
                  <span class="bk-menu-item-label">${model}</span>
                </button>
              `)}
            </div>
          ` : ''
  )}
      </div>
    </div>
  `;
}

/**
 * Menu category section
 */
function menuCategoryTemplate(
  category: string,
  actions: QuickAction[],
  callbacks: ToolbarCallbacks
): TemplateResult {
  const categoryInfo = ACTION_CATEGORIES[category] || { label: category, order: 999 };

  return html`
    <div class="bk-menu-category">
      <div class="bk-menu-category-label">${categoryInfo.label}</div>
      ${actions.map(action => menuItemTemplate(action, callbacks))}
    </div>
  `;
}

/**
 * Individual menu item
 */
function menuItemTemplate(
  action: QuickAction,
  callbacks: ToolbarCallbacks
): TemplateResult {
  return html`
    <button
      class="bk-menu-item"
      role="menuitem"
      aria-label="${action.label} selected text"
      @click=${(e: Event) => {
      e.stopPropagation();
      callbacks.onActionClick(e, action.id);
      callbacks.onMenuClose();
    }}
    >
      <span class="bk-menu-item-icon" aria-hidden="true">
        ${getActionIcon(action.icon)}
      </span>
      <span class="bk-menu-item-label">${action.label}</span>
      ${action.shortcut ? html`
        <span class="bk-menu-item-shortcut">${action.shortcut}</span>
      ` : ''}
    </button>
  `;
}

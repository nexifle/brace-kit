/**
 * Toolbar templates for selection-ui
 * Scalable design with primary actions + dropdown menu for additional options
 */

import { html, type TemplateResult } from 'lit-html';
import fuzzysort from 'fuzzysort';
import type { QuickAction, SelectionPosition, MenuState } from '../types.ts';
import { TRANSLATION_TARGETS, ACTION_CATEGORIES } from '../constants.ts';
import { logoSvgTemplate, icons } from './shared.ts';
import { PROVIDER_BRANDS, CUSTOM_BRAND } from '../../../components/settings/providerBrands.ts';
import { fuzzyFilter } from '../../../utils/fuzzySearch.ts';

// === Types ===

export interface ToolbarProvider {
  id: string;
  name: string;
  models: string[];
}

export interface ProviderMenuGroup {
  provider: ToolbarProvider;
  models: string[];
}

export interface ProviderModelRow {
  providerId: string;
  providerName: string;
  model: string;
}

export interface ProviderMenuView {
  /** Groups in render order (active provider pinned first while searching). */
  groups: ProviderMenuGroup[];
  /** Flattened rows — the exact keyboard-navigation target list. */
  rows: ProviderModelRow[];
}

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
    providers: ToolbarProvider[];
    search: string;
    /** Provider whose models are visible in collapsed (accordion) mode. */
    expandedProviderId: string | null;
    /** Keyboard-navigation cursor over the flattened visible model rows. */
    highlightIndex: number;
    /** Flip the popover right-aligned when the toolbar sits near the viewport edge. */
    menuAlignRight: boolean;
    /** Render the popover above the toolbar when it would overflow the bottom. */
    menuAbove: boolean;
  };
  actions: QuickAction[];
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
  onProviderSearchInput: (e: Event) => void;
  onProviderSearchClear: (e: Event) => void;
  onProviderToggle: (e: Event, providerId: string) => void;
  onProviderMenuKeydown: (e: Event) => void;
  onProviderMenuHover: (rowIndex: number) => void;
  onProviderMenuFocus: (rowIndex: number) => void;
  /** Pointer entered the results list — release keyboard claim so hover works again. */
  onProviderMenuEnter: () => void;
  onModelSelect: (e: Event, providerId: string, model: string) => void;
}

// === Icon Mapping ===

function getActionIcon(iconName: string): TemplateResult {
  const icon = icons[iconName as keyof typeof icons];
  return icon || icons.summarize;
}

// === Derived Data ===

function getPrimaryActions(actions: QuickAction[]): QuickAction[] {
  return actions.filter(a => a.isPrimary !== false);
}

function getSecondaryActions(actions: QuickAction[]): QuickAction[] {
  return actions.filter(a => a.isPrimary === false);
}

function hasSecondaryActions(actions: QuickAction[]): boolean {
  return getSecondaryActions(actions).length > 0;
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

// === Provider & Model Selection ===

function providerBrand(providerId: string): { color: string; fg: string } {
  return PROVIDER_BRANDS[providerId] ?? CUSTOM_BRAND;
}

function providerMonogram(name: string): string {
  return name.charAt(0).toUpperCase();
}

/**
 * Whether a query matches a provider NAME. Mirrors fuzzyFilter semantics:
 * short queries (≤2 chars) use strict substring, longer ones use fuzzy
 * subsequence matching ("oai" → OpenAI).
 */
function providerNameMatches(query: string, name: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (q.length <= 2) return name.toLowerCase().includes(q);
  return fuzzysort.single(query.trim(), name) !== null;
}

/**
 * Compute the provider menu's visible content. Single source of truth shared
 * by the template (render) and the keyboard handler (navigation).
 *
 * - Empty query → accordion: only the expanded provider's models are visible.
 * - Non-empty query → fuzzy search across every provider; a provider-name
 *   match expands to that provider's full model list; the active provider is
 *   pinned to the top. Collapse is bypassed so results are never hidden.
 */
export function getProviderMenuView(state: ToolbarState): ProviderMenuView {
  const { providers, search, currentProvider, expandedProviderId } = state.providerState;
  const q = search.trim();

  if (q) {
    const groups: ProviderMenuGroup[] = providers
      .map((provider) => ({
        provider,
        models: providerNameMatches(q, provider.name)
          ? provider.models.slice()
          : fuzzyFilter(provider.models, q),
      }))
      .filter((g) => g.models.length > 0);

    const pinned: ProviderMenuGroup[] = [];
    const rest: ProviderMenuGroup[] = [];
    for (const g of groups) {
      (g.provider.id === currentProvider ? pinned : rest).push(g);
    }
    const sorted = [...pinned, ...rest];
    return { groups: sorted, rows: flattenRows(sorted) };
  }

  const expanded = expandedProviderId
    ? providers.find((p) => p.id === expandedProviderId)
    : undefined;
  const groups = expanded ? [{ provider: expanded, models: expanded.models }] : [];
  return { groups, rows: flattenRows(groups) };
}

function flattenRows(groups: ProviderMenuGroup[]): ProviderModelRow[] {
  const rows: ProviderModelRow[] = [];
  for (const g of groups) {
    for (const model of g.models) {
      rows.push({ providerId: g.provider.id, providerName: g.provider.name, model });
    }
  }
  return rows;
}

/**
 * Highlight the fuzzy-matched characters of a model id with <mark>.
 * Returns a lit-html TemplateResult with the raw text escaped by lit-html
 * (no unsafeHTML) — matches are wrapped in a styled mark element.
 */
function highlightModel(text: string, query: string): TemplateResult {
  const q = query.trim();
  if (!q) return html`${text}`;
  const result = fuzzysort.single(q, text);
  if (!result || result.indexes.length === 0) return html`${text}`;

  const parts: TemplateResult[] = [];
  let last = 0;
  for (const idx of result.indexes) {
    if (idx > last) parts.push(html`${text.slice(last, idx)}`);
    parts.push(html`<mark class="bk-fuzzy-hl">${text[idx]}</mark>`);
    last = idx + 1;
  }
  if (last < text.length) parts.push(html`${text.slice(last)}`);
  return html`${parts}`;
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

  const primaryActions = getPrimaryActions(state.actions);
  const showMoreButton = hasSecondaryActions(state.actions);

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
  const brand = providerBrand(state.providerState.currentProvider);

  return html`
    <button
      class="bk-action-btn bk-model-selector-btn"
      aria-label="Select AI Model"
      aria-expanded=${state.providerState.isOpen}
      aria-haspopup="dialog"
      title="${displayText}"
      @click=${callbacks.onProviderMenuToggle}
    >
      <span class="bk-provider-chip" style="background: ${brand.color}; color: ${brand.fg};" aria-hidden="true">${providerMonogram(providerName)}</span>
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
  state: ToolbarState,
  callbacks: ToolbarCallbacks
): TemplateResult {
  const secondaryActions = getSecondaryActions(state.actions);
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
 * Provider & Model Menu — searchable, collapsible model picker.
 *
 * Header: title + provider/model counts, fuzzy search input (with clear).
 * Body: accordion of collapsible providers (active one expanded by default) —
 * typing switches to a fuzzy result list grouped by provider, active provider
 * pinned first, matched characters highlighted.
 * Footer: keyboard hints + live result count.
 */
function providerMenuOverlayTemplate(
  state: ToolbarState,
  callbacks: ToolbarCallbacks
): TemplateResult {
  const ps = state.providerState;
  const query = ps.search.trim();
  const { groups, rows } = getProviderMenuView(state);
  const totalModels = ps.providers.reduce((n, p) => n + p.models.length, 0);

  return html`
    <div class="bk-menu-overlay" @click=${callbacks.onProviderMenuClose} aria-hidden="true"></div>
    <div
      class="bk-menu bk-provider-menu"
      role="dialog"
      aria-label="Select model"
      style="${ps.menuAbove ? 'bottom: 38px; top: auto;' : 'top: 36px;'} ${ps.menuAlignRight ? 'right: 0; left: auto;' : 'left: 0;'}"
      @click=${(e: Event) => e.stopPropagation()}
    >
      <div class="bk-provider-menu-head">
        <div class="bk-provider-menu-title">
          <span>Select model</span>
          <span class="bk-provider-menu-count">${ps.providers.length} providers · ${totalModels} models</span>
        </div>
        <div class="bk-provider-search">
          <span class="bk-provider-search-icon" aria-hidden="true">${icons.search}</span>
          <input
            class="bk-provider-search-input"
            type="text"
            placeholder="Search models…"
            aria-label="Search models"
            autocomplete="off"
            spellcheck="false"
            .value=${ps.search}
            @input=${callbacks.onProviderSearchInput}
            @keydown=${callbacks.onProviderMenuKeydown}
          />
          ${ps.search ? html`
            <button
              class="bk-provider-search-clear"
              aria-label="Clear search"
              @click=${callbacks.onProviderSearchClear}
              @mousedown=${(e: Event) => e.preventDefault()}
            >${icons.close}</button>
          ` : ''}
        </div>
      </div>
      <div class="bk-menu-content bk-provider-menu-content" @keydown=${callbacks.onProviderMenuKeydown} @mouseenter=${() => callbacks.onProviderMenuEnter()}>
        ${query
      ? (() => {
        let running = 0;
        return groups.map((group) => {
          const out = providerSearchGroupTemplate(group, state, callbacks, query, running);
          running += group.models.length;
          return out;
        });
      })()
      : ps.providers.filter((p) => p.models.length > 0).map((provider) => providerSectionTemplate(provider, state, callbacks))}
        ${query && rows.length === 0 ? providerEmptyTemplate() : ''}
      </div>
      <div class="bk-provider-menu-footer">
        <span class="bk-kbd" aria-hidden="true">↑↓</span><span class="bk-kbd-hint">Navigate</span>
        <span class="bk-kbd" aria-hidden="true">↵</span><span class="bk-kbd-hint">Select</span>
        <span class="bk-kbd" aria-hidden="true">esc</span><span class="bk-kbd-hint">Close</span>
        ${rows.length > 0 ? html`<span class="bk-provider-menu-results">${rows.length} result${rows.length === 1 ? '' : 's'}</span>` : ''}
      </div>
    </div>
  `;
}

/**
 * Collapsible provider section (accordion). Only one provider is expanded at a
 * time; the header shows the brand monogram, provider name and model count.
 */
function providerSectionTemplate(
  provider: ToolbarProvider,
  state: ToolbarState,
  callbacks: ToolbarCallbacks
): TemplateResult {
  const ps = state.providerState;
  const isExpanded = ps.expandedProviderId === provider.id;
  const isActive = ps.currentProvider === provider.id;
  const brand = providerBrand(provider.id);

  return html`
    <div class="bk-provider-section ${isExpanded ? 'is-expanded' : ''} ${isActive ? 'is-active' : ''}">
      <button
        class="bk-provider-header"
        aria-expanded=${isExpanded}
        aria-label="${provider.name} — ${provider.models.length} model${provider.models.length === 1 ? '' : 's'}"
        @click=${(e: Event) => {
      e.stopPropagation();
      callbacks.onProviderToggle(e, provider.id);
    }}
      >
        <span class="bk-provider-monogram" style="background: ${brand.color}; color: ${brand.fg};" aria-hidden="true">${providerMonogram(provider.name)}</span>
        <span class="bk-provider-name">${provider.name}</span>
        <span class="bk-provider-meta">
          ${isActive ? html`<span class="bk-provider-current-dot" aria-hidden="true"></span>` : ''}
          <span class="bk-provider-model-count">${provider.models.length}</span>
          <span class="bk-provider-chevron" aria-hidden="true">${icons.chevronDown}</span>
        </span>
      </button>
      ${isExpanded ? html`
        <div class="bk-provider-models">
          ${provider.models.map((model) => modelRowTemplate(provider, model, state, callbacks, 0, ''))}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Search-result group: provider header (monogram + name + match count) followed
 * by every matching model row. Rows carry their flattened index for keyboard
 * navigation — `startIndex` offsets the running counter within the menu.
 */
function providerSearchGroupTemplate(
  group: ProviderMenuGroup,
  state: ToolbarState,
  callbacks: ToolbarCallbacks,
  query: string,
  startIndex = 0
): TemplateResult {
  const brand = providerBrand(group.provider.id);

  return html`
    <div class="bk-provider-section bk-search-group">
      <div class="bk-provider-search-head" aria-hidden="true">
        <span class="bk-provider-monogram" style="background: ${brand.color}; color: ${brand.fg};">${providerMonogram(group.provider.name)}</span>
        <span class="bk-provider-name">${group.provider.name}</span>
        <span class="bk-provider-model-count">${group.models.length}</span>
      </div>
      ${group.models.map((model, i) =>
    modelRowTemplate(group.provider, model, state, callbacks, startIndex + i, query)
  )}
    </div>
  `;
}

/**
 * Individual model row. `rowIndex` is the flattened position used by the
 * keyboard cursor; `query` drives the fuzzy highlight.
 */
function modelRowTemplate(
  provider: ToolbarProvider,
  model: string,
  state: ToolbarState,
  callbacks: ToolbarCallbacks,
  rowIndex: number,
  query: string
): TemplateResult {
  const ps = state.providerState;
  const isCurrent = ps.currentProvider === provider.id && ps.currentModel === model;
  const isHighlight = rowIndex === ps.highlightIndex;

  return html`
    <button
      class="bk-menu-item bk-model-item ${isCurrent ? 'bk-model-item--active' : ''} ${isHighlight ? 'bk-model-item--highlight' : ''}"
      aria-current=${isCurrent ? 'true' : 'false'}
      data-row-index=${rowIndex}
      title="${model}"
      aria-label="${model}"
      @click=${(e: Event) => {
      e.stopPropagation();
      callbacks.onModelSelect(e, provider.id, model);
    }}
      @mousemove=${(e: Event) => {
      if (isHighlight) return;
      e.stopPropagation();
      callbacks.onProviderMenuHover(rowIndex);
    }}
      @focus=${(e: Event) => {
      if (isHighlight) return;
      e.stopPropagation();
      callbacks.onProviderMenuFocus(rowIndex);
    }}
    >
      <span class="bk-menu-item-icon" aria-hidden="true">${isCurrent ? icons.check : ''}</span>
      <span class="bk-menu-item-label">${highlightModel(model, query)}</span>
    </button>
  `;
}

function providerEmptyTemplate(): TemplateResult {
  return html`
    <div class="bk-provider-empty">
      <span aria-hidden="true">${icons.search}</span>
      <div class="bk-provider-empty-title">No models match</div>
      <div class="bk-provider-empty-hint">Try a shorter query or check the provider settings.</div>
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

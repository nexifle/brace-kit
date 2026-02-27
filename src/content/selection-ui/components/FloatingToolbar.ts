/**
 * Floating Toolbar component for selection-ui
 * Creates and manages the floating toolbar using lit-html
 * Supports scalable actions with dropdown menu
 */

import { render } from 'lit-html';
import type { QuickAction, SelectionPosition } from '../types.ts';
import { toolbarTemplate, type ToolbarState, type ToolbarCallbacks } from '../templates/index.ts';

// === Types ===

export interface FloatingToolbarConfig {
  position: SelectionPosition;
  onActionClick: (action: QuickAction['id'], targetLang?: string) => void;
  onDismiss: () => void;
}

export interface FloatingToolbarAPI {
  element: HTMLElement;
  destroy: () => void;
}

// === Factory Function ===

/**
 * Create and render the floating toolbar using lit-html
 * Shows only icon initially, reveals actions on click
 */
export function createFloatingToolbar(
  shadow: ShadowRoot,
  config: FloatingToolbarConfig
): FloatingToolbarAPI {
  const { position, onActionClick, onDismiss } = config;

  // Create container for toolbar
  const container = document.createElement('div');
  container.className = 'bk-toolbar-container';
  shadow.appendChild(container);

  // State
  let state: ToolbarState = {
    isExpanded: false,
    isTranslateMode: false,
    selectedLang: 'English',
    position,
    menuState: { isOpen: false, selectedCategory: null },
  };

  // Track initial click target to avoid race condition with setTimeout
  let initialClickTarget: EventTarget | null = null;

  // Callbacks
  const callbacks: ToolbarCallbacks = {
    onIconClick: (e: Event) => {
      e.stopPropagation();
      initialClickTarget = e.target;
      state = { ...state, isExpanded: true };
      // Re-attach document click listener to catch clicks outside
      attachDocumentListeners();
      renderToolbar();
    },

    onActionClick: (e: Event, actionId: QuickAction['id']) => {
      e.stopPropagation();
      // Close menu if open
      state = { ...state, menuState: { isOpen: false, selectedCategory: null } };
      onActionClick(actionId);
    },

    onTranslateClick: (e: Event) => {
      e.stopPropagation();
      state = { ...state, isTranslateMode: true };
      renderToolbar();
    },

    onBackClick: (e: Event) => {
      e.stopPropagation();
      state = { ...state, isTranslateMode: false };
      renderToolbar();
    },

    onLangChange: (e: Event) => {
      const select = e.target as HTMLSelectElement;
      state = { ...state, selectedLang: select.value };
    },

    onGoClick: (e: Event) => {
      e.stopPropagation();
      onActionClick('translate', state.selectedLang);
    },

    onMenuToggle: (e: Event) => {
      e.stopPropagation();
      state = {
        ...state,
        menuState: {
          ...state.menuState,
          isOpen: !state.menuState.isOpen,
        },
      };
      renderToolbar();
    },

    onMenuClose: () => {
      state = {
        ...state,
        menuState: { isOpen: false, selectedCategory: null },
      };
      renderToolbar();
    },
  };

  // Render function
  function renderToolbar() {
    render(toolbarTemplate(state, callbacks), container);
  }

  // Document click handler
  const handleDocumentClick = (e: MouseEvent) => {
    // Ignore the initial click that expanded the toolbar (avoids race condition)
    if (e.target === initialClickTarget) {
      initialClickTarget = null;
      return;
    }

    // Don't dismiss if clicking inside the toolbar
    if (container.contains(e.target as Node)) return;

    // Don't dismiss if interacting with select dropdown (select, option elements)
    const target = e.target as HTMLElement;
    if (target.tagName === 'SELECT' || target.tagName === 'OPTION') return;

    // If menu is open, close it first
    if (state.menuState.isOpen) {
      state = { ...state, menuState: { isOpen: false, selectedCategory: null } };
      renderToolbar();
      return;
    }

    // If in translate mode, go back to normal mode first
    if (state.isTranslateMode) {
      state = { ...state, isTranslateMode: false };
      renderToolbar();
      return;
    }

    // If expanded, collapse it
    if (state.isExpanded) {
      state = { ...state, isExpanded: false };
      renderToolbar();
      // Remove document listeners since we're collapsed
      detachDocumentListeners();
      return;
    }

    // Otherwise dismiss
    destroy();
    onDismiss();
  };

  // Escape key handler
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // If menu is open, close it first
      if (state.menuState.isOpen) {
        state = { ...state, menuState: { isOpen: false, selectedCategory: null } };
        renderToolbar();
        return;
      }

      if (state.isTranslateMode) {
        state = { ...state, isTranslateMode: false };
        renderToolbar();
        return;
      }
      destroy();
      onDismiss();
    }
  };

  // Attach document listeners
  function attachDocumentListeners() {
    // Use setTimeout to avoid catching the current click
    setTimeout(() => {
      document.addEventListener('click', handleDocumentClick);
      document.addEventListener('keydown', handleEscape);
    }, 0);
  }

  // Detach document listeners
  function detachDocumentListeners() {
    document.removeEventListener('click', handleDocumentClick);
    document.removeEventListener('keydown', handleEscape);
  }

  // Destroy function
  function destroy() {
    detachDocumentListeners();
    if (container.parentNode) {
      container.remove();
    }
  }

  // Initial render
  renderToolbar();

  // Attach listeners after initial render
  attachDocumentListeners();

  return {
    element: container,
    destroy,
  };
}

/**
 * Remove floating toolbar from shadow DOM
 */
export function removeFloatingToolbar(shadow: ShadowRoot): void {
  const container = shadow.querySelector('.bk-toolbar-container');
  if (container) {
    container.remove();
  }
}

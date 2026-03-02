/**
 * Floating Toolbar component for selection-ui
 * Creates and manages the floating toolbar using lit-html
 * Supports scalable actions with dropdown menu
 */

import { render } from 'lit-html';
import type { QuickAction, SelectionPosition } from '../types.ts';
import { toolbarTemplate, type ToolbarState, type ToolbarCallbacks } from '../templates/index.ts';
import { QUICK_ACTIONS } from '../constants.ts';
import { loadAllActions } from '../utils/actionsLoader.ts';

// === Types ===

import { PROVIDER_PRESETS } from '../../../providers/index.ts';
import type { ProviderPreset, CustomProvider } from '../../../types/index.ts';

export interface FloatingToolbarConfig {
  position: SelectionPosition;
  onActionClick: (action: QuickAction['id'], targetLang?: string) => void;
  onDismiss: () => void;
  initiallyExpanded?: boolean;
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
  const { position, onActionClick, onDismiss, initiallyExpanded = false } = config;

  // Create container for toolbar
  const container = document.createElement('div');
  container.className = 'bk-toolbar-container';
  shadow.appendChild(container);

  // State
  let state: ToolbarState = {
    isExpanded: initiallyExpanded,
    isTranslateMode: false,
    selectedLang: 'English',
    position,
    menuState: { isOpen: false, selectedCategory: null },
    providerState: {
      isOpen: false,
      currentProvider: 'openai',
      currentModel: '',
      providers: [],
    },
    actions: [...QUICK_ACTIONS],
  };

  // Load actions from storage (built-in + custom, with overrides applied)
  loadAllActions().then((actions) => {
    state = { ...state, actions };
    renderToolbar();
  }).catch(() => {/* keep defaults */});

  // Load provider state from storage
  async function loadProviderState() {
    try {
      const data = await chrome.storage.local.get([
        'providerConfig',
        'customProviders',
        'fetchedModels'
      ]) as Record<string, any>;

      const currentProviderId = data.providerConfig?.providerId || 'openai';
      const currentModel = data.providerConfig?.model || '';

      const customProviders: CustomProvider[] = data.customProviders || [];
      const fetchedModels: Record<string, { models?: string[] }> = data.fetchedModels || {};

      const providers = [];

      const presets = Object.entries(PROVIDER_PRESETS)
        .filter(([id]) => id !== 'custom')
        .map(([id, p]) => ({ ...p, id } as ProviderPreset & { id: string }));

      const allProviders = [...presets, ...customProviders];

      for (const p of allProviders) {
        let models: string[] = [];

        // Use fetched models and static models
        // Use fetched models and static models strictly
        if (fetchedModels[p.id]?.models && fetchedModels[p.id]!.models!.length > 0) {
          models = [...fetchedModels[p.id].models!];
        } else if ((p as ProviderPreset).staticModels?.length) {
          models = [...(p as ProviderPreset).staticModels!];
        } else if (p.models?.length) {
          models = [...p.models];
        }

        // Add defaultModel if it exists and isn't already in the list
        if (p.defaultModel && !models.includes(p.defaultModel)) {
          models.unshift(p.defaultModel);
        }

        // Filter logic:
        // 1. If it's a custom provider, keep it (it might not need an API key if it's local)
        // 2. If it's Ollama, ONLY keep it if it actually has fetched models
        // 3. For any other provider, ONLY keep it if an API key is configured in `providerKeys`
        const isCustom = p.id.startsWith('custom_') || p.id === 'custom';
        const isOllama = p.id === 'ollama';
        const apiKey = data.providerKeys?.[p.id]?.apiKey;

        let shouldKeep = false;

        if (isCustom) {
          shouldKeep = true;
        } else if (isOllama) {
          shouldKeep = !!(fetchedModels[p.id]?.models && fetchedModels[p.id]!.models!.length > 0);
        } else {
          shouldKeep = !!apiKey && apiKey.trim() !== '';
        }

        if (shouldKeep) {
          providers.push({
            id: p.id,
            name: p.name || 'Custom',
            models,
          });
        }
      }

      state = {
        ...state,
        providerState: {
          ...state.providerState,
          currentProvider: currentProviderId,
          currentModel,
          providers,
        },
      };
      renderToolbar();

      // Background Fetch: Proactively fetch models for supported providers
      // Only fetch if we have an API key (or if it's localhost ollama which doesn't need one)
      const providerKeys = data.providerKeys || {};
      let hasUpdates = false;
      const newFetchedModels = { ...fetchedModels };

      // Don't block the UI, run in background
      setTimeout(async () => {
        for (const p of allProviders) {
          if (p.supportsModelFetch || (p as CustomProvider).apiUrl) {
            const apiKey = providerKeys[p.id]?.apiKey || '';
            const format = (p as CustomProvider).format || (p as ProviderPreset).format;

            // Simple check to skip if API key is obviously missing for authenticated endpoints
            if (!apiKey && format !== 'ollama' && p.id !== 'custom') {
              continue; // Skip fetching if no key
            }

            try {
              const result = await chrome.runtime.sendMessage({
                type: 'FETCH_MODELS',
                providerId: p.id
              });

              if (result.models && result.models.length > 0) {
                // Only update if it's actually different from what we have
                const currentStr = JSON.stringify(newFetchedModels[p.id]?.models || []);
                const nextStr = JSON.stringify(result.models);

                if (currentStr !== nextStr) {
                  newFetchedModels[p.id] = { models: result.models };
                  hasUpdates = true;

                  // Update local state immediately
                  const providerIdx = state.providerState.providers.findIndex(prov => prov.id === p.id);
                  if (providerIdx !== -1) {
                    // Update state.providerState.providers with new models
                    const updatedProviders = [...state.providerState.providers];

                    const modelsToSet = [...result.models];
                    if (p.defaultModel && !modelsToSet.includes(p.defaultModel)) {
                      modelsToSet.unshift(p.defaultModel);
                    }

                    updatedProviders[providerIdx] = {
                      ...updatedProviders[providerIdx],
                      models: modelsToSet
                    };

                    state = {
                      ...state,
                      providerState: {
                        ...state.providerState,
                        providers: updatedProviders
                      }
                    };
                    renderToolbar();
                  }
                }
              }
            } catch (err) {
              console.warn(`Failed to background fetch models for ${p.id}`, err);
            }
          }
        }

        // Save back to storage if anything changed
        if (hasUpdates) {
          await chrome.storage.local.set({ fetchedModels: newFetchedModels });
        }
      }, 500);

    } catch (e) {
      console.warn('Failed to load provider state', e);
    }
  }

  // Load it immediately
  loadProviderState();

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
      // Close menus if open
      state = {
        ...state,
        menuState: { isOpen: false, selectedCategory: null },
        providerState: { ...state.providerState, isOpen: false }
      };
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
        providerState: { ...state.providerState, isOpen: false },
      };
      renderToolbar();
    },

    onMenuClose: (e?: Event) => {
      e?.stopPropagation();
      state = {
        ...state,
        menuState: { isOpen: false, selectedCategory: null },
      };
      renderToolbar();
    },

    onProviderMenuToggle: (e: Event) => {
      e.stopPropagation();
      state = {
        ...state,
        providerState: {
          ...state.providerState,
          isOpen: !state.providerState.isOpen,
        },
        menuState: { isOpen: false, selectedCategory: null },
        isTranslateMode: false, // Close translate mode too if open
      };
      renderToolbar();
    },

    onProviderMenuClose: (e?: Event) => {
      e?.stopPropagation();
      state = {
        ...state,
        providerState: { ...state.providerState, isOpen: false },
      };
      renderToolbar();
    },

    onModelSelect: async (e: Event, providerId: string, model: string) => {
      e.stopPropagation();

      // Update local state immediately for fast UI feedback
      state = {
        ...state,
        providerState: {
          ...state.providerState,
          isOpen: false,
          currentProvider: providerId,
          currentModel: model,
        },
      };
      renderToolbar();

      // Save global provider selection to chrome.storage.local
      try {
        const data = await chrome.storage.local.get(['providerConfig', 'providerKeys', 'customProviders']) as Record<string, any>;

        const newConfig = {
          ...data.providerConfig,
          providerId,
          model,
        };

        const isCustom = data.customProviders?.some((p: CustomProvider) => p.id === providerId);
        let format: string | undefined, apiUrl: string | undefined, apiKey: string | undefined;

        if (isCustom) {
          const cp = data.customProviders.find((p: CustomProvider) => p.id === providerId);
          format = cp.format;
          apiUrl = cp.apiUrl;
          apiKey = cp.apiKey;
        } else {
          const p = Object.entries(PROVIDER_PRESETS).find(([id]) => id === providerId)?.[1];
          format = p?.format;
          apiUrl = p?.apiUrl;
        }

        const savedKey = data.providerKeys?.[providerId]?.apiKey;
        if (savedKey !== undefined && savedKey !== '') {
          apiKey = savedKey;
        }

        if (format) newConfig.format = format;
        if (apiUrl) newConfig.apiUrl = apiUrl;
        if (apiKey !== undefined) newConfig.apiKey = apiKey;

        const updates: any = { providerConfig: newConfig };

        // Sync providerKeys
        const providerKeys = data.providerKeys || {};
        updates.providerKeys = {
          ...providerKeys,
          [providerId]: {
            apiKey: apiKey || '',
            model,
          }
        };

        // Sync customProviders if custom
        if (isCustom) {
          const customProviders = data.customProviders.map((p: CustomProvider) =>
            p.id === providerId ? { ...p, model, apiKey: apiKey || p.apiKey } : p
          );
          updates.customProviders = customProviders;
        }

        await chrome.storage.local.set(updates);
      } catch (err) {
        console.warn('Failed to save selected model to storage', err);
      }
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
    if (state.menuState.isOpen || state.providerState.isOpen) {
      state = {
        ...state,
        menuState: { isOpen: false, selectedCategory: null },
        providerState: { ...state.providerState, isOpen: false }
      };
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
      if (state.menuState.isOpen || state.providerState.isOpen) {
        state = {
          ...state,
          menuState: { isOpen: false, selectedCategory: null },
          providerState: { ...state.providerState, isOpen: false }
        };
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

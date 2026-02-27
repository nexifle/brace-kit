// Types for text selection UI feature

export type ActionId = 'summarize' | 'explain' | 'translate' | 'rephrase' | string;

export interface QuickAction {
  id: ActionId;
  label: string;
  icon: string; // Icon identifier for SVG mapping
  prompt: (text: string, targetLang?: string) => string;
  requiresTargetLang?: boolean;
  /** If true, shown directly in toolbar. If false, shown in "More" menu */
  isPrimary?: boolean;
  /** Optional keyboard shortcut hint */
  shortcut?: string;
  /** Category for grouping in menu */
  category?: string;
}

export interface SelectionPosition {
  top: number;
  left: number;
  placement: 'top' | 'bottom';
}

export interface ThemeDetectionResult {
  isDark: boolean;
  themeSource: 'data-theme' | 'class' | 'computed' | 'default';
}

export interface QuickActionRequest {
  type: 'QUICK_ACTION_REQUEST';
  action: ActionId;
  text: string;
  targetLang?: string;
  requestId: string;
}

export interface QuickActionResponse {
  type: 'QUICK_ACTION_RESPONSE';
  requestId: string;
  content?: string;
  error?: string;
}

export interface SelectionUIState {
  isVisible: boolean;
  selectedText: string;
  position: SelectionPosition | null;
  isEditable: boolean;
  selectionRange: Range | null;
}

export interface ResultPopoverState {
  isVisible: boolean;
  action: ActionId | null;
  content: string;
  isLoading: boolean;
  position: SelectionPosition | null;
}

// Menu/Dropdown state
export interface MenuState {
  isOpen: boolean;
  selectedCategory: string | null;
}

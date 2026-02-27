// Types for text selection UI feature

export interface QuickAction {
  id: 'summarize' | 'explain' | 'translate' | 'rephrase';
  label: string;
  icon: string;
  prompt: (text: string, targetLang?: string) => string;
  requiresTargetLang?: boolean;
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
  action: QuickAction['id'];
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
  action: QuickAction['id'] | null;
  content: string;
  isLoading: boolean;
  position: SelectionPosition | null;
}

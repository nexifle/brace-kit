/**
 * Loads and merges built-in + custom quick actions from chrome.storage.local.
 * Applies user overrides (disable, relabel, re-categorize) to built-in actions.
 */

import type { QuickAction } from '../types.ts';
import { QUICK_ACTIONS, STORAGE_KEYS } from '../constants.ts';

interface CustomActionData {
  id: string;
  label: string;
  promptTemplate: string;
  isPrimary?: boolean;
  category?: string;
}

interface BuiltinOverrideData {
  id: string;
  label?: string;
  disabled?: boolean;
  isPrimary?: boolean;
  category?: string;
}

export function buildAllActions(
  customActions: CustomActionData[],
  overrides: Record<string, BuiltinOverrideData>
): QuickAction[] {
  const builtins = QUICK_ACTIONS
    .filter((a) => !overrides[a.id]?.disabled)
    .map((a) => {
      const ov = overrides[a.id];
      if (!ov) return a;
      return {
        ...a,
        label: ov.label ?? a.label,
        isPrimary: ov.isPrimary ?? a.isPrimary,
        category: ov.category ?? a.category,
      };
    });

  const customs: QuickAction[] = customActions.map((ca) => ({
    id: ca.id,
    label: ca.label,
    icon: 'custom',
    isPrimary: ca.isPrimary,
    category: ca.category,
    prompt: (text: string) => ca.promptTemplate.replace(/\{\{text\}\}/g, text),
  }));

  return [...builtins, ...customs];
}

export async function loadAllActions(): Promise<QuickAction[]> {
  try {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.CUSTOM_ACTIONS,
      STORAGE_KEYS.BUILTIN_OVERRIDES,
    ]);
    const customActions: CustomActionData[] = (data[STORAGE_KEYS.CUSTOM_ACTIONS] as CustomActionData[]) ?? [];
    const overrides: Record<string, BuiltinOverrideData> = (data[STORAGE_KEYS.BUILTIN_OVERRIDES] as Record<string, BuiltinOverrideData>) ?? {};
    return buildAllActions(customActions, overrides);
  } catch {
    return [...QUICK_ACTIONS];
  }
}

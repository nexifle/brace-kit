import { detectPageTheme, generateThemeVariables } from './ThemeDetector.ts';
import type { ThemeDetectionResult } from './types.ts';

// Import CSS as string using Bun's text loader
import stylesCss from './styles.css' with { type: 'text' };

const CONTAINER_ID = 'bracekit-selection-ui';

/**
 * Creates and manages the Shadow DOM container for selection UI
 * Provides complete style isolation from the host page
 */
export function createShadowContainer(): {
  container: HTMLDivElement;
  shadow: ShadowRoot;
  styleElement: HTMLStyleElement;
} | null {
  // Remove existing container if any
  removeShadowContainer();

  try {
    // Create container element
    const container = document.createElement('div');
    container.id = CONTAINER_ID;

    // Position absolute to document (sticky to scroll position)
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      min-height: 100%;
      pointer-events: none;
      z-index: 2147483647;
    `;

    // Attach shadow DOM
    const shadow = container.attachShadow({ mode: 'open' });

    // Create style element
    const styleElement = document.createElement('style');
    shadow.appendChild(styleElement);

    // Append container to documentElement (html) for full document coverage
    document.documentElement.appendChild(container);

    return { container, shadow, styleElement };
  } catch (error) {
    console.error('[BraceKit] Failed to create shadow container:', error);
    return null;
  }
}

/**
 * Remove the shadow container from DOM
 */
export function removeShadowContainer(): void {
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) {
    existing.remove();
  }
}

/**
 * Check if shadow container exists
 */
export function hasShadowContainer(): boolean {
  return document.getElementById(CONTAINER_ID) !== null;
}

/**
 * Get CSS styles for the selection UI
 * Combines static CSS with dynamic theme variables
 */
export function getSelectionUIStyles(theme: ThemeDetectionResult): string {
  const vars = generateThemeVariables(theme.isDark);

  // Combine theme variables with static styles
  return `
    :host {
      ${vars}
    }

    ${stylesCss}
  `;
}

/**
 * Update theme in existing shadow container
 */
export function updateShadowTheme(styleElement: HTMLStyleElement): void {
  const theme = detectPageTheme();
  styleElement.textContent = getSelectionUIStyles(theme);
}

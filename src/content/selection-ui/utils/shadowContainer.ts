/**
 * Shadow DOM container management for selection-ui
 * Provides complete style isolation from the host page
 */

import { detectPageTheme, generateThemeVariables, ensureFontLoaded } from './themeDetector.ts';
import type { ThemeDetectionResult } from '../types.ts';

// Import CSS as string using Bun's text loader
import stylesCss from '../styles/styles.css' with { type: 'text' };

const CONTAINER_ID = 'bracekit-selection-ui';

export interface ShadowContainer {
  container: HTMLDivElement;
  shadow: ShadowRoot;
  styleElement: HTMLStyleElement;
}

/**
 * Creates and manages the Shadow DOM container for selection UI
 * Provides complete style isolation from the host page
 */
export function createShadowContainer(): ShadowContainer | null {
  // Remove existing container if any
  removeShadowContainer();

  // Ensure font is loaded once in main document (not in shadow DOM)
  ensureFontLoaded();

  try {
    // Create container element
    const container = document.createElement('div');
    container.id = CONTAINER_ID;

    // Use the full scrollable document dimensions for coverage.
    // We compute the max of various measurements to handle all edge cases.
    const docEl = document.documentElement;
    const body = document.body;
    const fullWidth = Math.max(docEl.scrollWidth, body.scrollWidth, docEl.clientWidth);
    const fullHeight = Math.max(docEl.scrollHeight, body.scrollHeight, docEl.clientHeight);

    // Position absolute to document (sticky to scroll position)
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: ${fullWidth}px;
      height: ${fullHeight}px;
      pointer-events: none;
      z-index: 2147483647;
    `;

    // Attach shadow DOM
    const shadow = container.attachShadow({ mode: 'open' });

    // Create style element
    const styleElement = document.createElement('style');
    shadow.appendChild(styleElement);

    // Append container to body for better compatibility.
    // document.documentElement can have transforms/filters that break positioning.
    document.body.appendChild(container);

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

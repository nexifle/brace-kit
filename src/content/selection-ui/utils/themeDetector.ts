/**
 * Theme detection utilities for selection-ui
 * Detects the theme (dark/light) of the host webpage
 */

import type { ThemeDetectionResult } from '../types.ts';

// Regex patterns for color parsing
const RGB_REGEX = /rgba?\((\d+),\s*(\d+),\s*(\d+)/;
const HEX_REGEX = /#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i;
const SHORT_HEX_REGEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;

// Luminance threshold for determining dark colors
const LUMINANCE_DARK_THRESHOLD = 0.5;

/**
 * Detects the theme (dark/light) of the host webpage
 * Checks multiple sources in order of priority:
 * 1. data-theme attribute on html/body
 * 2. class names on html/body (dark, light, theme-dark, etc.)
 * 3. color-scheme CSS property
 * 4. Computed background color (fallback)
 */
export function detectPageTheme(): ThemeDetectionResult {
  const html = document.documentElement;
  const body = document.body;

  // 1. Check data-theme attribute
  const dataTheme = html.getAttribute('data-theme') || body?.getAttribute('data-theme');
  if (dataTheme) {
    const isDark = isDarkThemeValue(dataTheme);
    return { isDark, themeSource: 'data-theme' };
  }

  // 2. Check class names
  const htmlClass = html.className || '';
  const bodyClass = body?.className || '';
  const allClasses = `${htmlClass} ${bodyClass}`.toLowerCase();

  if (hasDarkClass(allClasses)) {
    return { isDark: true, themeSource: 'class' };
  }
  if (hasLightClass(allClasses)) {
    return { isDark: false, themeSource: 'class' };
  }

  // 3. Check color-scheme CSS property
  const computedStyle = window.getComputedStyle(html);
  const colorScheme = computedStyle.colorScheme;
  if (colorScheme === 'dark') {
    return { isDark: true, themeSource: 'computed' };
  }
  if (colorScheme === 'light') {
    return { isDark: false, themeSource: 'computed' };
  }

  // 4. Check computed background color (fallback)
  const bgColor = computedStyle.backgroundColor;
  if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
    const isDark = isDarkColor(bgColor);
    return { isDark, themeSource: 'computed' };
  }

  // Default to light
  return { isDark: false, themeSource: 'default' };
}

// Track if font has been loaded to prevent duplicate loading
let fontLoaded = false;

/**
 * Load the DM Sans font into the main document (once)
 * This prevents multiple network requests when multiple shadow DOMs are created
 */
export function ensureFontLoaded(): void {
  if (fontLoaded) return;

  // Check if font is already in the document
  if (document.querySelector('link[data-bk-font]')) {
    fontLoaded = true;
    return;
  }

  // Create link element for Google Fonts
  const link = document.createElement('link');
  link.setAttribute('data-bk-font', 'true');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap';

  // Insert at the beginning of head to ensure proper cascade
  document.head.insertBefore(link, document.head.firstChild);
  fontLoaded = true;
}

/**
 * Generate CSS variables for the given theme
 * Uses refined professional color palette
 * Note: Font is loaded separately via ensureFontLoaded()
 */
export function generateThemeVariables(isDark: boolean): string {
  if (isDark) {
    // Dark theme: Deep blue-gray tones with violet accent
    return `
      --bk-background: oklch(0.13 0.015 265);
      --bk-foreground: oklch(0.95 0.005 265);
      --bk-card: oklch(0.17 0.018 265);
      --bk-card-foreground: oklch(0.95 0.005 265);
      --bk-popover: oklch(0.165 0.02 265);
      --bk-popover-foreground: oklch(0.95 0.005 265);
      --bk-primary: oklch(0.68 0.19 280);
      --bk-primary-foreground: oklch(0.98 0 0);
      --bk-secondary: oklch(0.25 0.025 265);
      --bk-secondary-foreground: oklch(0.92 0.005 265);
      --bk-muted: oklch(0.26 0.02 265);
      --bk-muted-foreground: oklch(0.65 0.01 265);
      --bk-accent: oklch(0.28 0.035 280);
      --bk-accent-foreground: oklch(0.95 0.005 265);
      --bk-destructive: oklch(0.55 0.22 25);
      --bk-destructive-foreground: oklch(0.98 0 0);
      --bk-border: oklch(0.32 0.025 265);
      --bk-input: oklch(0.32 0.025 265);
      --bk-ring: oklch(0.68 0.19 280);
      --bk-success: oklch(0.6 0.15 160);
      --bk-success-foreground: oklch(0.13 0.01 265);
      --bk-radius: 0.625rem;
    `;
  }

  // Light theme: Clean white with subtle violet accent
  return `
    --bk-background: oklch(0.985 0.002 265);
    --bk-foreground: oklch(0.18 0.02 265);
    --bk-card: oklch(1 0 0);
    --bk-card-foreground: oklch(0.18 0.02 265);
    --bk-popover: oklch(1 0 0);
    --bk-popover-foreground: oklch(0.18 0.02 265);
    --bk-primary: oklch(0.55 0.22 280);
    --bk-primary-foreground: oklch(0.98 0 0);
    --bk-secondary: oklch(0.965 0.008 265);
    --bk-secondary-foreground: oklch(0.22 0.015 265);
    --bk-muted: oklch(0.965 0.005 265);
    --bk-muted-foreground: oklch(0.5 0.015 265);
    --bk-accent: oklch(0.94 0.02 280);
    --bk-accent-foreground: oklch(0.22 0.02 265);
    --bk-destructive: oklch(0.58 0.24 25);
    --bk-destructive-foreground: oklch(0.98 0 0);
    --bk-border: oklch(0.91 0.008 265);
    --bk-input: oklch(0.91 0.008 265);
    --bk-ring: oklch(0.55 0.22 280);
    --bk-success: oklch(0.55 0.16 160);
    --bk-success-foreground: oklch(0.98 0 0);
    --bk-radius: 0.625rem;
  `;
}

// === Private Helper Functions ===

function isDarkThemeValue(value: string): boolean {
  const dark = ['dark', 'night', 'dim', 'black', 'midnight'];
  const light = ['light', 'day', 'bright', 'white'];
  const lower = value.toLowerCase();

  if (dark.some((d) => lower.includes(d))) return true;
  if (light.some((l) => lower.includes(l))) return false;
  return false;
}

function hasDarkClass(classes: string): boolean {
  const darkPatterns = [
    'dark',
    'theme-dark',
    'dark-theme',
    'darkmode',
    'dark-mode',
    'night',
    'nightmode',
    'night-mode',
  ];
  return darkPatterns.some((pattern) => classes.includes(pattern));
}

function hasLightClass(classes: string): boolean {
  const lightPatterns = [
    'light',
    'theme-light',
    'light-theme',
    'lightmode',
    'light-mode',
    'day',
    'daymode',
    'day-mode',
  ];
  return lightPatterns.some((pattern) => classes.includes(pattern));
}

/**
 * Determine if a color is dark based on its RGB values
 * Uses relative luminance formula
 */
function isDarkColor(color: string): boolean {
  const rgb = parseColor(color);
  if (!rgb) return false;

  // Calculate relative luminance
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance < LUMINANCE_DARK_THRESHOLD;
}

function parseColor(color: string): { r: number; g: number; b: number } | null {
  // Try rgb/rgba
  const rgbMatch = color.match(RGB_REGEX);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
    };
  }

  // Try hex (6-digit)
  const hexMatch = color.match(HEX_REGEX);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
    };
  }

  // Try short hex (3-digit) - FIXED: correct regex pattern
  const shortHexMatch = color.match(SHORT_HEX_REGEX);
  if (shortHexMatch) {
    return {
      r: parseInt(shortHexMatch[1] + shortHexMatch[1], 16),
      g: parseInt(shortHexMatch[2] + shortHexMatch[2], 16),
      b: parseInt(shortHexMatch[3] + shortHexMatch[3], 16),
    };
  }

  return null;
}

/**
 * Shared template components for selection-ui
 * Contains SVG icons and reusable templates
 */

import { html, type TemplateResult } from 'lit-html';

// === SVG Icons ===

export const icons = {
  summarize: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <line x1="10" y1="9" x2="8" y2="9"/>
    </svg>
  `,

  explain: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  `,

  translate: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m5 8 6 6"/>
      <path d="m4 14 6-6 2-3"/>
      <path d="M2 5h12"/>
      <path d="M7 2h1"/>
      <path d="m22 22-5-10-5 10"/>
      <path d="M14 18h6"/>
    </svg>
  `,

  rephrase: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
      <path d="m15 5 4 4"/>
    </svg>
  `,

  more: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="1"/>
      <circle cx="19" cy="12" r="1"/>
      <circle cx="5" cy="12" r="1"/>
    </svg>
  `,

  chevronDown: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m6 9 6 6 6-6"/>
    </svg>
  `,

  chevronRight: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m9 18 6-6-6-6"/>
    </svg>
  `,

  close: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  `,

  back: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m15 18-6-6 6-6"/>
    </svg>
  `,

  regenerate: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
      <path d="M21 3v5h-5"/>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
      <path d="M8 16H3v5"/>
    </svg>
  `,

  copy: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
    </svg>
  `,

  check: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20,6 9,17 4,12"/>
    </svg>
  `,

  apply: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  `,

  error: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  `,

  // Additional icons for future actions
  simplify: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
      <path d="M12 12v9"/>
      <path d="m8 17 4 4 4-4"/>
    </svg>
  `,

  expand: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 14.899A7 7 0 1 1 9.71 20"/>
      <path d="M12 12v9"/>
      <path d="m16 8-4-4-4 4"/>
    </svg>
  `,

  formal: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  `,

  casual: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
      <line x1="9" y1="9" x2="9.01" y2="9"/>
      <line x1="15" y1="9" x2="15.01" y2="9"/>
    </svg>
  `,

  grammar: html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
    </svg>
  `,
};

// === Logo SVG ===

export const logoSvgTemplate = html`
  <svg
    width="20"
    height="20"
    viewBox="0 0 400 400"
    fill="none"
    style="color: var(--bk-primary)"
    aria-hidden="true"
  >
    <g clip-path="url(#clip0)">
      <path d="M116 393.837V360.635H96.096C85.6702 360.635 79.0355 358.608 76.1921 354.556C73.3487 350.814 71.927 342.865 71.927 330.706V259.157C71.927 239.828 68.6096 225.954 61.975 217.537C55.3403 209.119 46.1782 203.351 34.4886 200.234V199.766C45.8623 196.649 55.0244 191.037 61.975 182.931C68.6096 174.514 71.927 160.484 71.927 140.843V69.2942C71.927 57.4473 73.3487 49.4974 76.1921 45.4445C79.0355 41.3916 85.6702 39.3652 96.096 39.3652H116V6.1626H95.6221C77.9298 6.1626 64.5025 8.18905 55.3403 12.2419C46.1782 15.9831 40.0175 22.5301 36.8581 31.8829C33.6987 40.9239 32.1191 53.5503 32.1191 69.7619V139.908C32.1191 153.314 30.2235 164.07 26.4322 172.175C22.641 180.281 13.4789 184.334 -1.05418 184.334V215.666C13.4789 215.666 22.641 219.719 26.4322 227.825C30.2235 235.93 32.1191 246.686 32.1191 260.092V330.238C32.1191 346.138 33.6987 358.764 36.8581 368.117C40.0175 377.47 46.1782 384.017 55.3403 387.758C64.5025 391.811 77.9298 393.837 95.6221 393.837H116Z" fill="currentColor"/>
      <path d="M164.407 244L138.21 224.45L173.519 175L116 156.6L126.251 124.975L183.769 143.95V83H216.231V143.95L273.749 124.975L284 156.6L225.912 175L261.79 224.45L235.593 244L199.715 194.55L164.407 244Z" fill="currentColor"/>
      <ellipse cx="199.692" cy="298.196" rx="36.7287" ry="36.804" fill="currentColor"/>
      <path d="M304.378 393.837C322.07 393.837 335.498 391.811 344.66 387.758C353.822 384.017 359.983 377.47 363.142 368.117C366.301 358.764 367.881 346.138 367.881 330.238V260.092C367.881 246.686 369.777 235.93 373.568 227.825C377.043 219.719 386.205 215.666 401.054 215.666V184.334C386.205 184.334 377.043 180.281 373.568 172.175C369.777 164.07 367.881 153.314 367.881 139.908V69.7619C367.881 53.5503 366.301 40.9239 363.142 31.8829C359.983 22.5301 353.822 15.9831 344.66 12.2419C335.498 8.18905 322.07 6.1626 304.378 6.1626H284V39.3652H303.904C314.33 39.3652 320.965 41.3916 323.808 45.4445C326.651 49.4974 328.073 57.4473 328.073 69.2942V140.843C328.073 160.484 331.548 174.514 338.499 182.931C345.134 191.037 354.138 196.649 365.511 199.766V200.234C353.506 203.351 344.344 209.119 338.025 217.537C331.39 225.954 328.073 239.828 328.073 259.157V330.706C328.073 342.865 326.651 350.814 323.808 354.556C320.965 358.608 314.33 360.635 303.904 360.635H284V393.837H304.378Z" fill="currentColor"/>
    </g>
    <defs>
      <clipPath id="clip0">
        <rect width="400" height="400" fill="white"/>
      </clipPath>
    </defs>
  </svg>
`;

// === Loading Spinner ===

/**
 * Loading spinner template with ARIA
 */
export function loadingSpinnerTemplate(): TemplateResult {
  return html`
    <div class="bk-loading" role="status" aria-live="polite">
      <div class="bk-spinner" aria-hidden="true"></div>
      <div class="bk-loading-text">Generating...</div>
    </div>
  `;
}

// === Error Display ===

/**
 * Error display template with ARIA
 */
export function errorTemplate(message: string): TemplateResult {
  return html`
    <div class="bk-error" role="alert" aria-live="assertive">
      <div class="bk-error-icon" aria-hidden="true">
        ${icons.error}
      </div>
      <div class="bk-error-text">${message}</div>
    </div>
  `;
}

// === Overlay ===

/**
 * Overlay template for closing popover
 */
export function overlayTemplate(onClick: (e: Event) => void): TemplateResult {
  return html`
    <div
      style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2147483646;
        background: transparent;
      "
      @click=${onClick}
      aria-hidden="true"
    ></div>
  `;
}

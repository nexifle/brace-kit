/**
 * Shared template components for selection-ui
 */

import { html, type TemplateResult } from 'lit-html';

// Logo SVG as template
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

/**
 * Error display template with ARIA
 */
export function errorTemplate(message: string): TemplateResult {
  return html`
    <div class="bk-error" role="alert" aria-live="assertive">
      <div class="bk-error-icon" aria-hidden="true">⚠️</div>
      <div class="bk-error-text">${message}</div>
    </div>
  `;
}

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

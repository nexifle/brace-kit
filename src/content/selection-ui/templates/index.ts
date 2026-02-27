/**
 * Templates for selection-ui module
 */

// Shared components
export { logoSvgTemplate, loadingSpinnerTemplate, errorTemplate, overlayTemplate, icons } from './shared.ts';

// Toolbar templates
export {
  toolbarTemplate,
  type ToolbarState,
  type ToolbarCallbacks,
} from './toolbar.ts';

// Popover templates
export {
  popoverTemplate,
  type PopoverViewState,
  type PopoverState,
  type PopoverCallbacks,
} from './popover.ts';

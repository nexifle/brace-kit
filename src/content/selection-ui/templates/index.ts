/**
 * Templates for selection-ui module
 */

// Shared components
export { logoSvgTemplate, loadingSpinnerTemplate, errorTemplate, overlayTemplate, icons } from './shared.ts';

// Toolbar templates
export {
  toolbarTemplate,
  getProviderMenuView,
  type ToolbarState,
  type ToolbarCallbacks,
  type ToolbarProvider,
  type ProviderMenuView,
  type ProviderMenuGroup,
  type ProviderModelRow,
} from './toolbar.ts';

// Popover templates
export {
  popoverTemplate,
  type PopoverViewState,
  type PopoverState,
  type PopoverCallbacks,
} from './popover.ts';

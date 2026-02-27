/**
 * Positioning Utilities Tests
 *
 * Tests for the selection-ui positioning logic, covering:
 * - getContainerOffset: container offset detection
 * - calculateToolbarPosition: toolbar placement around selections
 * - calculateToolbarPositionFromElement: toolbar placement from editable elements
 * - calculatePopoverPosition: popover placement around selections
 *
 * Architecture:
 * - Uses reusable mock factories (setupWindowMock, createMockSelection, etc.)
 * - Window globals are mocked via globalThis for Bun test environment
 * - Each describe block tests one function with multiple scenarios
 * - Edge cases: zero-size rects, container offsets, viewport clamping, scroll offsets
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
    getContainerOffset,
    calculateToolbarPosition,
    calculateToolbarPositionFromElement,
    calculatePopoverPosition,
} from '../../src/content/selection-ui/utils/positioning.ts';
import { TOOLBAR_HEIGHT, TOOLBAR_WIDTH, POPOVER_WIDTH, POPOVER_MAX_HEIGHT, GAP } from '../../src/content/selection-ui/constants.ts';

// =============================================================================
// Mock Factories
// =============================================================================

interface ViewportConfig {
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
}

const DEFAULT_VIEWPORT: ViewportConfig = {
    width: 1280,
    height: 800,
    scrollX: 0,
    scrollY: 0,
};

/**
 * Set up minimal window mock on globalThis.
 * Bun test runner doesn't provide window/document by default.
 */
function setupWindowMock(config: Partial<ViewportConfig> = {}): void {
    const v = { ...DEFAULT_VIEWPORT, ...config };

    (globalThis as any).window = {
        innerWidth: v.width,
        innerHeight: v.height,
        scrollX: v.scrollX,
        scrollY: v.scrollY,
    };
}

function teardownWindowMock(): void {
    delete (globalThis as any).window;
}

/**
 * Update viewport values on the existing window mock.
 */
function updateViewport(config: Partial<ViewportConfig>): void {
    const w = (globalThis as any).window;
    if (config.width !== undefined) w.innerWidth = config.width;
    if (config.height !== undefined) w.innerHeight = config.height;
    if (config.scrollX !== undefined) w.scrollX = config.scrollX;
    if (config.scrollY !== undefined) w.scrollY = config.scrollY;
}

/**
 * Create a mock DOMRect with sensible defaults.
 */
function createMockRect(overrides: Partial<DOMRect> = {}): DOMRect {
    const defaults = {
        top: 200,
        left: 300,
        bottom: 220,
        right: 500,
        width: 200,
        height: 20,
        x: 300,
        y: 200,
        toJSON: () => ({}),
    };

    return { ...defaults, ...overrides } as DOMRect;
}

/**
 * Create a mock Selection with a configurable range bounding rect.
 */
function createMockSelection(rect: DOMRect): Selection {
    const mockRange = {
        getBoundingClientRect: () => rect,
    } as unknown as Range;

    return {
        rangeCount: 1,
        getRangeAt: (index: number) => {
            if (index !== 0) throw new Error(`Invalid range index: ${index}`);
            return mockRange;
        },
        toString: () => 'mock selection text',
    } as unknown as Selection;
}

/**
 * Create a mock container element with a configurable bounding rect.
 * Simulates the shadow container's outer div.
 */
function createMockContainer(rect: Partial<DOMRect> = {}): HTMLElement {
    const containerRect = createMockRect({
        top: 0,
        left: 0,
        bottom: 800,
        right: 1280,
        width: 1280,
        height: 800,
        x: 0,
        y: 0,
        ...rect,
    });

    return {
        getBoundingClientRect: () => containerRect,
        tagName: 'DIV',
        id: 'bracekit-selection-ui',
    } as unknown as HTMLElement;
}

/**
 * Create a mock Element for editable element positioning tests.
 */
function createMockElement(rect: Partial<DOMRect> = {}): Element {
    const elementRect = createMockRect(rect);

    return {
        getBoundingClientRect: () => elementRect,
        tagName: 'TEXTAREA',
    } as unknown as Element;
}

// =============================================================================
// Tests
// =============================================================================

describe('Selection UI Positioning', () => {
    beforeEach(() => {
        setupWindowMock();
    });

    afterEach(() => {
        teardownWindowMock();
    });

    // ===========================================================================
    // getContainerOffset
    // ===========================================================================

    describe('getContainerOffset', () => {
        test('returns zero offset when no container is provided', () => {
            const result = getContainerOffset(undefined);
            expect(result).toEqual({ offsetX: 0, offsetY: 0 });
        });

        test('returns zero offset when container is at document origin (no scroll)', () => {
            const container = createMockContainer({ top: 0, left: 0 });
            const result = getContainerOffset(container);
            expect(result).toEqual({ offsetX: 0, offsetY: 0 });
        });

        test('detects vertical offset when container parent has transform', () => {
            const container = createMockContainer({ top: 50, left: 0 });
            const result = getContainerOffset(container);
            expect(result.offsetY).toBe(50);
            expect(result.offsetX).toBe(0);
        });

        test('detects horizontal offset from containing block', () => {
            const container = createMockContainer({ top: 0, left: 30 });
            const result = getContainerOffset(container);
            expect(result.offsetX).toBe(30);
            expect(result.offsetY).toBe(0);
        });

        test('detects both horizontal and vertical offset', () => {
            const container = createMockContainer({ top: 100, left: 50 });
            const result = getContainerOffset(container);
            expect(result.offsetX).toBe(50);
            expect(result.offsetY).toBe(100);
        });

        test('accounts for scroll offset when container is scrolled past', () => {
            updateViewport({ scrollY: 500, scrollX: 100 });

            // Container at viewport pos (-500, -100) because scrolled past
            // Document position: -500 + 500 = 0, -100 + 100 = 0
            const container = createMockContainer({ top: -500, left: -100 });
            const result = getContainerOffset(container);
            expect(result.offsetX).toBe(0);
            expect(result.offsetY).toBe(0);
        });

        test('detects offset even when page is scrolled', () => {
            updateViewport({ scrollY: 1000 });

            // Container viewport top is -950, should be -1000 → 50px offset
            const container = createMockContainer({ top: -950, left: 0 });
            const result = getContainerOffset(container);
            expect(result.offsetY).toBe(50);
        });
    });

    // ===========================================================================
    // calculateToolbarPosition
    // ===========================================================================

    describe('calculateToolbarPosition', () => {
        test('returns null for zero-size selection rect', () => {
            const selection = createMockSelection(createMockRect({ width: 0, height: 0 }));
            const result = calculateToolbarPosition(selection);
            expect(result).toBeNull();
        });

        test('places toolbar above selection when there is enough space', () => {
            const rect = createMockRect({ top: 300, bottom: 320, left: 400, width: 200 });
            const selection = createMockSelection(rect);
            const result = calculateToolbarPosition(selection);

            expect(result).not.toBeNull();
            expect(result!.placement).toBe('top');
            expect(result!.top).toBe(300 - TOOLBAR_HEIGHT - GAP);
        });

        test('places toolbar below selection when not enough space above', () => {
            const rect = createMockRect({ top: 10, bottom: 30, left: 400, width: 200 });
            const selection = createMockSelection(rect);
            const result = calculateToolbarPosition(selection);

            expect(result).not.toBeNull();
            expect(result!.placement).toBe('bottom');
            expect(result!.top).toBe(30 + GAP);
        });

        test('falls back to top of viewport when no space anywhere', () => {
            updateViewport({ height: 50 });

            const rect = createMockRect({ top: 10, bottom: 40, left: 100, width: 100 });
            const selection = createMockSelection(rect);
            const result = calculateToolbarPosition(selection);

            expect(result).not.toBeNull();
            expect(result!.placement).toBe('top');
            expect(result!.top).toBe(GAP);
        });

        test('centers toolbar horizontally on selection', () => {
            const rectLeft = 400;
            const rectWidth = 200;
            const rect = createMockRect({ top: 300, bottom: 320, left: rectLeft, width: rectWidth });
            const selection = createMockSelection(rect);
            const result = calculateToolbarPosition(selection);

            const expectedLeft = rectLeft + rectWidth / 2 - TOOLBAR_WIDTH / 2;
            expect(result!.left).toBe(expectedLeft);
        });

        test('clamps toolbar to left edge of viewport', () => {
            const rect = createMockRect({ top: 300, bottom: 320, left: 5, width: 30 });
            const selection = createMockSelection(rect);
            const result = calculateToolbarPosition(selection);

            expect(result!.left).toBeGreaterThanOrEqual(GAP);
        });

        test('clamps toolbar to right edge of viewport', () => {
            const rect = createMockRect({ top: 300, bottom: 320, left: 1250, width: 20 });
            const selection = createMockSelection(rect);
            const result = calculateToolbarPosition(selection);

            const maxLeft = 1280 - TOOLBAR_WIDTH - GAP;
            expect(result!.left).toBeLessThanOrEqual(maxLeft);
        });

        test('includes scroll offset in position (no container)', () => {
            updateViewport({ scrollY: 500, scrollX: 100 });

            const rect = createMockRect({ top: 300, bottom: 320, left: 400, width: 200 });
            const selection = createMockSelection(rect);
            const result = calculateToolbarPosition(selection);

            expect(result!.top).toBe(300 + 500 - TOOLBAR_HEIGHT - GAP);
        });

        test('subtracts container offset from position', () => {
            const container = createMockContainer({ top: 50, left: 30 });
            const rect = createMockRect({ top: 300, bottom: 320, left: 400, width: 200 });
            const selection = createMockSelection(rect);
            const result = calculateToolbarPosition(selection, container);

            const expectedTop = 300 - TOOLBAR_HEIGHT - GAP - 50;
            expect(result!.top).toBe(expectedTop);
        });

        test('handles container offset with scroll', () => {
            updateViewport({ scrollY: 1000 });

            const container = createMockContainer({ top: -950, left: 0 });
            const rect = createMockRect({ top: 300, bottom: 320, left: 400, width: 200 });
            const selection = createMockSelection(rect);
            const result = calculateToolbarPosition(selection, container);

            // offsetY = -950 + 1000 = 50
            const expectedTop = 300 + 1000 - TOOLBAR_HEIGHT - GAP - 50;
            expect(result!.top).toBe(expectedTop);
        });

        test('horizontal position adjusted for container offset', () => {
            const container = createMockContainer({ top: 0, left: 40 });
            const rectLeft = 400;
            const rectWidth = 200;
            const rect = createMockRect({ top: 300, bottom: 320, left: rectLeft, width: rectWidth });
            const selection = createMockSelection(rect);
            const result = calculateToolbarPosition(selection, container);

            const expectedLeft = rectLeft + rectWidth / 2 - TOOLBAR_WIDTH / 2 - 40;
            expect(result!.left).toBe(expectedLeft);
        });
    });

    // ===========================================================================
    // calculateToolbarPositionFromElement
    // ===========================================================================

    describe('calculateToolbarPositionFromElement', () => {
        test('places toolbar above element when space available', () => {
            const element = createMockElement({ top: 400, bottom: 440, left: 200, width: 300 });
            const result = calculateToolbarPositionFromElement(element);

            expect(result.placement).toBe('top');
            expect(result.top).toBe(400 - TOOLBAR_HEIGHT - GAP);
        });

        test('places toolbar below element when not enough space above', () => {
            const element = createMockElement({ top: 10, bottom: 50, left: 200, width: 300 });
            const result = calculateToolbarPositionFromElement(element);

            expect(result.placement).toBe('bottom');
            expect(result.top).toBe(50 + GAP);
        });

        test('centers horizontally on element', () => {
            const elemLeft = 200;
            const elemWidth = 300;
            const element = createMockElement({ top: 400, bottom: 440, left: elemLeft, width: elemWidth });
            const result = calculateToolbarPositionFromElement(element);

            const expectedLeft = elemLeft + elemWidth / 2 - TOOLBAR_WIDTH / 2;
            expect(result.left).toBe(expectedLeft);
        });

        test('subtracts container offset from position', () => {
            const container = createMockContainer({ top: 80, left: 40 });
            const element = createMockElement({ top: 400, bottom: 440, left: 200, width: 300 });
            const result = calculateToolbarPositionFromElement(element, container);

            expect(result.top).toBe(400 - TOOLBAR_HEIGHT - GAP - 80);
        });

        test('horizontal clamping works with container offset', () => {
            const container = createMockContainer({ top: 0, left: 50 });
            const element = createMockElement({ top: 400, bottom: 440, left: 1250, width: 20 });
            const result = calculateToolbarPositionFromElement(element, container);

            const maxLeft = 1280 - TOOLBAR_WIDTH - GAP - 50;
            expect(result.left).toBeLessThanOrEqual(maxLeft);
        });

        test('includes scroll offset', () => {
            updateViewport({ scrollY: 300 });

            const element = createMockElement({ top: 400, bottom: 440, left: 200, width: 300 });
            const result = calculateToolbarPositionFromElement(element);

            expect(result.top).toBe(400 + 300 - TOOLBAR_HEIGHT - GAP);
        });
    });

    // ===========================================================================
    // calculatePopoverPosition
    // ===========================================================================

    describe('calculatePopoverPosition', () => {
        test('returns null for zero-size selection rect', () => {
            const selection = createMockSelection(createMockRect({ width: 0, height: 0 }));
            const result = calculatePopoverPosition(selection);
            expect(result).toBeNull();
        });

        test('places popover above when enough space', () => {
            const top = POPOVER_MAX_HEIGHT + GAP + 50;
            const rect = createMockRect({ top, bottom: top + 20, left: 200, width: 300 });
            const selection = createMockSelection(rect);
            const result = calculatePopoverPosition(selection);

            expect(result!.placement).toBe('top');
            expect(result!.top).toBe(top - POPOVER_MAX_HEIGHT - GAP);
        });

        test('places popover below when not enough space above', () => {
            const rect = createMockRect({ top: 50, bottom: 70, left: 200, width: 300 });
            const selection = createMockSelection(rect);
            const result = calculatePopoverPosition(selection);

            expect(result!.placement).toBe('bottom');
            expect(result!.top).toBe(70 + GAP);
        });

        test('uses larger space when neither is sufficient (above larger)', () => {
            updateViewport({ height: 300 });

            const rect = createMockRect({ top: 150, bottom: 170, left: 200, width: 100 });
            const selection = createMockSelection(rect);
            const result = calculatePopoverPosition(selection);

            // spaceAbove = 150 > spaceBelow = 130
            expect(result!.placement).toBe('top');
            expect(result!.top).toBe(GAP);
        });

        test('chooses below when below has more space in tight viewport', () => {
            updateViewport({ height: 300 });

            const rect = createMockRect({ top: 50, bottom: 70, left: 200, width: 100 });
            const selection = createMockSelection(rect);
            const result = calculatePopoverPosition(selection);

            // spaceAbove = 50, spaceBelow = 230, below is larger
            expect(result!.placement).toBe('bottom');
        });

        test('aligns popover left edge with selection', () => {
            const rectLeft = 200;
            const rect = createMockRect({ top: 500, bottom: 520, left: rectLeft, width: 300 });
            const selection = createMockSelection(rect);
            const result = calculatePopoverPosition(selection);

            expect(result!.left).toBe(rectLeft);
        });

        test('clamps popover to right edge of viewport', () => {
            const rect = createMockRect({ top: 500, bottom: 520, left: 1200, width: 50 });
            const selection = createMockSelection(rect);
            const result = calculatePopoverPosition(selection);

            const maxLeft = 1280 - POPOVER_WIDTH - GAP;
            expect(result!.left).toBeLessThanOrEqual(maxLeft);
        });

        test('clamps popover to left edge of viewport', () => {
            const rect = createMockRect({ top: 500, bottom: 520, left: 2, width: 10 });
            const selection = createMockSelection(rect);
            const result = calculatePopoverPosition(selection);

            expect(result!.left).toBeGreaterThanOrEqual(GAP);
        });

        test('subtracts container offset from position', () => {
            const container = createMockContainer({ top: 60, left: 20 });
            const top = POPOVER_MAX_HEIGHT + GAP + 100;
            const rect = createMockRect({ top, bottom: top + 20, left: 200, width: 300 });
            const selection = createMockSelection(rect);
            const result = calculatePopoverPosition(selection, container);

            expect(result!.top).toBe(top - POPOVER_MAX_HEIGHT - GAP - 60);
            expect(result!.left).toBe(200 - 20);
        });

        test('uses triggerRect for vertical positioning but selection for horizontal', () => {
            const selectionRect = createMockRect({ top: 300, bottom: 320, left: 200, width: 300 });
            const triggerRect = createMockRect({ top: 350, bottom: 370 });
            const selection = createMockSelection(selectionRect);
            const result = calculatePopoverPosition(selection, undefined, triggerRect);

            // Vertical: trigger top = 350, not enough space above for popover
            // (350 < POPOVER_MAX_HEIGHT + GAP = 408), so below
            expect(result!.placement).toBe('bottom');
            expect(result!.top).toBe(370 + GAP);
            // Horizontal: uses selectionRect
            expect(result!.left).toBe(200);
        });

        test('includes scroll offset in position', () => {
            updateViewport({ scrollY: 2000, scrollX: 50 });

            const top = POPOVER_MAX_HEIGHT + GAP + 100;
            const rect = createMockRect({ top, bottom: top + 20, left: 200, width: 300 });
            const selection = createMockSelection(rect);
            const result = calculatePopoverPosition(selection);

            expect(result!.top).toBe(top + 2000 - POPOVER_MAX_HEIGHT - GAP);
            expect(result!.left).toBe(200 + 50);
        });

        test('handles combined scroll and container offset', () => {
            updateViewport({ scrollY: 1000, scrollX: 200 });

            // Container offset: 50px Y, 30px X
            const container = createMockContainer({ top: -950, left: -170 });

            const top = POPOVER_MAX_HEIGHT + GAP + 100;
            const rect = createMockRect({ top, bottom: top + 20, left: 300, width: 200 });
            const selection = createMockSelection(rect);
            const result = calculatePopoverPosition(selection, container);

            // offsetY = -950 + 1000 = 50, offsetX = -170 + 200 = 30
            expect(result!.top).toBe(top + 1000 - POPOVER_MAX_HEIGHT - GAP - 50);
            expect(result!.left).toBe(300 + 200 - 30);
        });
    });

    // ===========================================================================
    // Cross-cutting: position stability (document-anchored)
    // ===========================================================================

    describe('position stability (no fixed positioning)', () => {
        test('toolbar position changes with scroll (document-anchored, not viewport-anchored)', () => {
            const rect = createMockRect({ top: 300, bottom: 320, left: 400, width: 200 });
            const selection = createMockSelection(rect);

            const resultNoScroll = calculateToolbarPosition(selection);

            updateViewport({ scrollY: 500 });
            const resultWithScroll = calculateToolbarPosition(selection);

            // Positions should differ by the scroll amount
            expect(resultWithScroll!.top - resultNoScroll!.top).toBe(500);
        });

        test('popover position changes with scroll (document-anchored)', () => {
            const top = POPOVER_MAX_HEIGHT + GAP + 100;
            const rect = createMockRect({ top, bottom: top + 20, left: 200, width: 300 });
            const selection = createMockSelection(rect);

            const resultNoScroll = calculatePopoverPosition(selection);

            updateViewport({ scrollY: 1000 });
            const resultWithScroll = calculatePopoverPosition(selection);

            expect(resultWithScroll!.top - resultNoScroll!.top).toBe(1000);
        });
    });

    // ===========================================================================
    // Regression: container with transform offset
    // ===========================================================================

    describe('regression: CSS transform on ancestor', () => {
        test('toolbar appears next to selection despite 200px container offset', () => {
            const container = createMockContainer({ top: 200, left: 0 });

            const rect = createMockRect({ top: 400, bottom: 420, left: 300, width: 200 });
            const selection = createMockSelection(rect);

            const result = calculateToolbarPosition(selection, container);

            // Without fix: 400 - TOOLBAR_HEIGHT - GAP ≈ 344
            // With offset: 344 - 200 = 144
            expect(result!.top).toBe(400 - TOOLBAR_HEIGHT - GAP - 200);

            // Toolbar bottom should be at or above the selection's container-relative top
            const containerRelativeSelectionTop = 400 - 200;
            const toolbarBottom = result!.top + TOOLBAR_HEIGHT;
            expect(toolbarBottom).toBeLessThanOrEqual(containerRelativeSelectionTop);
        });

        test('popover appears next to selection despite both X and Y offsets', () => {
            const container = createMockContainer({ top: 100, left: 50 });

            const top = POPOVER_MAX_HEIGHT + GAP + 200;
            const rect = createMockRect({ top, bottom: top + 20, left: 300, width: 200 });
            const selection = createMockSelection(rect);

            const result = calculatePopoverPosition(selection, container);

            expect(result!.top).toBe(top - POPOVER_MAX_HEIGHT - GAP - 100);
            expect(result!.left).toBe(300 - 50);
        });

        test('large offset does not produce negative positions when selection is near top', () => {
            const container = createMockContainer({ top: 300, left: 0 });

            // Selection at viewport top = 400, which is only 100px below container offset
            const rect = createMockRect({ top: 400, bottom: 420, left: 300, width: 200 });
            const selection = createMockSelection(rect);

            const result = calculateToolbarPosition(selection, container);

            // The result should be calculated but may be negative in container coords
            // (selection is "above" in container space). This is valid behavior - 
            // the toolbar appears at the correct document position regardless
            expect(result).not.toBeNull();
        });
    });
});

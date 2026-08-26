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
    getSelectionAnchorRect,
    calculateToolbarPosition,
    calculateExpandedToolbarPositionFromRect,
    calculateToolbarPositionFromElement,
    calculatePopoverPosition,
} from '../../src/content/selection-ui/utils/positioning.ts';
import { TOOLBAR_HEIGHT, TOOLBAR_WIDTH, POPOVER_WIDTH, POPOVER_MAX_HEIGHT, GAP, FAB_SIZE, EXPANDED_TOOLBAR_HEIGHT, EXPANDED_TOOLBAR_WIDTH } from '../../src/content/selection-ui/constants.ts';

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
function createMockSelection(rect: DOMRect, clientRects?: DOMRect[]): Selection {
    const mockRange = {
        getBoundingClientRect: () => rect,
        cloneRange: () => ({
            collapse: () => {},
            getBoundingClientRect: () =>
                createMockRect({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }),
        }),
        getClientRects: () =>
            ({
                length: (clientRects ?? [rect]).length,
                item: (i: number) => (clientRects ?? [rect])[i] ?? null,
                [Symbol.iterator]: function* () {
                    yield* (clientRects ?? [rect]);
                },
            }) as unknown as DOMRectList,
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

    describe('getSelectionAnchorRect', () => {
        test('uses the last line, not the union box', () => {
            const first = createMockRect({ top: 100, bottom: 120, left: 40, right: 180, width: 140, height: 20 });
            const last = createMockRect({ top: 280, bottom: 300, left: 40, right: 420, width: 380, height: 20 });
            const union = createMockRect({ top: 100, bottom: 300, left: 40, right: 420, width: 380, height: 200 });
            const selection = createMockSelection(union, [first, last]);
            const range = selection.getRangeAt(0);
            const anchor = getSelectionAnchorRect(range);
            expect(anchor!.top).toBe(280);
            expect(anchor!.right).toBe(420);
        });

        test('ignores zero-size interstitial rects', () => {
            const first = createMockRect({ top: 100, bottom: 120, left: 40, right: 200, width: 160, height: 20 });
            const gap = createMockRect({ top: 120, bottom: 120, left: 40, right: 800, width: 760, height: 0 });
            const last = createMockRect({ top: 140, bottom: 160, left: 40, right: 300, width: 260, height: 20 });
            const selection = createMockSelection(first, [first, gap, last]);
            const anchor = getSelectionAnchorRect(selection.getRangeAt(0));
            expect(anchor!.top).toBe(140);
            expect(anchor!.width).toBe(260);
        });

        test('merges fragments on the same visual line', () => {
            const a = createMockRect({ top: 200, bottom: 220, left: 10, right: 80, width: 70, height: 20 });
            const b = createMockRect({ top: 201, bottom: 221, left: 80, right: 150, width: 70, height: 20 });
            const selection = createMockSelection(a, [a, b]);
            const anchor = getSelectionAnchorRect(selection.getRangeAt(0));
            expect(anchor!.left).toBe(10);
            expect(anchor!.right).toBe(150);
        });

        test('ignores a full-width block box so the FAB is not parked at the column edge', () => {
            const text = createMockRect({
                top: 360, bottom: 380, left: 80, right: 240, width: 160, height: 20, x: 80, y: 360,
            });
            const block = createMockRect({
                top: 360, bottom: 380, left: 40, right: 1100, width: 1060, height: 20, x: 40, y: 360,
            });
            const selection = createMockSelection(block, [text, block]);
            const anchor = getSelectionAnchorRect(selection.getRangeAt(0));
            expect(anchor!.right).toBe(240);
            expect(anchor!.right).toBeLessThan(400);
        });
    });

    describe('calculateToolbarPosition (collapsed FAB)', () => {
        test('returns null for zero-size selection rect', () => {
            const selection = createMockSelection(createMockRect({ width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 }));
            const result = calculateToolbarPosition(selection);
            expect(result).toBeNull();
        });

        test('places FAB to the right of the last line, vertically centered', () => {
            const last = createMockRect({ top: 300, bottom: 320, left: 400, right: 600, width: 200, height: 20 });
            const selection = createMockSelection(last);
            const result = calculateToolbarPosition(selection);

            expect(result).not.toBeNull();
            expect(result!.left).toBe(600 + GAP);
            expect(result!.top).toBe(300 + (20 - FAB_SIZE) / 2);
        });

        test('places FAB next to short list text, not at the far right of a block box', () => {
            const text = createMockRect({
                top: 360, bottom: 380, left: 80, right: 220, width: 140, height: 20, x: 80, y: 360,
            });
            const block = createMockRect({
                top: 360, bottom: 380, left: 40, right: 1100, width: 1060, height: 20, x: 40, y: 360,
            });
            const selection = createMockSelection(block, [text, block]);
            const result = calculateToolbarPosition(selection);
            expect(result!.left).toBe(220 + GAP);
        });

        test('does not use the union-box center on a multi-line list', () => {
            const first = createMockRect({ top: 200, bottom: 220, left: 80, right: 260, width: 180, height: 20, x: 80, y: 200 });
            const last = createMockRect({ top: 360, bottom: 380, left: 80, right: 500, width: 420, height: 20, x: 80, y: 360 });
            const union = createMockRect({ top: 200, bottom: 380, left: 80, right: 500, width: 420, height: 180, x: 80, y: 200 });
            const selection = createMockSelection(union, [first, last]);
            const result = calculateToolbarPosition(selection);

            const unionCenterLeft = union.left + union.width / 2 - TOOLBAR_WIDTH / 2;
            expect(result!.left).toBe(last.right + GAP);
            expect(result!.left).not.toBe(unionCenterLeft);
            expect(result!.top).toBe(360 + (20 - FAB_SIZE) / 2);
        });

        test('flips to the left of the line when there is no room on the right', () => {
            const rect = createMockRect({ top: 300, bottom: 320, left: 1220, right: 1270, width: 50, height: 20 });
            const selection = createMockSelection(rect);
            const result = calculateToolbarPosition(selection);

            expect(result!.left).toBe(1220 - FAB_SIZE - GAP);
        });

        test('clamps FAB to viewport edges', () => {
            const rect = createMockRect({ top: 300, bottom: 320, left: 5, width: 30, right: 35 });
            const selection = createMockSelection(rect);
            const result = calculateToolbarPosition(selection);

            expect(result!.left).toBeGreaterThanOrEqual(GAP);
            expect(result!.left + FAB_SIZE).toBeLessThanOrEqual(1280 - GAP);
        });

        test('includes scroll offset in position (no container)', () => {
            updateViewport({ scrollY: 500, scrollX: 100 });

            const rect = createMockRect({ top: 300, bottom: 320, left: 400, right: 600, width: 200, height: 20 });
            const selection = createMockSelection(rect);
            const result = calculateToolbarPosition(selection);

            expect(result!.top).toBe(300 + (20 - FAB_SIZE) / 2 + 500);
            expect(result!.left).toBe(600 + GAP + 100);
        });

        test('subtracts container offset from position', () => {
            const container = createMockContainer({ top: 50, left: 30 });
            const rect = createMockRect({ top: 300, bottom: 320, left: 400, right: 600, width: 200, height: 20 });
            const selection = createMockSelection(rect);
            const result = calculateToolbarPosition(selection, container);

            expect(result!.top).toBe(300 + (20 - FAB_SIZE) / 2 - 50);
            expect(result!.left).toBe(600 + GAP - 30);
        });
    });

    describe('calculateExpandedToolbarPositionFromRect', () => {
        test('places toolbar below the last line so it does not cover the selection', () => {
            const rect = createMockRect({ top: 300, bottom: 320, left: 400, width: 200, right: 600 });
            const result = calculateExpandedToolbarPositionFromRect(rect);

            expect(result.placement).toBe('bottom');
            expect(result.top).toBe(320 + GAP);
        });

        test('places toolbar above when there is not enough space below', () => {
            const rect = createMockRect({ top: 700, bottom: 780, left: 400, width: 200, right: 600 });
            const result = calculateExpandedToolbarPositionFromRect(rect);

            expect(result.placement).toBe('top');
            expect(result.top).toBe(700 - EXPANDED_TOOLBAR_HEIGHT - GAP);
        });

        test('aligns with the FAB when provided', () => {
            const rect = createMockRect({ top: 300, bottom: 320, left: 80, width: 200, right: 280 });
            const fab = { top: 290, left: 288, placement: 'bottom' as const };
            const result = calculateExpandedToolbarPositionFromRect(rect, undefined, undefined, fab);

            expect(result.left).toBe(288);
        });

        test('aligns to the line start when no FAB is given', () => {
            const rectLeft = 400;
            const rect = createMockRect({ top: 300, bottom: 320, left: rectLeft, width: 200, right: 600 });
            const result = calculateExpandedToolbarPositionFromRect(rect);

            expect(result.left).toBe(rectLeft);
        });

        test('uses measured chrome height instead of the 48px compact constant', () => {
            const rect = createMockRect({ top: 700, bottom: 720, left: 400, width: 200, right: 600 });
            const result = calculateExpandedToolbarPositionFromRect(rect, undefined, {
                width: EXPANDED_TOOLBAR_WIDTH,
                height: EXPANDED_TOOLBAR_HEIGHT,
            });

            expect(result.top).toBe(700 - EXPANDED_TOOLBAR_HEIGHT - GAP);
            expect(result.top).not.toBe(700 - TOOLBAR_HEIGHT - GAP);
        });
    });

    // ===========================================================================
    // calculateToolbarPositionFromElement
    // ===========================================================================

    describe('calculateToolbarPositionFromElement', () => {
        test('places FAB to the right of the element', () => {
            const element = createMockElement({ top: 400, bottom: 440, left: 200, right: 500, width: 300, height: 40 });
            const result = calculateToolbarPositionFromElement(element);

            expect(result.left).toBe(500 + GAP);
            expect(result.top).toBe(400 + (40 - FAB_SIZE) / 2);
        });

        test('subtracts container offset from position', () => {
            const container = createMockContainer({ top: 80, left: 40 });
            const element = createMockElement({ top: 400, bottom: 440, left: 200, right: 500, width: 300, height: 40 });
            const result = calculateToolbarPositionFromElement(element, container);

            expect(result.top).toBe(400 + (40 - FAB_SIZE) / 2 - 80);
            expect(result.left).toBe(500 + GAP - 40);
        });

        test('includes scroll offset', () => {
            updateViewport({ scrollY: 300 });

            const element = createMockElement({ top: 400, bottom: 440, left: 200, right: 500, width: 300, height: 40 });
            const result = calculateToolbarPositionFromElement(element);

            expect(result.top).toBe(400 + (40 - FAB_SIZE) / 2 + 300);
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
            const rect = createMockRect({ top: 300, bottom: 320, left: 400, right: 600, width: 200, height: 20 });
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
        test('FAB appears next to selection despite 200px container offset', () => {
            const container = createMockContainer({ top: 200, left: 0 });

            const rect = createMockRect({ top: 400, bottom: 420, left: 300, right: 500, width: 200, height: 20 });
            const selection = createMockSelection(rect);

            const result = calculateToolbarPosition(selection, container);

            expect(result!.top).toBe(400 + (20 - FAB_SIZE) / 2 - 200);
            expect(result!.left).toBe(500 + GAP);
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

            expect(result).not.toBeNull();
        });
    });
});

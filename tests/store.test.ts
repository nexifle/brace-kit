import { describe, expect, it, mock, beforeEach } from "bun:test";
import { useStore } from "../src/store/index.ts";

describe("store - configuration toggles", () => {
  beforeEach(() => {
    // Mock chrome storage API which is called by saveToStorage
    globalThis.chrome = {
      storage: {
        local: {
          get: mock(() => Promise.resolve({})),
          set: mock((data) => Promise.resolve()),
          remove: mock(() => Promise.resolve()),
        },
        session: {
          get: mock(() => Promise.resolve({})),
          set: mock(() => Promise.resolve()),
          remove: mock(() => Promise.resolve()),
        }
      }
    } as any;

    // Reset store state
    const store = useStore.getState();
    store.setEnableReasoning(false);
    store.setEnableGoogleSearch(false);
  });

  it("should toggle enableReasoning and persist via saveToStorage", async () => {
    const store = useStore.getState();
    const chromeSetSpy = globalThis.chrome.storage.local.set;
    
    expect(store.enableReasoning).toBe(false);

    // Call the newly updated action
    store.setEnableReasoning(true);

    // Assert the state changes
    expect(useStore.getState().enableReasoning).toBe(true);

    // Assert that saveToStorage successfully called chrome.storage.local.set
    // We expect the spy to have been called with the new config values
    expect(chromeSetSpy).toHaveBeenCalled();
  });

  it("should toggle enableGoogleSearch and persist via saveToStorage", async () => {
    const store = useStore.getState();
    const chromeSetSpy = globalThis.chrome.storage.local.set;
    
    expect(store.enableGoogleSearch).toBe(false);

    // Call the updated action
    store.setEnableGoogleSearch(true);

    // Assert the state
    expect(useStore.getState().enableGoogleSearch).toBe(true);

    // Assert storage save
    expect(chromeSetSpy).toHaveBeenCalled();
  });
});

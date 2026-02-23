import { describe, expect, it } from "bun:test";
import { formatRequest, PROVIDER_PRESETS } from "../src/providers";
import type { Message } from "../src/types/index.ts";

describe("providers - formatAnthropic", () => {
  it("should handle undefined enableReasoning correctly", () => {
    const provider = {
      ...PROVIDER_PRESETS.anthropic,
      apiKey: "test-api-key",
      model: "claude-3-5-sonnet-20241022",
    };

    const messages: Message[] = [
      { role: "user", content: "Hello" }
    ];

    // Testing when options is empty / undefined enableReasoning
    const config = formatRequest(provider, messages, [], {});
    const body = JSON.parse((config.options as any).body);

    // Should NOT have thinking property since enableReasoning is falsy
    expect(body.thinking).toBeUndefined();
  });

  it("should enable reasoning if enableReasoning is true and model supports it", () => {
    const provider = {
      ...PROVIDER_PRESETS.anthropic,
      apiKey: "test-api-key",
      model: "claude-3-7-sonnet-20250219", // A Claude model (supports reasoning as per REASONING_MODELS.anthropic)
    };

    const messages: Message[] = [
      { role: "user", content: "Hello" }
    ];

    const config = formatRequest(provider, messages, [], { enableReasoning: true });
    const body = JSON.parse((config.options as any).body);

    // Should have thinking property enabled
    expect(body.thinking).toBeDefined();
    expect(body.thinking.type).toBe("enabled");
  });
});

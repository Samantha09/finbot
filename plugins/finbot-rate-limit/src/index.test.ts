import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import plugin from "./index.js";
import { unpatchFetch } from "./fetch-patch.js";

describe("finbot-rate-limit plugin", () => {
  let registeredTools: Array<{ name: string; execute: Function }> = [];
  let originalFetch: typeof fetch;

  beforeEach(() => {
    registeredTools = [];
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    // Clean up any patched fetch
    unpatchFetch();
    globalThis.fetch = originalFetch;
  });

  it("should register and wrap tools", () => {
    const originalRegisterTool = vi.fn((tool: { name: string; execute: Function }) => {
      registeredTools.push(tool);
    });
    const api = {
      registerTool: originalRegisterTool,
    };

    plugin.register(api as unknown as Parameters<typeof plugin.register>[0]);

    const mockTool = {
      name: "marketQuery",
      label: "Market Query",
      description: "Query market data",
      parameters: { type: "object", properties: {} },
      execute: vi.fn().mockResolvedValue({ content: [] }),
    };

    api.registerTool(mockTool);

    expect(registeredTools).toHaveLength(1);
    expect(registeredTools[0].name).toBe("marketQuery");
    // The wrapped tool should have a different execute function
    expect(registeredTools[0].execute).not.toBe(mockTool.execute);
  });

  it("should pass through function tools without wrapping", () => {
    const originalRegisterTool = vi.fn();
    const api = {
      registerTool: originalRegisterTool,
    };

    plugin.register(api as unknown as Parameters<typeof plugin.register>[0]);

    const fnTool = vi.fn();
    api.registerTool(fnTool);

    expect(originalRegisterTool).toHaveBeenCalledWith(fnTool, undefined);
  });
});

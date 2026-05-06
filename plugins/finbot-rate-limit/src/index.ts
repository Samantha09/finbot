import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { TokenBucket } from "./token-bucket.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { patchFetch, runWithToolContext } from "./fetch-patch.js";
import { mergeConfig } from "./config.js";
import type { RateLimitConfig } from "./types.js";

export default definePluginEntry({
  id: "finbot-rate-limit",
  name: "FinBot Rate Limit",
  description: "FinBot 限流熔断插件，为金融 API 提供统一限流、退避和熔断保护",
  register(api) {
    const config = mergeConfig((api as unknown as { config?: Partial<RateLimitConfig> }).config);

    // Build domain buckets
    const domainBuckets: Record<string, TokenBucket> = {};
    for (const [domain, bucketConfig] of Object.entries(config.domainBuckets)) {
      domainBuckets[domain] = new TokenBucket(bucketConfig);
    }

    // Build circuit breakers
    const circuitBreakers: Record<string, CircuitBreaker> = {};
    for (const domain of Object.keys(config.domainBuckets)) {
      circuitBreakers[domain] = new CircuitBreaker(config.circuit);
    }

    // Tool bucket (shared across all tools)
    const toolBucket = new TokenBucket(config.toolBucket);

    // Patch global fetch
    patchFetch({ domainBuckets, circuitBreakers, retryConfig: config.retry });

    const originalRegisterTool = api.registerTool.bind(api);

    api.registerTool = (tool: AnyAgentTool | Function, opts?) => {
      if (typeof tool === "function") {
        originalRegisterTool(tool as unknown as AnyAgentTool, opts);
        return;
      }

      const wrappedTool = {
        ...tool,
        execute: async (toolCallId: string, params: Record<string, unknown>) => {
          // Acquire tool-level token
          await toolBucket.acquire();
          // Set tool context for fetch patch
          return await runWithToolContext(tool.name, () => tool.execute(toolCallId, params));
        },
      };

      originalRegisterTool(wrappedTool, opts);
    };
  },
});

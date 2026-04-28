import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "openclaw/plugin-sdk/core": path.resolve(
        __dirname,
        "src/__mocks__/openclaw-plugin-sdk-core.ts",
      ),
      "openclaw/plugin-sdk/plugin-entry": path.resolve(
        __dirname,
        "src/__mocks__/openclaw-plugin-sdk-plugin-entry.ts",
      ),
    },
  },
});

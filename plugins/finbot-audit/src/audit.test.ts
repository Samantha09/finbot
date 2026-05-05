import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { withAudit } from "./audit.js";
import type { AnyAgentTool } from "./types.js";

const TEST_LOG_DIR = path.join(process.env.HOME || "/tmp", ".openclaw", "audit-logs-test");

async function cleanTestLogs() {
  try {
    const files = await fs.readdir(TEST_LOG_DIR);
    for (const f of files) {
      await fs.unlink(path.join(TEST_LOG_DIR, f));
    }
    await fs.rmdir(TEST_LOG_DIR);
  } catch {
    // ignore
  }
}

async function readLatestLog(): Promise<string[]> {
  const files = await fs.readdir(TEST_LOG_DIR);
  const latest = files.sort().pop();
  if (!latest) return [];
  const content = await fs.readFile(path.join(TEST_LOG_DIR, latest), "utf-8");
  return content.trim().split("\n").filter(Boolean);
}

describe("withAudit", () => {
  beforeEach(async () => {
    await cleanTestLogs();
  });

  afterEach(async () => {
    await cleanTestLogs();
  });

  const mockTool: AnyAgentTool = {
    name: "testTool",
    label: "Test Tool",
    description: "A test tool",
    parameters: { type: "object", properties: {} },
    execute: async (_id, params) => {
      if ((params as any).fail) throw new Error("intentional failure");
      return { content: [{ type: "text" as const, text: `result: ${JSON.stringify(params)}` }], details: {} };
    },
  };

  it("包装后的 execute 返回原结果", async () => {
    const wrapped = withAudit(mockTool, "test-plugin", { logDir: TEST_LOG_DIR });
    const result = await wrapped.execute("tc1", { symbol: "AAPL" });
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("AAPL");
  });

  it("成功调用写入 audit 日志", async () => {
    const wrapped = withAudit(mockTool, "test-plugin", { logDir: TEST_LOG_DIR });
    await wrapped.execute("tc1", { symbol: "AAPL" });

    const lines = await readLatestLog();
    expect(lines.length).toBe(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.plugin_id).toBe("test-plugin");
    expect(entry.tool).toBe("testTool");
    expect(entry.status).toBe("success");
    expect(entry.level).toBe("info");
    expect(entry.duration_ms).toBeGreaterThanOrEqual(0);
    expect(entry.input_preview).toContain("AAPL");
    expect(entry.error).toBeNull();
  });

  it("失败调用写入 error 日志", async () => {
    const wrapped = withAudit(mockTool, "test-plugin", { logDir: TEST_LOG_DIR });
    await expect(wrapped.execute("tc2", { fail: true })).rejects.toThrow("intentional failure");

    const lines = await readLatestLog();
    expect(lines.length).toBe(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.status).toBe("error");
    expect(entry.level).toBe("error");
    expect(entry.error).toContain("intentional failure");
  });

  it("截断超长 output", async () => {
    const longTool: AnyAgentTool = {
      name: "longTool",
      label: "Long Tool",
      description: "...",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ content: [{ type: "text" as const, text: "x".repeat(1000) }], details: {} }),
    };

    const wrapped = withAudit(longTool, "test-plugin", { logDir: TEST_LOG_DIR, maxOutputLength: 50 });
    await wrapped.execute("tc3", {});

    const lines = await readLatestLog();
    const entry = JSON.parse(lines[0]);
    expect(entry.output_preview).toContain("...[truncated]");
    expect(entry.output_preview.length).toBeLessThan(100);
  });
});

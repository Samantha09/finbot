import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { withAudit, readAuditLogs, formatAuditReport } from "./audit.js";
import type { AnyAgentTool, AuditLogEntry } from "./types.js";

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

describe("readAuditLogs", () => {
  beforeEach(async () => {
    await cleanTestLogs();
  });

  afterEach(async () => {
    await cleanTestLogs();
  });

  async function writeMockEntries(entries: AuditLogEntry[]) {
    await fs.mkdir(TEST_LOG_DIR, { recursive: true });
    const filePath = path.join(TEST_LOG_DIR, "2026-05-05.jsonl");
    const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await fs.appendFile(filePath, lines, "utf-8");
  }

  it("空日志返回空报告", async () => {
    const report = await readAuditLogs({ date: "2026-05-05" }, { logDir: TEST_LOG_DIR });
    expect(report.total).toBe(0);
    expect(report.successCount).toBe(0);
    expect(report.errorCount).toBe(0);
    expect(report.avgDurationMs).toBe(0);
  });

  it("按日期读取日志", async () => {
    await writeMockEntries([
      { timestamp: "2026-05-05T10:00:00Z", level: "info", plugin_id: "p1", tool: "t1", duration_ms: 10, status: "success", input_preview: "{}", output_preview: "", error: null },
      { timestamp: "2026-05-05T10:01:00Z", level: "info", plugin_id: "p1", tool: "t2", duration_ms: 20, status: "error", input_preview: "{}", output_preview: "", error: "fail" },
    ]);

    const report = await readAuditLogs({ date: "2026-05-05" }, { logDir: TEST_LOG_DIR });
    expect(report.total).toBe(2);
    expect(report.successCount).toBe(1);
    expect(report.errorCount).toBe(1);
    expect(report.avgDurationMs).toBe(15);
  });

  it("按工具名过滤", async () => {
    await writeMockEntries([
      { timestamp: "2026-05-05T10:00:00Z", level: "info", plugin_id: "p1", tool: "marketQuery", duration_ms: 10, status: "success", input_preview: "{}", output_preview: "", error: null },
      { timestamp: "2026-05-05T10:01:00Z", level: "info", plugin_id: "p1", tool: "etfAnalysis", duration_ms: 20, status: "success", input_preview: "{}", output_preview: "", error: null },
    ]);

    const report = await readAuditLogs({ date: "2026-05-05", tool: "marketQuery" }, { logDir: TEST_LOG_DIR });
    expect(report.total).toBe(1);
    expect(report.entries[0].tool).toBe("marketQuery");
  });

  it("按状态过滤", async () => {
    await writeMockEntries([
      { timestamp: "2026-05-05T10:00:00Z", level: "info", plugin_id: "p1", tool: "t1", duration_ms: 10, status: "success", input_preview: "{}", output_preview: "", error: null },
      { timestamp: "2026-05-05T10:01:00Z", level: "error", plugin_id: "p1", tool: "t2", duration_ms: 20, status: "error", input_preview: "{}", output_preview: "", error: "fail" },
    ]);

    const report = await readAuditLogs({ date: "2026-05-05", status: "error" }, { logDir: TEST_LOG_DIR });
    expect(report.total).toBe(1);
    expect(report.entries[0].status).toBe("error");
  });

  it("限制返回条数", async () => {
    const entries: AuditLogEntry[] = Array.from({ length: 10 }, (_, i) => ({
      timestamp: `2026-05-05T10:0${i}:00Z`,
      level: "info",
      plugin_id: "p1",
      tool: `t${i}`,
      duration_ms: i,
      status: "success",
      input_preview: "{}",
      output_preview: "",
      error: null,
    }));
    await writeMockEntries(entries);

    const report = await readAuditLogs({ date: "2026-05-05", limit: 3 }, { logDir: TEST_LOG_DIR });
    expect(report.total).toBe(3);
    expect(report.entries[0].tool).toBe("t7");
    expect(report.entries[2].tool).toBe("t9");
  });
});

describe("formatAuditReport", () => {
  it("空报告格式化", () => {
    const text = formatAuditReport({ total: 0, successCount: 0, errorCount: 0, avgDurationMs: 0, entries: [] }, "2026-05-05");
    expect(text).toContain("暂无审计日志");
  });

  it("非空报告格式化", () => {
    const report = {
      total: 2,
      successCount: 1,
      errorCount: 1,
      avgDurationMs: 15,
      entries: [
        { timestamp: "2026-05-05T10:00:00Z", level: "info", plugin_id: "p1", tool: "marketQuery", duration_ms: 10, status: "success", input_preview: "{symbol:AAPL}", output_preview: "ok", error: null },
        { timestamp: "2026-05-05T10:01:00Z", level: "error", plugin_id: "p1", tool: "marketQuery", duration_ms: 20, status: "error", input_preview: "{symbol:TSLA}", output_preview: "", error: "timeout" },
      ],
    };
    const text = formatAuditReport(report as import("./audit.js").AuditReport, "2026-05-05");
    expect(text).toContain("总计: 2 次调用");
    expect(text).toContain("✅ marketQuery");
    expect(text).toContain("❌ marketQuery");
    expect(text).toContain("timeout");
  });
});

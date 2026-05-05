import type { GuardOptions, RiskScore, RiskLevel } from "./types.js";

const DEFAULT_HIGH_RISK_KEYWORDS: string[] = [
  "私钥",
  "private key",
  "password",
  "密码",
  "api_key",
  "secret",
  "token",
  "密钥",
  "秘钥",
];

const DEFAULT_MEDIUM_RISK_KEYWORDS: string[] = [
  "转账",
  "transfer funds",
  "withdraw",
  "提现",
  "汇款",
  "忽略之前指令",
  "ignore previous instructions",
  "forget your instructions",
  "忘记你的指令",
  "disregard earlier",
];

const ESCAPE_PATTERNS: RegExp[] = [
  /忽略之前.{0,10}指令/,
  /forget\s+your\s+instructions/i,
  /disregard\s+(earlier|previous|all\s+prior)/i,
  /ignore\s+(previous|earlier|all\s+prior)\s+instructions/i,
];

function normalizeValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function containsKeyword(text: string, keywords: string[]): string | null {
  const lowerText = text.toLowerCase();
  for (const kw of keywords) {
    if (lowerText.includes(kw.toLowerCase())) {
      return kw;
    }
  }
  return null;
}

function matchesEscapePattern(text: string): boolean {
  return ESCAPE_PATTERNS.some((pattern) => pattern.test(text));
}

function hasFieldTypeAnomaly(text: string): boolean {
  const chineseChars = text.match(/[一-龥]/g);
  return (chineseChars ? chineseChars.length : 0) >= 2 && text.length > 20;
}

function determineLevel(score: number): RiskLevel {
  if (score < 20) {
    return "low";
  }
  if (score <= 59) {
    return "medium";
  }
  return "high";
}

export function scoreToolParams(
  _toolName: string,
  params: Record<string, unknown>,
  options?: GuardOptions,
): RiskScore {
  if (options?.detectionMode === "off") {
    return { score: 0, level: "low", reasons: [] };
  }

  let score = 0;
  const reasons: string[] = [];

  const highRiskKeywords = [
    ...DEFAULT_HIGH_RISK_KEYWORDS,
    ...(options?.customHighRiskKeywords ?? []),
  ];
  const mediumRiskKeywords = [
    ...DEFAULT_MEDIUM_RISK_KEYWORDS,
    ...(options?.customMediumRiskKeywords ?? []),
  ];

  for (const value of Object.values(params)) {
    const text = normalizeValue(value);

    if (text.length > 200) {
      score += 20;
      reasons.push("参数长度超过 200 字符");
    }

    const highRiskKeyword = containsKeyword(text, highRiskKeywords);
    if (highRiskKeyword) {
      score += 60;
      reasons.push(`命中高危关键词: "${highRiskKeyword}"`);
      continue;
    }

    const mediumRiskKeyword = containsKeyword(text, mediumRiskKeywords);
    if (mediumRiskKeyword) {
      score += 20;
      reasons.push(`命中中危关键词: "${mediumRiskKeyword}"`);
    }

    if (matchesEscapePattern(text)) {
      score += 30;
      reasons.push("检测到提示词逃逸模式");
    }

    if (hasFieldTypeAnomaly(text)) {
      score += 30;
      reasons.push("参数包含异常中文长文本");
    }
  }

  const cappedScore = Math.min(score, 100);
  return {
    score: cappedScore,
    level: determineLevel(cappedScore),
    reasons,
  };
}

import type { GuardOptions, RiskScore, RiskLevel } from "./types.js";

const DEFAULT_SENSITIVE_FIELDS: string[] = [
  "apiKey", "token", "password", "secret", "auth",
  "balance", "amount", "totalAsset", "assets",
  "phone", "mobile", "tel",
  "idCard", "ssn", "idNumber",
  "email", "mail",
  "bankCard", "cardNumber", "cardNo",
];

const PHONE_PATTERN = /(?:\+86[-\s]?)?1[3-9]\d{9}/g;
const IDCARD_PATTERN = /\d{17}[\dXx]/g;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

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

function maskPhone(value: string): string {
  return value.replace(/(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

function maskIdCard(value: string): string {
  return value.replace(/^(\d{6})\d{8}(\d{3}[\dXx])$/, "$1********$2");
}

function maskEmail(value: string): string {
  const atIndex = value.indexOf("@");
  if (atIndex <= 0) return value;
  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex);
  const visible = Math.min(3, local.length);
  const maskedLocal = local.slice(0, visible) + "***";
  return maskedLocal + domain;
}

function maskBankCard(value: string): string {
  return value.replace(/^(\d{4})\d+(\d{4})$/, "$1***********$2");
}

function maskSecret(value: string): string {
  if (value.length <= 6) return "***";
  return value.slice(0, 3) + "***" + value.slice(-3);
}

function maskFinancial(_value: string): string {
  return "***";
}

function getFieldMask(fieldName: string): ((value: string) => string) | null {
  const lower = fieldName.toLowerCase();
  if (["apikey", "token", "password", "secret", "auth"].some((k) => lower.includes(k))) {
    return maskSecret;
  }
  if (["balance", "amount", "totalasset", "assets"].some((k) => lower.includes(k))) {
    return maskFinancial;
  }
  if (["phone", "mobile", "tel"].some((k) => lower === k || lower.endsWith(k))) {
    return maskPhone;
  }
  if (["idcard", "ssn", "idnumber"].some((k) => lower.includes(k))) {
    return maskIdCard;
  }
  if (["email", "mail"].some((k) => lower === k || lower.endsWith(k))) {
    return maskEmail;
  }
  if (["bankcard", "cardnumber", "cardno"].some((k) => lower.includes(k))) {
    return maskBankCard;
  }
  return null;
}

function sanitizeText(text: string): string {
  let result = text;
  result = result.replace(IDCARD_PATTERN, (match) => maskIdCard(match));
  result = result.replace(PHONE_PATTERN, (match) => {
    const digits = match.replace(/\D/g, "");
    return maskPhone(digits);
  });
  result = result.replace(EMAIL_PATTERN, (match) => maskEmail(match));
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeValue(value: unknown, sensitiveFields: string[]): unknown {
  if (typeof value === "string") {
    const sanitized = sanitizeText(value);
    return sanitized;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, sensitiveFields));
  }
  if (isPlainObject(value)) {
    return sanitizeDetails(value, sensitiveFields);
  }
  return value;
}

function sanitizeDetails(
  details: Record<string, unknown>,
  sensitiveFields: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    const maskFn = getFieldMask(key);
    const isSensitive = sensitiveFields.includes(key) || maskFn !== null;
    if (isSensitive && typeof value === "string" && maskFn) {
      result[key] = maskFn(value);
    } else if (isSensitive && typeof value === "string" && !maskFn) {
      result[key] = maskSecret(value);
    } else if (typeof value === "string") {
      result[key] = sanitizeText(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => sanitizeValue(item, sensitiveFields));
    } else if (isPlainObject(value)) {
      result[key] = sanitizeDetails(value, sensitiveFields);
    } else {
      result[key] = value;
    }
  }
  return result;
}

interface TextContentItem {
  type: string;
  text: string;
}

interface AgentToolResult {
  content: TextContentItem[];
  details: Record<string, unknown>;
}

export function sanitizeToolResult(
  result: AgentToolResult,
  options?: GuardOptions,
): AgentToolResult {
  const sensitiveFields = [
    ...DEFAULT_SENSITIVE_FIELDS,
    ...(options?.sensitiveFields ?? []),
  ];

  const sanitizedContent = result.content.map((item) => {
    if (item.type === "text" && typeof item.text === "string") {
      return { ...item, text: sanitizeText(item.text) };
    }
    return { ...item };
  });

  const sanitizedDetails = sanitizeDetails(result.details, sensitiveFields);

  return {
    content: sanitizedContent,
    details: sanitizedDetails,
  };
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

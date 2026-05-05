export interface GuardOptions {
  detectionMode?: "keyword" | "off";
  customHighRiskKeywords?: string[];
  customMediumRiskKeywords?: string[];
  sensitiveFields?: string[];
}

export type RiskLevel = "low" | "medium" | "high";

export interface RiskScore {
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface SanitizeRule {
  fieldNames: string[];
  pattern?: RegExp;
  mask: (value: string) => string;
}

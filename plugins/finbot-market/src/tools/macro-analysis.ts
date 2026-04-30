import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const MacroAnalysisSchema = {
  type: "object" as const,
  properties: {
    category: {
      type: "string" as const,
      enum: ["all", "inflation", "monetary", "growth", "external", "us"],
      description: "指标分类，默认 all。us 为美国宏观经济指标",
    },
  },
};

export interface IndicatorConfig {
  name: string;
  reportName: string;
  valueField: string;
  valueFormatter: (v: number) => string;
  yoyChangeField: string | null;
  momChangeField: string | null;
  yoyUnit: "pp" | "%";
  momUnit: "pp" | "%";
}

export interface MacroDataPoint {
  name: string;
  value: string;
  yoy: string | null;
  mom: string | null;
}

export interface CategoryData {
  category: string;
  indicators: MacroDataPoint[];
}

async function fetchDatacenterRows(reportName: string): Promise<Array<Record<string, unknown>>> {
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=${reportName}&columns=ALL&pageNumber=1&pageSize=50&sortColumns=REPORT_DATE&sortTypes=-1`;
  const response = await fetch(url);
  const json = await response.json();
  if (!json.result?.data || !Array.isArray(json.result.data)) {
    throw new Error(`${reportName} 数据为空`);
  }
  return json.result.data;
}

function formatChange(value: number, unit: "pp" | "%"): string {
  const sign = value >= 0 ? "+" : "";
  const fixed = value.toFixed(2);
  const trimmed = fixed.replace(/\.?0+$/, "");
  return `${sign}${trimmed}${unit}`;
}

export function parseIndicatorRows(
  rows: Array<Record<string, unknown>>,
  config: IndicatorConfig,
): MacroDataPoint {
  if (rows.length === 0) {
    return { name: config.name, value: "数据暂缺", yoy: null, mom: null };
  }

  const latest = rows[0];
  const prev = rows.length > 1 ? rows[1] : null;

  const rawValue = latest[config.valueField];
  const value = rawValue !== undefined && rawValue !== null
    ? config.valueFormatter(Number(rawValue))
    : "数据暂缺";

  if (value === "数据暂缺") {
    return { name: config.name, value, yoy: null, mom: null };
  }

  let yoy: string | null = null;
  if (config.yoyChangeField && latest[config.yoyChangeField] !== undefined && latest[config.yoyChangeField] !== null) {
    yoy = formatChange(Number(latest[config.yoyChangeField]), config.yoyUnit);
  } else if (prev && config.valueField && latest[config.valueField] !== undefined && prev[config.valueField] !== undefined) {
    const curr = Number(latest[config.valueField]);
    const pre = Number(prev[config.valueField]);
    const diff = +(curr - pre).toFixed(2);
    yoy = formatChange(diff, config.yoyUnit);
  }

  let mom: string | null = null;
  if (config.momChangeField && latest[config.momChangeField] !== undefined && latest[config.momChangeField] !== null) {
    mom = formatChange(Number(latest[config.momChangeField]), config.momUnit);
  } else if (prev && config.valueField && latest[config.valueField] !== undefined && prev[config.valueField] !== undefined) {
    let curr: number;
    let pre: number;
    if (config.momUnit === "%" && config.valueField.endsWith("_SAME")) {
      const baseField = config.valueField.slice(0, -5);
      if (latest[baseField] !== undefined && prev[baseField] !== undefined) {
        curr = Number(latest[baseField]);
        pre = Number(prev[baseField]);
      } else {
        curr = Number(latest[config.valueField]);
        pre = Number(prev[config.valueField]);
      }
    } else {
      curr = Number(latest[config.valueField]);
      pre = Number(prev[config.valueField]);
    }
    if (config.momUnit === "%") {
      const pct = pre !== 0 ? +((curr - pre) / pre * 100).toFixed(2) : 0;
      mom = formatChange(pct, "%");
    } else {
      const diff = +(curr - pre).toFixed(2);
      mom = formatChange(diff, "pp");
    }
  }

  return { name: config.name, value, yoy, mom };
}

const INDICATOR_CONFIGS: Record<string, IndicatorConfig> = {
  cpi: {
    name: "CPI",
    reportName: "RPT_ECONOMY_CPI",
    valueField: "NATIONAL_SAME",
    valueFormatter: (v: number) => `${v}%`,
    yoyChangeField: null,
    momChangeField: "NATIONAL_SEQUENTIAL",
    yoyUnit: "pp",
    momUnit: "%",
  },
  ppi: {
    name: "PPI",
    reportName: "RPT_ECONOMY_PPI",
    valueField: "BASE_SAME",
    valueFormatter: (v: number) => `${v}%`,
    yoyChangeField: null,
    momChangeField: null,
    yoyUnit: "pp",
    momUnit: "%",
  },
  pmi: {
    name: "PMI",
    reportName: "RPT_ECONOMY_PMI",
    valueField: "MAKE_INDEX",
    valueFormatter: (v: number) => `${v}`,
    yoyChangeField: "MAKE_SAME",
    momChangeField: null,
    yoyUnit: "pp",
    momUnit: "pp",
  },
  gdp: {
    name: "GDP",
    reportName: "RPT_ECONOMY_GDP",
    valueField: "SUM_SAME",
    valueFormatter: (v: number) => `${v}%`,
    yoyChangeField: null,
    momChangeField: null,
    yoyUnit: "pp",
    momUnit: "%",
  },
  m2: {
    name: "M2",
    reportName: "RPT_ECONOMY_M2",
    valueField: "M2_SAME",
    valueFormatter: (v: number) => `${v}%`,
    yoyChangeField: null,
    momChangeField: null,
    yoyUnit: "pp",
    momUnit: "%",
  },
  financing: {
    name: "社融",
    reportName: "RPT_ECONOMY_FINANCING",
    valueField: "FINANCING_ABS",
    valueFormatter: (v: number) => `${(v / 1e4).toFixed(1)}万亿元`,
    yoyChangeField: "FINANCING_SAME",
    momChangeField: null,
    yoyUnit: "%",
    momUnit: "%",
  },
  lpr1y: {
    name: "LPR(1年期)",
    reportName: "RPT_ECONOMY_LPR",
    valueField: "LPR1Y",
    valueFormatter: (v: number) => `${v}%`,
    yoyChangeField: null,
    momChangeField: null,
    yoyUnit: "pp",
    momUnit: "pp",
  },
  lpr5y: {
    name: "LPR(5年期)",
    reportName: "RPT_ECONOMY_LPR",
    valueField: "LPR5Y",
    valueFormatter: (v: number) => `${v}%`,
    yoyChangeField: null,
    momChangeField: null,
    yoyUnit: "pp",
    momUnit: "pp",
  },
  unemployment: {
    name: "失业率",
    reportName: "RPT_ECONOMY_UNEMPLOYMENT",
    valueField: "UNEMPLOYMENT_RATE",
    valueFormatter: (v: number) => `${v}%`,
    yoyChangeField: null,
    momChangeField: null,
    yoyUnit: "pp",
    momUnit: "pp",
  },
};

async function fetchIndicator(config: IndicatorConfig): Promise<MacroDataPoint> {
  const rows = await fetchDatacenterRows(config.reportName);
  return parseIndicatorRows(rows, config);
}

async function fetchExchangeRate(): Promise<MacroDataPoint> {
  try {
    const url = "https://api.exchangerate-api.com/v4/latest/USD";
    const response = await fetch(url);
    const json = await response.json();
    const rate = json.rates?.CNY;
    if (typeof rate !== "number") {
      throw new Error("汇率数据格式异常");
    }
    return {
      name: "美元兑人民币汇率",
      value: rate.toFixed(4),
      yoy: null,
      mom: null,
    };
  } catch (error) {
    return { name: "美元兑人民币汇率", value: "数据暂缺", yoy: null, mom: null };
  }
}

interface AvMacroResponse {
  name: string;
  interval: string;
  unit: string;
  data: Array<{ date: string; value: string }>;
}

async function fetchAvMacroIndicator(functionName: string): Promise<MacroDataPoint | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null;

  const url = `https://www.alphavantage.co/query?function=${functionName}&apikey=${apiKey}`;
  const response = await fetch(url);
  const json: AvMacroResponse = await response.json();

  if (!json.data || json.data.length === 0) return null;

  const latest = json.data[0];
  const prev = json.data[1] ?? null;
  const value = Number(latest.value);

  let mom: string | null = null;
  if (prev) {
    const prevVal = Number(prev.value);
    if (functionName === "REAL_GDP") {
      // GDP 用环比增长率
      const pct = prevVal !== 0 ? +((value - prevVal) / prevVal * 100).toFixed(2) : 0;
      mom = formatChange(pct, "%");
    } else {
      const diff = +(value - prevVal).toFixed(2);
      mom = formatChange(diff, json.unit === "percent" ? "pp" : "pp");
    }
  }

  const unitLabel = json.unit === "percent" ? "%" : "";
  return {
    name: json.name,
    value: `${value}${unitLabel}`,
    yoy: null,
    mom,
  };
}

async function fetchUsMacroIndicators(): Promise<MacroDataPoint[]> {
  const indicators: MacroDataPoint[] = [];

  const configs = [
    { function: "CPI", name: "美国CPI" },
    { function: "FEDERAL_FUNDS_RATE", name: "美联储利率" },
    { function: "UNEMPLOYMENT", name: "美国失业率" },
    { function: "REAL_GDP", name: "美国实际GDP" },
  ];

  await Promise.all(
    configs.map(async (cfg) => {
      try {
        const result = await fetchAvMacroIndicator(cfg.function);
        if (result) indicators.push(result);
      } catch {
        indicators.push({ name: cfg.name, value: "数据暂缺", yoy: null, mom: null });
      }
    }),
  );

  return indicators;
}

export function formatMacroOutput(categories: CategoryData[]): string {
  const lines: string[] = ["📊 宏观经济指标概览", ""];

  for (const cat of categories) {
    if (cat.indicators.length === 0) continue;
    lines.push(`${cat.category}:`);
    for (const ind of cat.indicators) {
      const parts: string[] = [`  ${ind.name}: ${ind.value}`];
      if (ind.yoy || ind.mom) {
        const yoyText = ind.yoy ? `同比 ${ind.yoy}` : "";
        const momText = ind.mom ? `环比 ${ind.mom}` : "";
        const combined = [yoyText, momText].filter(Boolean).join("  ");
        if (combined) parts.push(`(${combined})`);
      }
      lines.push(parts.join("  "));
    }
    lines.push("");
  }

  lines.push("⚠️ 不构成投资建议");
  return lines.join("\n");
}

const CATEGORY_MAP: Record<string, string[]> = {
  inflation: ["cpi", "ppi"],
  monetary: ["m2", "financing", "lpr1y", "lpr5y"],
  growth: ["gdp", "pmi", "unemployment"],
  external: ["exchangeRate"],
  us: [],
};

export function createMacroAnalysisTool(): AnyAgentTool {
  return {
    name: "macroAnalysis",
    label: "Macro Analysis",
    description: "宏观经济数据查询：中国（CPI、PPI、PMI、GDP、M2、社融、LPR、失业率、汇率）和美国（CPI、美联储利率、失业率、GDP），支持按分类筛选",
    parameters: MacroAnalysisSchema,
    execute: async (_toolCallId, params) => {
      const category = (params as { category?: string }).category ?? "all";
      const keys = category === "all" ? Object.keys(INDICATOR_CONFIGS) : CATEGORY_MAP[category] ?? [];

      const results: Record<string, MacroDataPoint> = {};

      await Promise.all(
        keys.map(async (key) => {
          try {
            const config = INDICATOR_CONFIGS[key];
            if (!config) return;
            results[key] = await fetchIndicator(config);
          } catch {
            results[key] = {
              name: INDICATOR_CONFIGS[key]?.name ?? key,
              value: "数据暂缺",
              yoy: null,
              mom: null,
            };
          }
        }),
      );

      // 汇率单独处理
      if (category === "all" || category === "external") {
        try {
          results.exchangeRate = await fetchExchangeRate();
        } catch {
          results.exchangeRate = { name: "美元兑人民币汇率", value: "数据暂缺", yoy: null, mom: null };
        }
      }

      // 美国宏观指标
      let usIndicators: MacroDataPoint[] = [];
      if (category === "all" || category === "us") {
        usIndicators = await fetchUsMacroIndicators().catch(() => []);
      }

      // 按分类组装输出
      const categories: CategoryData[] = [
        { category: "通胀", indicators: [] },
        { category: "货币", indicators: [] },
        { category: "增长", indicators: [] },
        { category: "对外", indicators: [] },
        { category: "美国宏观", indicators: [] },
      ];

      const pushToCategory = (key: string, catName: string) => {
        if (results[key]) {
          const cat = categories.find((c) => c.category === catName);
          if (cat) cat.indicators.push(results[key]);
        }
      };

      pushToCategory("cpi", "通胀");
      pushToCategory("ppi", "通胀");
      pushToCategory("m2", "货币");
      pushToCategory("financing", "货币");
      pushToCategory("lpr1y", "货币");
      pushToCategory("lpr5y", "货币");
      pushToCategory("gdp", "增长");
      pushToCategory("pmi", "增长");
      pushToCategory("unemployment", "增长");
      pushToCategory("exchangeRate", "对外");

      // 添加美国宏观指标
      const usCat = categories.find((c) => c.category === "美国宏观");
      if (usCat) {
        for (const ind of usIndicators) {
          usCat.indicators.push(ind);
        }
      }

      const output = formatMacroOutput(categories);
      const chinaResults = Object.values(results);
      const chinaFailed = chinaResults.length === 0 || chinaResults.every((r) => r.value === "数据暂缺");
      const usFailed = usIndicators.length === 0;

      let allFailed: boolean;
      if (category === "us") {
        allFailed = usFailed;
      } else if (category === "all") {
        allFailed = chinaFailed && usFailed;
      } else {
        allFailed = chinaFailed;
      }

      return toToolResult({ content: output, isError: allFailed });
    },
  };
}

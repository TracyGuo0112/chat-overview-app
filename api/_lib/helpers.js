// ─── 消息解析 ────────────────────────────────────────────────────────────────

function normalizeParts(parts) {
  if (Array.isArray(parts)) return parts;
  if (!parts) return [];
  if (typeof parts === "string") {
    try {
      const parsed = JSON.parse(parts);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function extractText(parts) {
  const normalizedParts = normalizeParts(parts);
  if (!Array.isArray(normalizedParts) || normalizedParts.length === 0) return "";

  const chunks = [];
  for (const part of normalizedParts) {
    if (!part || typeof part.text !== "string") continue;
    if (part.type === "reasoning") continue;
    const text = part.text.replace(/\r\n/g, "\n").trim();
    if (text) chunks.push(text);
  }

  if (chunks.length === 0) return "";
  return chunks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function detectSensitive(text) {
  if (!text) return { hit: false, types: [] };
  const rules = [
    { name: "email", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
    { name: "phone", pattern: /(?:\+?\d{1,3}[ -]?)?(?:1\d{10}|\d{2,4}[ -]?\d{6,8})/ },
    { name: "id_or_card", pattern: /(身份证|护照|银行卡|信用卡|cvv|卡号|bank|card)/i },
    { name: "credential", pattern: /(密码|验证码|otp|verification code|token)/i },
    { name: "abuse_or_fraud", pattern: /(诈骗|恐吓|威胁|勒索|洗钱|辱骂|骗子|fraud|scam)/i },
  ];
  const types = rules.filter((x) => x.pattern.test(text)).map((x) => x.name);
  return { hit: types.length > 0, types };
}

// ─── 会话状态 ─────────────────────────────────────────────────────────────────

function mapStatus(row) {
  if (row.last_feedback === "dislike") return "failed";
  if (row.last_message_role === "assistant") return "resolved";
  const ageMin = (Date.now() - new Date(row.last_active_at).getTime()) / 60000;
  return ageMin <= 5 ? "new" : "in_progress";
}

// ─── 会员 ─────────────────────────────────────────────────────────────────────

function membershipLevel(tier) {
  const normalized = Number.isInteger(tier) ? tier : 0;
  if (normalized === 1) return "微光版";
  if (normalized === 2) return "烛照版";
  if (normalized === 3) return "洞见版";
  return "免费版";
}

function isSubscribed(status, tier) {
  return status === "active" && Number(tier) > 0;
}

// ─── 数据格式化 ───────────────────────────────────────────────────────────────

function maskEmail(email) {
  if (!email || !email.includes("@")) return "";
  const [name, domain] = email.split("@");
  if (name.length < 3) return "**@" + domain;
  return name.slice(0, 2) + "***@" + domain;
}

function formatDbValue(value) {
  if (value === null || value === undefined) return "-";
  if (value instanceof Date) {
    return value.toISOString().replace("T", " ").slice(0, 19);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (_) {
      return String(value);
    }
  }
  return String(value);
}

function escapeMarkdownCell(value) {
  return formatDbValue(value).replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

function rowsToMarkdownTable(rows) {
  if (!rows || rows.length === 0) return "（无数据）";
  const columns = Object.keys(rows[0]);
  if (columns.length === 0) return "（无数据）";

  const header = `| ${columns.join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => {
    const cells = columns.map((col) => escapeMarkdownCell(row[col]));
    return `| ${cells.join(" | ")} |`;
  });

  return [header, divider, ...body].join("\n");
}

function compactSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim();
}

function parseRequestedLimit(question, fallback = 10) {
  const match = String(question || "").match(/(\d{1,3})\s*(条|行|个)/);
  if (!match) return fallback;
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(num, 1), 50);
}

// ─── 日期工具 ─────────────────────────────────────────────────────────────────

const DATE_PARAM_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateParam(value) {
  if (typeof value !== "string" || !DATE_PARAM_REGEX.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

function addDaysToDateString(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateString;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeHost(value, fallback) {
  const raw = String(value || fallback || "").trim();
  if (!raw) return fallback;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

// ─── 转化率 ───────────────────────────────────────────────────────────────────

function toPercent(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

// ─── PostHog 响应解析 ─────────────────────────────────────────────────────────

function extractPosthogCount(payload, key) {
  if (!payload || typeof payload !== "object") return null;

  if (Array.isArray(payload.results) && payload.results.length > 0) {
    const first = payload.results[0];
    if (first && typeof first === "object" && !Array.isArray(first) && key in first) {
      const value = Number(first[key]);
      return Number.isFinite(value) ? value : null;
    }
    if (Array.isArray(first) && first.length > 0) {
      const value = Number(first[0]);
      return Number.isFinite(value) ? value : null;
    }
    const value = Number(first);
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(payload.data) && payload.data.length > 0) {
    const first = payload.data[0];
    if (first && typeof first === "object" && key in first) {
      const value = Number(first[key]);
      return Number.isFinite(value) ? value : null;
    }
    if (Array.isArray(first) && first.length > 0) {
      const value = Number(first[0]);
      return Number.isFinite(value) ? value : null;
    }
  }

  if (payload.result !== undefined && payload.result !== null) {
    const value = Number(payload.result);
    return Number.isFinite(value) ? value : null;
  }

  return null;
}

// ─── Vercel API 响应辅助 ──────────────────────────────────────────────────────

function sendJson(res, statusCode, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(statusCode).json(payload);
}

module.exports = {
  normalizeParts,
  extractText,
  detectSensitive,
  mapStatus,
  membershipLevel,
  isSubscribed,
  maskEmail,
  formatDbValue,
  escapeMarkdownCell,
  rowsToMarkdownTable,
  compactSql,
  parseRequestedLimit,
  DATE_PARAM_REGEX,
  isValidDateParam,
  addDaysToDateString,
  normalizeHost,
  toPercent,
  extractPosthogCount,
  sendJson,
};

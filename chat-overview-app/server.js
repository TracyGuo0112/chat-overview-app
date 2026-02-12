require("dotenv").config();
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const { Pool } = require("pg");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4173);
const ANALYTICS_TIMEZONE = "Asia/Shanghai";
const ONLINE_WINDOW_MINUTES = Number.isFinite(Number(process.env.ONLINE_WINDOW_MINUTES))
  ? Math.max(1, Math.floor(Number(process.env.ONLINE_WINDOW_MINUTES)))
  : 5;
const LOW_REMAINING_WINDOW_HOURS = Number.isFinite(Number(process.env.LOW_REMAINING_WINDOW_HOURS))
  ? Math.max(1, Math.floor(Number(process.env.LOW_REMAINING_WINDOW_HOURS)))
  : 48;

const pool = new Pool({
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : false,
  enableChannelBinding: process.env.PGCHANNELBINDING === "require",
  max: 6,
});

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

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

function mapStatus(row) {
  if (row.last_feedback === "dislike") return "failed";
  if (row.last_message_role === "assistant") return "resolved";
  const ageMin = (Date.now() - new Date(row.last_active_at).getTime()) / 60000;
  return ageMin <= 5 ? "new" : "in_progress";
}

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

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("payload_too_large"));
      }
    });

    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(new Error("invalid_json"));
      }
    });

    req.on("error", reject);
  });
}

async function runDbChatQuery(question) {
  const q = String(question || "").trim();
  if (!q) {
    return {
      answer: "请输入要查询的问题，例如：**今天新增注册用户有多少？**",
    };
  }

  const text = q.toLowerCase();
  const has = (keywords) => keywords.some((kw) => text.includes(kw));

  const helpText = `你可以这样问我：

- 今天新增注册用户有多少？
- 今日活跃用户数是多少？
- 当前在线人数是多少？
- 当前订阅人数是多少？
- 会员等级分布
- 剩余次数为 0 的用户有多少？
- 最近 10 条会话列表
- 最近 10 个注册用户`; 

  if (has(["帮助", "能查", "示例", "例子", "help"])) {
    return { answer: helpText };
  }

  const latestGrantCte = `
    with latest_grant as (
      select distinct on (g.user_id)
        g.user_id,
        coalesce(g.tier, 0) as tier,
        coalesce(g.status, 'inactive') as status,
        g.period_start,
        g.period_end
      from redemption_grant g
      order by
        g.user_id,
        case when g.status = 'active' then 1 else 0 end desc,
        g.period_end desc nulls last,
        g.period_start desc nulls last
    )
  `;

  const runScalar = async (sql, summaryPrefix) => {
    const result = await pool.query(sql);
    const first = result.rows[0] || {};
    const key = Object.keys(first)[0] || "value";
    return {
      answer: `${summaryPrefix} **${formatDbValue(first[key])}**`,
      executedSql: compactSql(sql),
    };
  };

  const shanghaiDayBounds = `
    with bounds as (
      select
        ((now() at time zone '${ANALYTICS_TIMEZONE}')::date::timestamp at time zone '${ANALYTICS_TIMEZONE}') as start_ts,
        ((((now() at time zone '${ANALYTICS_TIMEZONE}')::date + interval '1 day')::timestamp) at time zone '${ANALYTICS_TIMEZONE}') as end_ts
    )
  `;

  if (has(["今天", "今日"]) && has(["注册", "新增"])) {
    return runScalar(
      `${shanghaiDayBounds}
      select count(*)::int as 今日新增注册人数
      from "user" u
      cross join bounds b
      where u.created_at >= b.start_ts and u.created_at < b.end_ts;`,
      "今日新增注册人数："
    );
  }

  if (has(["注册", "用户"]) && has(["总", "人数", "多少"])) {
    return runScalar(
      `select count(*)::int as 注册总人数 from "user";`,
      "注册总人数："
    );
  }

  if (has(["今日", "今天"]) && has(["活跃"])) {
    return runScalar(
      `${shanghaiDayBounds}
      select count(distinct t.user_id)::int as 今日活跃用户数
      from chat_message m
      join chat_thread t on t.id = m.thread_id
      cross join bounds b
      where m.role = 'user'
        and m.created_at >= b.start_ts
        and m.created_at < b.end_ts;`,
      "今日活跃用户数："
    );
  }

  if (has(["在线"])) {
    return runScalar(
      `select count(distinct t.user_id)::int as 当前在线人数
      from chat_thread t
      where t.updated_at >= now() - interval '${ONLINE_WINDOW_MINUTES} minutes';`,
      `当前在线人数（${ONLINE_WINDOW_MINUTES}分钟内活跃）：`
    );
  }

  if (has(["订阅"]) && has(["人数", "用户", "多少"])) {
    const sql = `${latestGrantCte}
      select count(*)::int as 当前订阅人数
      from latest_grant lg
      where lg.tier > 0
        and lg.status = 'active'
        and (lg.period_start is null or lg.period_start <= now())
        and (lg.period_end is null or lg.period_end >= now());`;
    return runScalar(sql, "当前订阅人数：");
  }

  if (has(["会员"]) && has(["分布", "等级"])) {
    const sql = `${latestGrantCte}
      select
        case lg.tier
          when 0 then '免费版'
          when 1 then '微光版'
          when 2 then '烛照版'
          when 3 then '洞见版'
          else '免费版'
        end as 会员等级,
        count(*)::int as 用户数
      from "user" u
      left join latest_grant lg on lg.user_id = u.id
      group by 1
      order by 2 desc;`;
    const result = await pool.query(sql);
    return {
      answer: `会员等级分布如下：\n\n${rowsToMarkdownTable(result.rows)}`,
      executedSql: compactSql(sql),
    };
  }

  if (has(["剩余"]) && has(["0", "用完"])) {
    const sql = `
      select count(*)::int as 剩余次数为0的用户数
      from "user" u
      left join user_profile up on up.user_id = u.id
      where case
        when (up.credits ->> 'chat') ~ '^[0-9]+$' then (up.credits ->> 'chat')::int
        else 0
      end <= 0;
    `;
    return runScalar(sql, "剩余次数为 0 的用户数：");
  }

  if (has(["低", "不足", "<=3"]) && has(["剩余", "额度"])) {
    const sql = `
      select count(*)::int as 低剩余额度用户数
      from "user" u
      left join user_profile up on up.user_id = u.id
      where case
        when (up.credits ->> 'chat') ~ '^[0-9]+$' then (up.credits ->> 'chat')::int
        else 0
      end between 0 and 3;
    `;
    return runScalar(sql, "低剩余额度用户数（0-3）：");
  }

  if (has(["最近", "最新"]) && has(["会话", "对话"])) {
    const limit = parseRequestedLimit(q, 10);
    const sql = `
      select
        t.id as 会话ID,
        t.user_id as 客户ID,
        coalesce(u.name, '') as 昵称,
        coalesce(u.email, '') as 邮箱,
        t.updated_at as 最后活跃时间
      from chat_thread t
      left join "user" u on u.id = t.user_id
      order by t.updated_at desc nulls last
      limit $1;
    `;
    const result = await pool.query(sql, [limit]);
    return {
      answer: `最近 ${limit} 条会话：\n\n${rowsToMarkdownTable(result.rows)}`,
      executedSql: compactSql(sql),
    };
  }

  if (has(["最近", "最新"]) && has(["用户", "注册"])) {
    const limit = parseRequestedLimit(q, 10);
    const sql = `${latestGrantCte}
      select
        u.id as 用户ID,
        coalesce(nullif(trim(u.name), ''), split_part(coalesce(u.email, ''), '@', 1), '-') as 昵称,
        coalesce(u.email, '') as 邮箱,
        u.created_at as 注册时间,
        case coalesce(lg.tier, 0)
          when 0 then '免费版'
          when 1 then '微光版'
          when 2 then '烛照版'
          when 3 then '洞见版'
          else '免费版'
        end as 订阅版本,
        case
          when (up.credits ->> 'chat') ~ '^[0-9]+$' then (up.credits ->> 'chat')::int
          else 0
        end as 剩余AI对话次数
      from "user" u
      left join user_profile up on up.user_id = u.id
      left join latest_grant lg on lg.user_id = u.id
      order by u.created_at desc
      limit $1;`;
    const result = await pool.query(sql, [limit]);
    return {
      answer: `最近 ${limit} 个注册用户：\n\n${rowsToMarkdownTable(result.rows)}`,
      executedSql: compactSql(sql),
    };
  }

  return {
    answer: `暂时没理解这个问题：\n\n> ${q}\n\n${helpText}`,
  };
}



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

async function resolveMembershipDateRange(params) {
  let startDate = typeof params.startDate === "string" ? params.startDate.trim() : "";
  let endDate = typeof params.endDate === "string" ? params.endDate.trim() : "";

  if (!startDate || !endDate) {
    const defaultsResult = await pool.query(`
      select
        to_char(((now() at time zone '${ANALYTICS_TIMEZONE}')::date - 29), 'YYYY-MM-DD') as start_date,
        to_char((now() at time zone '${ANALYTICS_TIMEZONE}')::date, 'YYYY-MM-DD') as end_date
    `);
    const defaults = defaultsResult.rows[0] || {};
    startDate = startDate || defaults.start_date;
    endDate = endDate || defaults.end_date;
  }

  if (!isValidDateParam(startDate) || !isValidDateParam(endDate)) {
    const err = new Error("invalid_date_range");
    err.statusCode = 400;
    throw err;
  }

  if (startDate > endDate) {
    const err = new Error("start_date_after_end_date");
    err.statusCode = 400;
    throw err;
  }

  return { startDate, endDate };
}

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

async function resolvePosthogProjectId(host, apiKey, configuredId) {
  if (configuredId) return String(configuredId).trim();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    // Scoped PostHog API keys can resolve current project via @current endpoint.
    const currentResponse = await fetch(`${host}/api/projects/@current/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (currentResponse.ok) {
      const currentPayload = await currentResponse.json();
      if (currentPayload?.id) {
        return String(currentPayload.id);
      }
    }

    const response = await fetch(`${host}/api/projects/?limit=1`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`resolve_project_failed_${response.status}`);
    }

    const payload = await response.json();
    const first = Array.isArray(payload?.results)
      ? payload.results[0]
      : Array.isArray(payload)
        ? payload[0]
        : null;

    if (!first?.id) {
      throw new Error("missing_project_id");
    }

    return String(first.id);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPosthogVisitors(startDate, endDate) {
  const apiKey = String(process.env.POSTHOG_API_KEY || "").trim();
  const host = normalizeHost(process.env.POSTHOG_HOST, "https://app.posthog.com");

  if (!apiKey) {
    return {
      count: null,
      status: "missing_config",
      message: "POSTHOG_API_KEY 未配置，游客访问数暂不可用",
    };
  }

  let projectId = String(process.env.POSTHOG_PROJECT_ID || "").trim();
  try {
    projectId = await resolvePosthogProjectId(host, apiKey, projectId);
  } catch (err) {
    return {
      count: null,
      status: "missing_project",
      message: `无法自动解析 PostHog 项目ID：${err.message || "unknown_error"}`,
    };
  }

  const endExclusive = addDaysToDateString(endDate, 1);
  const hogql = `
    SELECT count(DISTINCT distinct_id) AS visitors
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= toDateTime('${startDate} 00:00:00', '${ANALYTICS_TIMEZONE}')
      AND timestamp < toDateTime('${endExclusive} 00:00:00', '${ANALYTICS_TIMEZONE}')
  `;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${host}/api/projects/${projectId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query: hogql,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`posthog_query_failed_${response.status}`);
    }

    const payload = await response.json();
    const count = extractPosthogCount(payload, "visitors");
    if (!Number.isFinite(count)) {
      throw new Error("invalid_posthog_response");
    }

    return {
      count,
      status: "ok",
      message: "PostHog $pageview（distinct_id去重）",
      projectId,
    };
  } catch (err) {
    return {
      count: null,
      status: "error",
      message: `PostHog 查询失败：${err.message || "unknown_error"}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function toPercent(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

async function queryMembershipOps(params) {
  const { startDate, endDate } = await resolveMembershipDateRange(params || {});

  const visitorPromise = fetchPosthogVisitors(startDate, endDate);

  const funnelSql = `
    with bounds as (
      select
        (($1::date)::timestamp at time zone '${ANALYTICS_TIMEZONE}') as start_ts,
        ((($2::date + interval '1 day')::timestamp) at time zone '${ANALYTICS_TIMEZONE}') as end_ts
    ),
    paid_stats as (
      select
        lower(trim(u.email)) as email_key,
        min(coalesce(g.period_start, g.period_end)) filter (where coalesce(g.tier, 0) > 0) as first_paid_at
      from redemption_grant g
      join "user" u on u.id = g.user_id
      where nullif(trim(u.email), '') is not null
      group by lower(trim(u.email))
    ),
    renew_events as (
      select distinct
        lower(trim(u.email)) as email_key,
        rh.redeemed_at
      from redemption_history rh
      join "user" u on u.id = rh.user_id
      left join redemption_code rc on rc.id = rh.code_id
      where coalesce(rc.tier, 0) > 0
        and nullif(trim(u.email), '') is not null
    ),
    renew_ranked as (
      select
        re.email_key,
        re.redeemed_at,
        row_number() over (
          partition by re.email_key
          order by re.redeemed_at asc
        ) as rn
      from renew_events re
    ),
    renew_stats as (
      select
        email_key,
        min(redeemed_at) filter (where rn = 2) as second_paid_at
      from renew_ranked
      group by email_key
    )
    select
      (
        select count(*)::int
        from "user" u
        cross join bounds b
        where u.created_at >= b.start_ts and u.created_at < b.end_ts
      ) as registered_users,
      (
        select count(distinct t.user_id)::int
        from chat_message m
        join chat_thread t on t.id = m.thread_id
        cross join bounds b
        where m.role = 'user'
          and m.created_at >= b.start_ts
          and m.created_at < b.end_ts
      ) as active_users,
      (
        select count(*)::int
        from paid_stats p
        cross join bounds b
        where p.first_paid_at is not null
          and p.first_paid_at >= b.start_ts
          and p.first_paid_at < b.end_ts
      ) as subscribed_users,
      (
        select count(*)::int
        from renew_stats rs
        cross join bounds b
        where rs.second_paid_at is not null
          and rs.second_paid_at >= b.start_ts
          and rs.second_paid_at < b.end_ts
      ) as renewed_users;
  `;

  const tierSql = `
    with bounds as (
      select
        (($1::date)::timestamp at time zone '${ANALYTICS_TIMEZONE}') as start_ts,
        ((($2::date + interval '1 day')::timestamp) at time zone '${ANALYTICS_TIMEZONE}') as end_ts
    ),
    tier_map as (
      select * from (
        values
          (0, '免费版'),
          (1, '微光版'),
          (2, '烛照版'),
          (3, '洞见版')
      ) as tm(tier_value, tier_label)
    ),
    message_tier_events as (
      select
        t.user_id,
        coalesce(gt.tier_value, 0) as tier_value
      from chat_message m
      join chat_thread t on t.id = m.thread_id
      cross join bounds b
      left join lateral (
        select g.tier as tier_value
        from redemption_grant g
        where g.user_id = t.user_id
          and coalesce(g.tier, 0) > 0
          and (g.period_start is null or g.period_start <= m.created_at)
          and (g.period_end is null or g.period_end >= m.created_at)
        order by
          g.period_end desc nulls last,
          g.period_start desc nulls last
        limit 1
      ) gt on true
      where m.role = 'user'
        and m.created_at >= b.start_ts
        and m.created_at < b.end_ts
    ),
    user_tier_turns as (
      select
        user_id,
        tier_value,
        count(*)::int as user_turns
      from message_tier_events
      group by user_id, tier_value
    ),
    latest_grant as (
      select distinct on (g.user_id)
        g.user_id,
        coalesce(g.tier, 0) as tier,
        coalesce(g.status, 'inactive') as status,
        g.period_start,
        g.period_end
      from redemption_grant g
      order by
        g.user_id,
        case when g.status = 'active' then 1 else 0 end desc,
        g.period_end desc nulls last,
        g.period_start desc nulls last
    ),
    current_user_tier as (
      select
        u.id as user_id,
        coalesce(lg.tier, 0) as tier_value
      from "user" u
      left join latest_grant lg on lg.user_id = u.id
    ),
    active_user_set as (
      select distinct t.user_id
      from chat_message m
      join chat_thread t on t.id = m.thread_id
      cross join bounds b
      where m.role = 'user'
        and m.created_at >= b.start_ts
        and m.created_at < b.end_ts
    ),
    population_agg as (
      select
        tm.tier_label as tier,
        count(cut.user_id)::int as total_users,
        count(cut.user_id) filter (where aus.user_id is not null)::int as active_users,
        coalesce(round((count(cut.user_id) filter (where aus.user_id is not null) * 100.0 / nullif(count(cut.user_id), 0))::numeric, 2), 0)::numeric as active_rate
      from tier_map tm
      left join current_user_tier cut on cut.tier_value = tm.tier_value
      left join active_user_set aus on aus.user_id = cut.user_id
      group by tm.tier_label, tm.tier_value
    ),
    usage_agg as (
      select
        tm.tier_label as tier,
        coalesce(sum(utt.user_turns), 0)::int as total_user_turns,
        coalesce(round((avg(utt.user_turns)::numeric), 2), 0)::numeric as avg_user_turns_per_user,
        coalesce(round((percentile_cont(0.5) within group (order by utt.user_turns))::numeric, 2), 0)::numeric as p50_user_turns_per_user
      from tier_map tm
      left join user_tier_turns utt on utt.tier_value = tm.tier_value
      group by tm.tier_label, tm.tier_value
    ),
    user_remaining as (
      select
        up.user_id,
        case
          when (up.credits ->> 'chat') ~ '^[0-9]+$' then (up.credits ->> 'chat')::int
          else 0
        end as remaining_ai_chat_count
      from user_profile up
    ),
    risk_agg as (
      select
        tm.tier_label as tier,
        count(cut.user_id) filter (where coalesce(rem.remaining_ai_chat_count, 0) <= 3)::int as low_remaining_users,
        coalesce(round((count(cut.user_id) filter (where coalesce(rem.remaining_ai_chat_count, 0) <= 3) * 100.0 / nullif(count(cut.user_id), 0))::numeric, 2), 0)::numeric as low_remaining_rate,
        count(cut.user_id) filter (where coalesce(rem.remaining_ai_chat_count, 0) = 0)::int as exhausted_users
      from tier_map tm
      left join current_user_tier cut on cut.tier_value = tm.tier_value
      left join user_remaining rem on rem.user_id = cut.user_id
      group by tm.tier_label, tm.tier_value
    )
    select
      tm.tier_label as tier,
      coalesce(pa.total_users, 0)::int as total_users,
      coalesce(pa.active_users, 0)::int as active_users,
      coalesce(pa.active_rate, 0)::numeric as active_rate,
      ua.total_user_turns,
      ua.avg_user_turns_per_user,
      ua.p50_user_turns_per_user,
      coalesce(ra.low_remaining_users, 0)::int as low_remaining_users,
      coalesce(ra.low_remaining_rate, 0)::numeric as low_remaining_rate,
      coalesce(ra.exhausted_users, 0)::int as exhausted_users
    from tier_map tm
    left join population_agg pa on pa.tier = tm.tier_label
    left join usage_agg ua on ua.tier = tm.tier_label
    left join risk_agg ra on ra.tier = tm.tier_label
    order by tm.tier_value;
  `;

  const trendSql = `
    with bounds as (
      select
        $1::date as start_date,
        $2::date as end_date,
        (($1::date)::timestamp at time zone '${ANALYTICS_TIMEZONE}') as start_ts,
        ((($2::date + interval '1 day')::timestamp) at time zone '${ANALYTICS_TIMEZONE}') as end_ts
    ),
    days as (
      select generate_series((select start_date from bounds), (select end_date from bounds), interval '1 day')::date as day
    ),
    paid_stats as (
      select
        lower(trim(u.email)) as email_key,
        min(coalesce(g.period_start, g.period_end)) filter (where coalesce(g.tier, 0) > 0) as first_paid_at
      from redemption_grant g
      join "user" u on u.id = g.user_id
      where nullif(trim(u.email), '') is not null
      group by lower(trim(u.email))
    ),
    renew_events as (
      select distinct
        lower(trim(u.email)) as email_key,
        rh.redeemed_at
      from redemption_history rh
      join "user" u on u.id = rh.user_id
      left join redemption_code rc on rc.id = rh.code_id
      where coalesce(rc.tier, 0) > 0
        and nullif(trim(u.email), '') is not null
    ),
    renew_ranked as (
      select
        re.email_key,
        re.redeemed_at,
        row_number() over (
          partition by re.email_key
          order by re.redeemed_at asc
        ) as rn
      from renew_events re
    ),
    renew_stats as (
      select
        email_key,
        min(redeemed_at) filter (where rn = 2) as second_paid_at
      from renew_ranked
      group by email_key
    ),
    register_daily as (
      select
        (u.created_at at time zone '${ANALYTICS_TIMEZONE}')::date as day,
        count(*)::int as value
      from "user" u
      cross join bounds b
      where u.created_at >= b.start_ts and u.created_at < b.end_ts
      group by 1
    ),
    subscribe_daily as (
      select
        (p.first_paid_at at time zone '${ANALYTICS_TIMEZONE}')::date as day,
        count(*)::int as value
      from paid_stats p
      cross join bounds b
      where p.first_paid_at is not null
        and p.first_paid_at >= b.start_ts
        and p.first_paid_at < b.end_ts
      group by 1
    ),
    renew_daily as (
      select
        (rs.second_paid_at at time zone '${ANALYTICS_TIMEZONE}')::date as day,
        count(*)::int as value
      from renew_stats rs
      cross join bounds b
      where rs.second_paid_at is not null
        and rs.second_paid_at >= b.start_ts
        and rs.second_paid_at < b.end_ts
      group by 1
    ),
    active_daily as (
      select
        (m.created_at at time zone '${ANALYTICS_TIMEZONE}')::date as day,
        count(distinct t.user_id)::int as value
      from chat_message m
      join chat_thread t on t.id = m.thread_id
      cross join bounds b
      where m.role = 'user'
        and m.created_at >= b.start_ts
        and m.created_at < b.end_ts
      group by 1
    )
    select
      to_char(d.day, 'YYYY-MM-DD') as date,
      to_char(d.day, 'MM-DD') as label,
      coalesce(r.value, 0)::int as registered,
      coalesce(s.value, 0)::int as subscribed,
      coalesce(n.value, 0)::int as renewed,
      coalesce(a.value, 0)::int as active_users
    from days d
    left join register_daily r on r.day = d.day
    left join subscribe_daily s on s.day = d.day
    left join renew_daily n on n.day = d.day
    left join active_daily a on a.day = d.day
    order by d.day asc;
  `;

  const [funnelResult, tierResult, trendResult, visitorResult] = await Promise.all([
    pool.query(funnelSql, [startDate, endDate]),
    pool.query(tierSql, [startDate, endDate]),
    pool.query(trendSql, [startDate, endDate]),
    visitorPromise,
  ]);

  const funnelRow = funnelResult.rows[0] || {};
  const registered = Number(funnelRow.registered_users || 0);
  const activeUsers = Number(funnelRow.active_users || 0);
  const subscribed = Number(funnelRow.subscribed_users || 0);
  const renewed = Number(funnelRow.renewed_users || 0);
  const visitors = Number.isFinite(visitorResult.count) ? Number(visitorResult.count) : null;

  const tierComparison = tierResult.rows.map((row) => ({
    tier: row.tier,
    totalUsers: Number(row.total_users || 0),
    activeUsers: Number(row.active_users || 0),
    activeRate: Number(row.active_rate || 0),
    totalUserTurns: Number(row.total_user_turns || 0),
    avgUserTurnsPerUser: Number(row.avg_user_turns_per_user || 0),
    p50UserTurnsPerUser: Number(row.p50_user_turns_per_user || 0),
    lowRemainingUsers: Number(row.low_remaining_users || 0),
    lowRemainingRate: Number(row.low_remaining_rate || 0),
    exhaustedUsers: Number(row.exhausted_users || 0),
  }));

  const trend = trendResult.rows.map((row) => ({
    date: row.date,
    label: row.label,
    registered: Number(row.registered || 0),
    subscribed: Number(row.subscribed || 0),
    renewed: Number(row.renewed || 0),
    activeUsers: Number(row.active_users || 0),
  }));

  return {
    range: {
      timezone: ANALYTICS_TIMEZONE,
      startDate,
      endDate,
    },
    funnel: {
      visitors,
      registered,
      activeUsers,
      subscribed,
      renewed,
      conversion: {
        visitToRegister: visitors === null ? null : toPercent(registered, visitors),
        registerToFirstConversation: toPercent(activeUsers, registered),
        firstConversationToSubscribe: toPercent(subscribed, activeUsers),
        registerToSubscribe: toPercent(subscribed, registered),
        subscribeToRenew: toPercent(renewed, subscribed),
      },
      visitorSource: {
        event: "$pageview",
        dedupeBy: "distinct_id",
        status: visitorResult.status,
        message: visitorResult.message || "",
      },
    },
    tierComparison,
    trend,
  };
}

async function queryOverview(params) {
  const customerIdFilter = typeof params.customerId === "string" ? params.customerId.trim() : "";
  const hasCustomerIdFilter = Boolean(customerIdFilter);
  const remainingExpr = `
    case
      when (up.credits ->> 'chat') ~ '^[0-9]+$' then (up.credits ->> 'chat')::int
      else 0
    end
  `;
  const defaultLimit = 15;
  const maxLimit = hasCustomerIdFilter ? 5000 : 50;
  const rawLimit = Number(params.limit || defaultLimit);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), maxLimit) : defaultLimit;
  const rawOffset = Number(params.offset || 0);
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.floor(rawOffset), 0) : 0;
  const membershipFilter = typeof params.membership === "string" ? params.membership.trim() : "all";
  const remainingFilter = typeof params.remaining === "string" ? params.remaining.trim() : "all";
  const dateRangeFilter = typeof params.dateRange === "string" ? params.dateRange.trim() : "all";
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const filters = [];
  const filterParams = ["inactive", 0];
  const pushFilterParam = (value) => {
    filterParams.push(value);
    return `$${filterParams.length}`;
  };

  if (hasCustomerIdFilter) {
    const customerIdSlot = pushFilterParam(customerIdFilter);
    filters.push(`t.user_id = ${customerIdSlot}`);
  }

  if (dateRangeFilter === "1d") {
    filters.push("t.updated_at >= now() - interval '1 day'");
  } else if (dateRangeFilter === "7d") {
    filters.push("t.updated_at >= now() - interval '7 days'");
  } else if (dateRangeFilter === "30d") {
    filters.push("t.updated_at >= now() - interval '30 days'");
  }

  if (membershipFilter === "免费版") {
    filters.push("coalesce(lg.tier, 0) = 0");
  } else if (membershipFilter === "微光版") {
    filters.push("coalesce(lg.tier, 0) = 1");
  } else if (membershipFilter === "烛照版") {
    filters.push("coalesce(lg.tier, 0) = 2");
  } else if (membershipFilter === "洞见版") {
    filters.push("coalesce(lg.tier, 0) = 3");
  }

  if (remainingFilter === "0-10") {
    filters.push(`${remainingExpr} between 0 and 10`);
  } else if (remainingFilter === "10+") {
    filters.push(`${remainingExpr} > 10`);
  }

  if (q) {
    const keywordSlot = pushFilterParam(`%${q.toLowerCase()}%`);
    filters.push(`(
      lower(coalesce(t.user_id::text, '')) like ${keywordSlot}
      or lower(coalesce(u.email, '')) like ${keywordSlot}
      or lower(coalesce(u.name, '')) like ${keywordSlot}
      or lower(coalesce(lm.last_message_parts::text, '')) like ${keywordSlot}
    )`);
  }

  const whereClause = filters.length > 0 ? `where ${filters.join(" and ")}` : "";
  const overviewBaseCte = `
    with latest_msg as (
      select distinct on (m.thread_id)
        m.thread_id,
        m.role as last_message_role,
        m.parts as last_message_parts,
        m.feedback as last_feedback,
        m.created_at as last_message_at
      from chat_message m
      order by m.thread_id, m.created_at desc
    ),
    latest_grant as (
      select distinct on (g.user_id)
        g.user_id,
        g.tier,
        g.status,
        g.period_start,
        g.period_end
      from redemption_grant g
      order by
        g.user_id,
        case when g.status = 'active' then 1 else 0 end desc,
        g.period_end desc nulls last,
        g.period_start desc nulls last
    )
  `;
  const rowsSql = `
    ${overviewBaseCte},
    user_message_count as (
      select t.user_id, count(*)::int as message_count
      from chat_message m
      join chat_thread t on t.id = m.thread_id
      where m.role = 'user'
      group by t.user_id
    )
    select
      t.id as conversation_id,
      t.user_id,
      t.updated_at as last_active_at,
      t.created_at as conversation_created_at,
      t.is_pinned,
      u.name as user_name,
      u.email,
      lm.last_message_role,
      lm.last_message_parts,
      lm.last_feedback,
      lm.last_message_at,
      coalesce(lg.status, $1) as membership_status,
      coalesce(lg.tier, $2) as membership_tier,
      coalesce(umc.message_count, 0) as total_chat_count,
      ${remainingExpr} as remaining_ai_chat_count
    from chat_thread t
    left join "user" u on u.id = t.user_id
    left join user_profile up on up.user_id = t.user_id
    left join latest_msg lm on lm.thread_id = t.id
    left join latest_grant lg on lg.user_id = t.user_id
    left join user_message_count umc on umc.user_id = t.user_id
    ${whereClause}
    order by t.updated_at desc nulls last
    limit $${filterParams.length + 1}
    offset $${filterParams.length + 2};
  `;
  const countSql = `
    ${overviewBaseCte}
    select count(*)::int as total
    from (select $1::text as default_status, $2::int as default_tier) defaults
    cross join chat_thread t
    left join "user" u on u.id = t.user_id
    left join user_profile up on up.user_id = t.user_id
    left join latest_msg lm on lm.thread_id = t.id
    left join latest_grant lg on lg.user_id = t.user_id
    ${whereClause};
  `;
  const kpiSql = `
    with latest_msg as (
      select distinct on (m.thread_id)
        m.thread_id,
        m.role as last_message_role,
        m.feedback as last_feedback,
        m.created_at as last_message_at
      from chat_message m
      order by m.thread_id, m.created_at desc
    ),
    bounds as (
      select
        ((now() at time zone '${ANALYTICS_TIMEZONE}')::date::timestamp at time zone '${ANALYTICS_TIMEZONE}') as start_ts,
        ((((now() at time zone '${ANALYTICS_TIMEZONE}')::date + interval '1 day')::timestamp) at time zone '${ANALYTICS_TIMEZONE}') as end_ts
    ),
    today_threads as (
      select
        t.id,
        t.user_id,
        t.created_at,
        t.updated_at,
        lm.last_feedback,
        lm.last_message_role,
        lm.last_message_at
      from chat_thread t
      left join latest_msg lm on lm.thread_id = t.id
      cross join bounds b
      where t.updated_at >= b.start_ts
        and t.updated_at < b.end_ts
    )
    select
      count(*)::int as today_conversations,
      count(*) filter (where tt.last_feedback = 'dislike')::int as failed_conversations,
      coalesce(
        round(
          avg(
            case
              when tt.last_message_role = 'assistant' and tt.last_message_at is not null
                then greatest(extract(epoch from (tt.last_message_at - tt.created_at)) / 60.0, 0)
            end
          )
        )::int,
        0
      ) as avg_first_reply_minutes,
      (
        select count(distinct t2.user_id)::int
        from chat_message m2
        join chat_thread t2 on t2.id = m2.thread_id
        cross join bounds b
        where m2.role = 'user'
          and m2.created_at >= b.start_ts
          and m2.created_at < b.end_ts
      ) as today_active_users
    from today_threads tt;
  `;

  const rowsParams = [...filterParams, limit, offset];
  const [rowsResult, countResult, totalUsersResult, subscribedResult, onlineResult, lowRemainingResult, kpiResult] =
    await Promise.all([
      pool.query(rowsSql, rowsParams),
      pool.query(countSql, filterParams),
      pool.query('select count(*)::int as total from "user"'),
      pool.query(`
        select count(distinct g.user_id)::int as total
        from redemption_grant g
        where g.status = 'active'
          and coalesce(g.tier, 0) > 0
          and (g.period_start is null or g.period_start <= now())
          and (g.period_end is null or g.period_end >= now())
      `),
      pool.query(`
        select count(distinct t.user_id)::int as total
        from chat_thread t
        where t.updated_at >= now() - interval '${ONLINE_WINDOW_MINUTES} minutes'
      `),
      pool.query(`
        select count(distinct t.user_id)::int as total
        from chat_thread t
        join user_profile up on up.user_id = t.user_id
        where t.updated_at >= now() - interval '${LOW_REMAINING_WINDOW_HOURS} hours'
          and ${remainingExpr} between 0 and 3
      `),
      pool.query(kpiSql),
    ]);

  const rows = rowsResult.rows.map((r) => {
    const latestText = extractText(r.last_message_parts);
    const sensitive = detectSensitive(latestText);
    const status = mapStatus(r);
    const membershipStatus = r.membership_status || "inactive";
    const membershipTier = Number(r.membership_tier || 0);

    const approxFirstReplyMinutes =
      r.last_message_role === "assistant" && r.conversation_created_at && r.last_message_at
        ? Math.max(0, Math.round((new Date(r.last_message_at) - new Date(r.conversation_created_at)) / 60000))
        : null;

    return {
      conversationId: r.conversation_id,
      customerId: r.user_id,
      nickname: r.user_name || "Unknown",
      email: r.email || "",
      emailMasked: maskEmail(r.email || ""),
      lastMessage: latestText,
      lastActiveAt: r.last_active_at,
      status,
      membershipLevel: membershipLevel(membershipTier),
      isSubscribed: isSubscribed(membershipStatus, membershipTier),
      totalChatCount: Number(r.total_chat_count || 0),
      remainingAiChatCount: Number(r.remaining_ai_chat_count || 0),
      sensitiveHit: sensitive.hit,
      sensitiveTypes: sensitive.types,
      important: Boolean(r.is_pinned),
      firstReplyMinutes: approxFirstReplyMinutes,
    };
  });
  const overviewTotal = Number(countResult.rows[0]?.total || 0);
  const totalRegisteredUsers = Number(totalUsersResult.rows[0]?.total || 0);
  const currentSubscribedUsers = Number(subscribedResult.rows[0]?.total || 0);
  const lowRemainingUsers = Number(lowRemainingResult.rows[0]?.total || 0);
  const currentOnlineUsers = Number(onlineResult.rows[0]?.total || 0);
  const kpiRow = kpiResult.rows[0] || {};
  const todayActiveUsers = Number(kpiRow.today_active_users || 0);
  const todayConversations = Number(kpiRow.today_conversations || 0);
  const avgFirstReply = Number(kpiRow.avg_first_reply_minutes || 0);
  const failedCount = Number(kpiRow.failed_conversations || 0);

  return {
    definitions: {
      timezone: ANALYTICS_TIMEZONE,
      todayActiveUsers: "当日有 user 角色消息的去重用户数",
      currentOnlineUsers: `${ONLINE_WINDOW_MINUTES} 分钟内有会话活跃（chat_thread.updated_at）的去重用户数`,
      lowRemainingUsers: `${LOW_REMAINING_WINDOW_HOURS} 小时内活跃且剩余次数 0-3 的去重用户数`,
    },
    kpis: {
      totalRegisteredUsers,
      todayActiveUsers,
      currentOnlineUsers,
      currentSubscribedUsers,
      lowRemainingUsers,

      // Keep legacy fields for backward compatibility.
      todayConversations,
      avgFirstReplyMinutes: avgFirstReply,
      failedConversations: failedCount,
    },
    total: overviewTotal,
    rows,
  };
}


async function queryUsers(params = {}) {
  const funnelSegmentRaw = typeof params.funnelSegment === "string" ? params.funnelSegment.trim() : "";
  const funnelSegment =
    funnelSegmentRaw === "registered" ||
    funnelSegmentRaw === "firstConversation" ||
    funnelSegmentRaw === "subscribed" ||
    funnelSegmentRaw === "renewed"
      ? funnelSegmentRaw
      : "";

  if (funnelSegmentRaw && !funnelSegment) {
    const err = new Error("invalid_funnel_segment");
    err.statusCode = 400;
    throw err;
  }

  let startDate = "";
  let endDate = "";
  if (funnelSegment) {
    const range = await resolveMembershipDateRange(params || {});
    startDate = range.startDate;
    endDate = range.endDate;
  }

  const rangeFilterField =
    funnelSegment === "registered"
      ? "u.created_at"
      : funnelSegment === "firstConversation"
        ? "fum.first_user_message_at"
        : funnelSegment === "subscribed"
          ? "ps.first_paid_at"
          : funnelSegment === "renewed"
            ? "rs.second_paid_at"
            : "";

  const boundsCte = funnelSegment
    ? `,
    bounds as (
      select
        (($1::date)::timestamp at time zone '${ANALYTICS_TIMEZONE}') as start_ts,
        ((($2::date + interval '1 day')::timestamp) at time zone '${ANALYTICS_TIMEZONE}') as end_ts
    )`
    : "";
  const boundsJoin = funnelSegment ? "cross join bounds b" : "";
  const whereRange = funnelSegment
    ? `where ${rangeFilterField} is not null
      and ${rangeFilterField} >= b.start_ts
      and ${rangeFilterField} < b.end_ts`
    : "";
  const sql = `
    with latest_grant as (
      select distinct on (g.user_id)
        g.user_id,
        g.tier,
        g.status,
        g.period_start,
        g.period_end
      from redemption_grant g
      order by
        g.user_id,
        case when g.status = 'active' then 1 else 0 end desc,
        g.period_end desc nulls last,
        g.period_start desc nulls last
    ),
    first_user_message as (
      select
        t.user_id,
        min(m.created_at) as first_user_message_at
      from chat_message m
      join chat_thread t on t.id = m.thread_id
      where m.role = 'user'
      group by t.user_id
    ),
    paid_stats as (
      select
        lower(trim(u.email)) as email_key,
        min(coalesce(g.period_start, g.period_end)) filter (where coalesce(g.tier, 0) > 0) as first_paid_at
      from redemption_grant g
      join "user" u on u.id = g.user_id
      where nullif(trim(u.email), '') is not null
      group by lower(trim(u.email))
    ),
    renew_events as (
      select distinct
        lower(trim(u.email)) as email_key,
        rh.redeemed_at
      from redemption_history rh
      join "user" u on u.id = rh.user_id
      left join redemption_code rc on rc.id = rh.code_id
      where coalesce(rc.tier, 0) > 0
        and nullif(trim(u.email), '') is not null
    ),
    renew_ranked as (
      select
        re.email_key,
        re.redeemed_at,
        row_number() over (
          partition by re.email_key
          order by re.redeemed_at asc
        ) as rn
      from renew_events re
    ),
    renew_stats as (
      select
        email_key,
        min(redeemed_at) filter (where rn = 2) as second_paid_at
      from renew_ranked
      group by email_key
    )${boundsCte},
    chat_stats as (
      select
        t.user_id,
        count(*)::int as thread_count,
        max(t.updated_at) as last_active_at
      from chat_thread t
      group by t.user_id
    ),
    latest_thread as (
      select distinct on (t.user_id)
        t.user_id,
        t.id as latest_conversation_id
      from chat_thread t
      order by t.user_id, t.updated_at desc nulls last, t.created_at desc nulls last
    )
    select
      u.id,
      u.name,
      u.email,
      u.role,
      coalesce(u.banned, false) as banned,
      u.created_at,
      u.updated_at,
      up.birth_at,
      up.gender,
      cs.thread_count,
      cs.last_active_at,
      fum.first_user_message_at,
      ps.first_paid_at,
      rs.second_paid_at,
      lt.latest_conversation_id,
      coalesce(lg.status, 'inactive') as membership_status,
      coalesce(lg.tier, 0) as membership_tier,
      lg.period_end as membership_period_end,
      case
        when (up.credits ->> 'chat') ~ '^[0-9]+$' then (up.credits ->> 'chat')::int
        else 0
      end as remaining_ai_chat_count
    from "user" u
    ${boundsJoin}
    left join user_profile up on up.user_id = u.id
    left join latest_grant lg on lg.user_id = u.id
    left join chat_stats cs on cs.user_id = u.id
    left join first_user_message fum on fum.user_id = u.id
    left join paid_stats ps on ps.email_key = lower(trim(u.email))
    left join renew_stats rs on rs.email_key = lower(trim(u.email))
    left join latest_thread lt on lt.user_id = u.id
    ${whereRange}
    order by u.created_at desc
    limit 5000;
  `;

  const queryParams = funnelSegment ? [startDate, endDate] : [];
  const result = await pool.query(sql, queryParams);

  const toNameParts = (name, email, userId) => {
    const fallback = email && email.includes('@') ? email.split('@')[0] : `user_${(userId || '').slice(-6)}`;
    const safeName = (name || '').trim();

    if (!safeName) return { firstName: fallback, lastName: '' };

    if (safeName.includes(' ')) {
      const parts = safeName.split(/\s+/).filter(Boolean);
      return {
        firstName: parts[0] || fallback,
        lastName: parts.slice(1).join(' '),
      };
    }

    // CJK names are usually compact; keep all in firstName for readability.
    return { firstName: safeName, lastName: '' };
  };

  const toUiRole = (dbRole, membershipTier) => {
    if (dbRole === 'admin' && Number(membershipTier) >= 3) return 'superadmin';
    if (dbRole === 'admin') return 'admin';
    if (Number(membershipTier) >= 2) return 'manager';
    return 'cashier';
  };

  const toAge = (birthAt) => {
    if (!birthAt || typeof birthAt !== 'string') return null;
    const datePart = birthAt.slice(0, 10);
    const date = new Date(datePart);
    if (Number.isNaN(date.getTime())) return null;

    const nowDate = new Date();
    let age = nowDate.getFullYear() - date.getFullYear();
    const monthDiff = nowDate.getMonth() - date.getMonth();
    const dayDiff = nowDate.getDate() - date.getDate();
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
      age -= 1;
    }
    if (age < 0 || age > 120) return null;
    return age;
  };

  const toGenderLabel = (gender) => {
    if (gender === 'male') return '男';
    if (gender === 'female') return '女';
    return '-';
  };

  const now = Date.now();
  const activeThreshold = now - 7 * 24 * 60 * 60 * 1000;

  const rows = result.rows.map((r) => {
    const { firstName, lastName } = toNameParts(r.name, r.email, r.id);
    const email = r.email || '';
    const username = email && email.includes('@') ? email.split('@')[0] : (r.id || '').slice(-8);
    const nickname = (r.name || '').trim() || username;
    const lastActiveAt = r.last_active_at || r.updated_at || r.created_at;
    const status = r.banned
      ? 'suspended'
      : new Date(lastActiveAt).getTime() >= activeThreshold
        ? 'active'
        : 'inactive';

    const membershipTier = Number(r.membership_tier || 0);
    const levelLabel = membershipLevel(membershipTier);
    const membershipStatus = r.membership_status || 'inactive';
    const periodEndTs = r.membership_period_end ? new Date(r.membership_period_end).getTime() : NaN;
    const remainingAiChatCount = Number(r.remaining_ai_chat_count || 0);
    const expiredByStatusOrTime =
      membershipStatus !== 'active' ||
      (!Number.isNaN(periodEndTs) && periodEndTs < now);

    let subscriptionExpired = '';
    if (membershipTier > 0) {
      if (expiredByStatusOrTime) {
        subscriptionExpired = '已过期';
      } else if (remainingAiChatCount <= 0) {
        subscriptionExpired = '已用完';
      } else {
        subscriptionExpired = '未过期';
      }
    } else {
      subscriptionExpired = remainingAiChatCount <= 0 ? '已用完' : '未用完';
    }

    return {
      id: r.id,
      firstName,
      lastName,
      nickname,
      username,
      email,
      phoneNumber: '-',
      status,
      role: toUiRole(r.role, membershipTier),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      gender: toGenderLabel(r.gender),
      userAge: toAge(r.birth_at),
      membershipLevel: levelLabel,
      isSubscribed: isSubscribed(membershipStatus, membershipTier),
      subscriptionStatus: levelLabel,
      subscriptionExpired,
      latestConversationId: r.latest_conversation_id || null,
      totalChatCount: Number(r.thread_count || 0),
      remainingAiChatCount,
      lastActiveAt,
      firstConversationAt: r.first_user_message_at || null,
      firstPaidAt: r.first_paid_at || null,
      secondPaidAt: r.second_paid_at || null,
    };
  });

  return {
    total: rows.length,
    rows,
    filters: funnelSegment ? { funnelSegment, startDate, endDate } : undefined,
  };
}


async function queryConversationDetail(conversationId) {
  const detailSql = `
    with latest_grant as (
      select distinct on (g.user_id)
        g.user_id,
        g.tier,
        g.status,
        g.period_start,
        g.period_end
      from redemption_grant g
      order by
        g.user_id,
        case when g.status = 'active' then 1 else 0 end desc,
        g.period_end desc nulls last,
        g.period_start desc nulls last
    )
    select
      t.id as conversation_id,
      t.user_id,
      t.created_at as conversation_created_at,
      t.updated_at as last_active_at,
      t.is_pinned,
      u.name as user_name,
      u.email,
      coalesce(lg.status, $2) as membership_status,
      coalesce(lg.tier, $3) as membership_tier,
      case
        when (up.credits ->> 'chat') ~ '^[0-9]+$' then (up.credits ->> 'chat')::int
        else 0
      end as remaining_ai_chat_count
    from chat_thread t
    left join "user" u on u.id = t.user_id
    left join user_profile up on up.user_id = t.user_id
    left join latest_grant lg on lg.user_id = t.user_id
    where t.id = $1
    limit 1;
  `;

  const detailResult = await pool.query(detailSql, [conversationId, "inactive", 0]);
  if (!detailResult.rows[0]) return null;

  const messagesSql = `
    select
      m.id,
      m.role,
      m.parts,
      m.feedback,
      m.created_at
    from chat_message m
    where m.thread_id = $1
    order by m.created_at asc
    limit 400;
  `;

  const messagesResult = await pool.query(messagesSql, [conversationId]);
  const r = detailResult.rows[0];

  const messages = messagesResult.rows.map((m) => ({
    id: m.id,
    role: m.role || "unknown",
    text: extractText(m.parts),
    feedback: m.feedback || null,
    createdAt: m.created_at,
  }));

  return {
    conversationId: r.conversation_id,
    customerId: r.user_id,
    nickname: r.user_name || "Unknown",
    emailMasked: maskEmail(r.email || ""),
    membershipLevel: membershipLevel(Number(r.membership_tier || 0)),
    isSubscribed: isSubscribed(r.membership_status || "inactive", Number(r.membership_tier || 0)),
    remainingAiChatCount: Number(r.remaining_ai_chat_count || 0),
    important: Boolean(r.is_pinned),
    createdAt: r.conversation_created_at,
    lastActiveAt: r.last_active_at,
    messages,
  };
}

async function handleApi(req, res, parsedUrl) {
  if (parsedUrl.pathname === "/api/health") {
    return json(res, 200, { ok: true, at: new Date().toISOString() });
  }
  if (parsedUrl.pathname === "/api/overview") {
    try {
      const payload = await queryOverview(parsedUrl.query || {});
      return json(res, 200, payload);
    } catch (err) {
      console.error("[overview] query failed", err);
      return json(res, 500, { error: "overview_query_failed", message: err.message });
    }
  }

  if (parsedUrl.pathname === "/api/membership-ops") {
    try {
      const payload = await queryMembershipOps(parsedUrl.query || {});
      return json(res, 200, payload);
    } catch (err) {
      const statusCode = Number(err?.statusCode || 500);
      console.error("[membership-ops] query failed", err);
      return json(res, statusCode, {
        error: "membership_ops_query_failed",
        message: err.message || "membership_ops_query_failed",
      });
    }
  }

  if (parsedUrl.pathname === "/api/users") {
    try {
      const payload = await queryUsers(parsedUrl.query || {});
      return json(res, 200, payload);
    } catch (err) {
      const statusCode = Number(err?.statusCode || 500);
      console.error("[users] query failed", err);
      return json(res, statusCode, { error: "users_query_failed", message: err.message });
    }
  }

  if (parsedUrl.pathname.startsWith("/api/conversation/")) {
    const conversationId = decodeURIComponent(parsedUrl.pathname.replace("/api/conversation/", ""));
    if (!conversationId) {
      return json(res, 400, { error: "bad_request", message: "missing_conversation_id" });
    }

    try {
      const payload = await queryConversationDetail(conversationId);
      if (!payload) {
        return json(res, 404, { error: "not_found", message: "conversation_not_found" });
      }
      return json(res, 200, payload);
    } catch (err) {
      console.error("[conversation] query failed", err);
      return json(res, 500, { error: "conversation_query_failed", message: err.message });
    }
  }

  if (parsedUrl.pathname === "/api/db-chat" || parsedUrl.pathname === "/api/db-chat/") {
    if (req.method !== "POST") {
      return json(res, 405, { error: "method_not_allowed", message: "use_POST" });
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return json(res, 400, { error: "bad_request", message: err.message || "invalid_json" });
    }

    try {
      const payload = await runDbChatQuery(body.message || "");
      return json(res, 200, payload);
    } catch (err) {
      console.error("[db-chat] query failed", err);
      return json(res, 500, {
        error: "db_chat_failed",
        answer: `查询失败：${err.message || "unknown_error"}`,
      });
    }
  }

  return json(res, 404, { error: "not_found" });
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname.startsWith("/api/")) {
    void handleApi(req, res, parsedUrl);
    return;
  }

  if (parsedUrl.pathname === "/" || parsedUrl.pathname === "/chat-overview-preview.html") {
    sendFile(res, path.join(__dirname, "chat-overview-preview.html"), "text/html; charset=utf-8");
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});

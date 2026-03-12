const { getPool } = require("./db");
const {
  ANALYTICS_TIMEZONE,
  ONLINE_WINDOW_MINUTES,
  LOW_REMAINING_WINDOW_HOURS,
  MEMBERSHIP_OPS_EXCLUDED_EMAILS_SQL_ARRAY,
  relevantPaidCodeSql,
  eligibleFirstPaidEntrySql,
} = require("./config");
const {
  extractText,
  detectSensitive,
  mapStatus,
  membershipLevel,
  isSubscribed,
  maskEmail,
  formatDbValue,
  rowsToMarkdownTable,
  compactSql,
  parseRequestedLimit,
  isValidDateParam,
  addDaysToDateString,
  normalizeHost,
  toPercent,
  extractPosthogCount,
} = require("./helpers");

// ─── 日期范围解析 ─────────────────────────────────────────────────────────────

async function resolveMembershipDateRange(params) {
  const pool = getPool();
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

// ─── PostHog 访客数 ───────────────────────────────────────────────────────────

async function resolvePosthogProjectId(host, apiKey, configuredId) {
  if (configuredId) return String(configuredId).trim();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const currentResponse = await fetch(`${host}/api/projects/@current/`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
    });

    if (currentResponse.ok) {
      const currentPayload = await currentResponse.json();
      if (currentPayload?.id) return String(currentPayload.id);
    }

    const response = await fetch(`${host}/api/projects/?limit=1`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`resolve_project_failed_${response.status}`);

    const payload = await response.json();
    const first = Array.isArray(payload?.results)
      ? payload.results[0]
      : Array.isArray(payload)
        ? payload[0]
        : null;

    if (!first?.id) throw new Error("missing_project_id");
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
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql } }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`posthog_query_failed_${response.status}`);

    const payload = await response.json();
    const count = extractPosthogCount(payload, "visitors");
    if (!Number.isFinite(count)) throw new Error("invalid_posthog_response");

    return { count, status: "ok", message: "PostHog $pageview（distinct_id去重）", projectId };
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

// ─── Overview ─────────────────────────────────────────────────────────────────

async function queryOverview(params) {
  const pool = getPool();
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
  filters.push("coalesce(u.email_verified, false) = true");
  filters.push("coalesce(u.banned, false) = false");

  if (hasCustomerIdFilter) {
    const slot = pushFilterParam(customerIdFilter);
    filters.push(`t.user_id = ${slot}`);
  }

  if (dateRangeFilter === "1d") {
    filters.push("t.updated_at >= now() - interval '1 day'");
  } else if (dateRangeFilter === "7d") {
    filters.push("t.updated_at >= now() - interval '7 days'");
  } else if (dateRangeFilter === "30d") {
    filters.push("t.updated_at >= now() - interval '30 days'");
  }

  if (membershipFilter === "免费版") filters.push("coalesce(lg.tier, 0) = 0");
  else if (membershipFilter === "微光版") filters.push("coalesce(lg.tier, 0) = 1");
  else if (membershipFilter === "烛照版") filters.push("coalesce(lg.tier, 0) = 2");
  else if (membershipFilter === "洞见版") filters.push("coalesce(lg.tier, 0) = 3");

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
    ),
    first_user_message as (
      select m.thread_id, min(m.created_at) as first_user_message_at
      from chat_message m
      where m.role = 'user'
      group by m.thread_id
    ),
    first_assistant_message as (
      select m.thread_id, min(m.created_at) as first_assistant_message_at
      from chat_message m
      where m.role = 'assistant'
      group by m.thread_id
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
      fum.first_user_message_at,
      fam.first_assistant_message_at,
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
    left join first_user_message fum on fum.thread_id = t.id
    left join first_assistant_message fam on fam.thread_id = t.id
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
      select t.id, t.user_id, lm.last_feedback
      from chat_thread t
      left join "user" u on u.id = t.user_id
      left join latest_msg lm on lm.thread_id = t.id
      cross join bounds b
      where t.updated_at >= b.start_ts
        and t.updated_at < b.end_ts
        and coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false
    ),
    first_user_message as (
      select m.thread_id, min(m.created_at) as first_user_message_at
      from chat_message m
      join today_threads tt on tt.id = m.thread_id
      where m.role = 'user'
      group by m.thread_id
    ),
    first_assistant_message as (
      select m.thread_id, min(m.created_at) as first_assistant_message_at
      from chat_message m
      join today_threads tt on tt.id = m.thread_id
      where m.role = 'assistant'
      group by m.thread_id
    )
    select
      count(*)::int as today_conversations,
      count(*) filter (where tt.last_feedback = 'dislike')::int as failed_conversations,
      coalesce(
        round(
          avg(
            case
              when fam.first_assistant_message_at is not null
                   and fum.first_user_message_at is not null
                   and fam.first_assistant_message_at >= fum.first_user_message_at
                then extract(epoch from (fam.first_assistant_message_at - fum.first_user_message_at)) / 60.0
            end
          )
        )::int,
        0
      ) as avg_first_reply_minutes,
      (
        select count(distinct t2.user_id)::int
        from chat_message m2
        join chat_thread t2 on t2.id = m2.thread_id
        left join "user" u3 on u3.id = t2.user_id
        cross join bounds b
        where m2.role = 'user'
          and m2.created_at >= b.start_ts
          and m2.created_at < b.end_ts
          and coalesce(u3.email_verified, false) = true
          and coalesce(u3.banned, false) = false
      ) as today_active_users,
      (
        select count(*)::int
        from "user" u2
        cross join bounds b
        where u2.created_at >= b.start_ts
          and u2.created_at < b.end_ts
          and coalesce(u2.email_verified, false) = true
          and coalesce(u2.banned, false) = false
      ) as today_registered_users
    from today_threads tt
    left join first_user_message fum on fum.thread_id = tt.id
    left join first_assistant_message fam on fam.thread_id = tt.id;
  `;

  const rowsParams = [...filterParams, limit, offset];
  const [rowsResult, countResult, totalUsersResult, subscribedResult, onlineResult, lowRemainingResult, kpiResult] =
    await Promise.all([
      pool.query(rowsSql, rowsParams),
      pool.query(countSql, filterParams),
      pool.query(`
        select count(*)::int as total
        from "user" u
        where coalesce(u.email_verified, false) = true
          and coalesce(u.banned, false) = false
      `),
      pool.query(`
        select count(distinct g.user_id)::int as total
        from redemption_grant g
        join "user" u on u.id = g.user_id
        where g.status = 'active'
          and coalesce(g.tier, 0) > 0
          and (g.period_start is null or g.period_start <= now())
          and (g.period_end is null or g.period_end >= now())
          and coalesce(u.email_verified, false) = true
          and coalesce(u.banned, false) = false
      `),
      pool.query(`
        select count(distinct t.user_id)::int as total
        from chat_thread t
        join "user" u on u.id = t.user_id
        where t.updated_at >= now() - interval '${ONLINE_WINDOW_MINUTES} minutes'
          and coalesce(u.email_verified, false) = true
          and coalesce(u.banned, false) = false
      `),
      pool.query(`
        select count(distinct t.user_id)::int as total
        from chat_thread t
        join "user" u on u.id = t.user_id
        join user_profile up on up.user_id = t.user_id
        where t.updated_at >= now() - interval '${LOW_REMAINING_WINDOW_HOURS} hours'
          and coalesce(u.email_verified, false) = true
          and coalesce(u.banned, false) = false
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

    const firstUserMessageAt = r.first_user_message_at ? new Date(r.first_user_message_at) : null;
    const firstAssistantMessageAt = r.first_assistant_message_at ? new Date(r.first_assistant_message_at) : null;
    const approxFirstReplyMinutes =
      firstUserMessageAt &&
      firstAssistantMessageAt &&
      !Number.isNaN(firstUserMessageAt.getTime()) &&
      !Number.isNaN(firstAssistantMessageAt.getTime()) &&
      firstAssistantMessageAt.getTime() >= firstUserMessageAt.getTime()
        ? Math.round((firstAssistantMessageAt.getTime() - firstUserMessageAt.getTime()) / 60000)
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

  return {
    definitions: {
      timezone: ANALYTICS_TIMEZONE,
      todayActiveUsers: "当日有 user 角色消息的去重对话用户数（仅已验证且未封禁账号）",
      currentOnlineUsers: `${ONLINE_WINDOW_MINUTES} 分钟内有会话活跃（chat_thread.updated_at）的去重用户数（仅已验证且未封禁账号）`,
      lowRemainingUsers: `${LOW_REMAINING_WINDOW_HOURS} 小时内活跃且剩余次数 0-3 的去重用户数（仅已验证且未封禁账号）`,
    },
    kpis: {
      todayRegisteredUsers: Number(kpiRow.today_registered_users || 0),
      totalRegisteredUsers,
      todayActiveUsers: Number(kpiRow.today_active_users || 0),
      currentOnlineUsers,
      currentSubscribedUsers,
      lowRemainingUsers,
      todayConversations: Number(kpiRow.today_conversations || 0),
      avgFirstReplyMinutes: Number(kpiRow.avg_first_reply_minutes || 0),
      failedConversations: Number(kpiRow.failed_conversations || 0),
    },
    total: overviewTotal,
    rows,
  };
}

// ─── Membership Ops ───────────────────────────────────────────────────────────

async function queryMembershipOps(params) {
  const pool = getPool();
  const { startDate, endDate } = await resolveMembershipDateRange(params || {});
  const visitorPromise = fetchPosthogVisitors(startDate, endDate);

  const funnelSql = `
    with bounds as (
      select
        (($1::date)::timestamp at time zone '${ANALYTICS_TIMEZONE}') as start_ts,
        ((($2::date + interval '1 day')::timestamp) at time zone '${ANALYTICS_TIMEZONE}') as end_ts
    ),
    user_email as (
      select u.id as user_id, lower(trim(u.email)) as email_key, u.created_at
      from "user" u
      where nullif(trim(u.email), '') is not null
        and coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false
        and lower(trim(u.email)) <> all (${MEMBERSHIP_OPS_EXCLUDED_EMAILS_SQL_ARRAY})
    ),
    email_registration as (
      select ue.email_key, min(ue.created_at) as registered_at
      from user_email ue
      group by ue.email_key
    ),
    first_conversation_stats as (
      select
        ue.email_key,
        min(m.created_at) as first_user_message_at
      from user_email ue
      join chat_thread t on t.user_id = ue.user_id
      join chat_message m on m.thread_id = t.id
      join email_registration er on er.email_key = ue.email_key
      where m.role = 'user'
        and m.created_at >= er.registered_at
      group by ue.email_key
    ),
    paid_events_raw as (
      select
        lower(trim(u.email)) as email_key,
        rh.id as event_id,
        rh.redeemed_at as paid_at,
        coalesce(rc.tier, 0) as tier_value,
        coalesce(rc.subscription_days, 0) as subscription_days,
        coalesce(rc.type, '') as code_type,
        coalesce(rc.credit_amount, 0) as credit_amount
      from redemption_history rh
      join "user" u on u.id = rh.user_id
      left join redemption_code rc on rc.id = rh.code_id
      where ${relevantPaidCodeSql("rc")}
        and nullif(trim(u.email), '') is not null
        and coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false
        and rh.redeemed_at is not null
        and lower(trim(u.email)) <> all (${MEMBERSHIP_OPS_EXCLUDED_EMAILS_SQL_ARRAY})
    ),
    first_paid_ranked as (
      select
        per.email_key,
        per.tier_value,
        per.subscription_days,
        per.code_type,
        per.credit_amount,
        row_number() over (
          partition by per.email_key
          order by per.paid_at asc, per.event_id asc
        ) as rn
      from paid_events_raw per
    ),
    eligible_paid_emails as (
      select fpr.email_key
      from first_paid_ranked fpr
      where fpr.rn = 1
        and ${eligibleFirstPaidEntrySql("fpr")}
    ),
    paid_events as (
      select per.email_key, per.event_id, per.paid_at
      from paid_events_raw per
      join eligible_paid_emails epe on epe.email_key = per.email_key
    ),
    paid_ranked as (
      select
        pe.email_key,
        pe.event_id,
        pe.paid_at,
        row_number() over (
          partition by pe.email_key
          order by pe.paid_at asc, pe.event_id asc
        ) as rn
      from paid_events pe
    ),
    paid_stats as (
      select
        email_key,
        min(paid_at) filter (where rn = 1) as first_paid_at,
        min(paid_at) filter (where rn = 2) as second_paid_at
      from paid_ranked
      group by email_key
    ),
    registered_cohort as (
      select
        er.email_key,
        er.registered_at,
        fcs.first_user_message_at,
        ps.first_paid_at,
        ps.second_paid_at
      from email_registration er
      left join first_conversation_stats fcs on fcs.email_key = er.email_key
      left join paid_stats ps on ps.email_key = er.email_key
    )
    select
      (
        select count(distinct rc.email_key)::int
        from registered_cohort rc
        cross join bounds b
        where rc.registered_at >= b.start_ts
          and rc.registered_at < b.end_ts
      ) as registered_users,
      (
        select count(distinct rc.email_key)::int
        from registered_cohort rc
        cross join bounds b
        where rc.first_user_message_at is not null
          and rc.first_user_message_at >= rc.registered_at
          and rc.first_user_message_at < b.end_ts
          and rc.registered_at >= b.start_ts
          and rc.registered_at < b.end_ts
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
        from paid_stats ps
        cross join bounds b
        where ps.second_paid_at is not null
          and ps.second_paid_at >= b.start_ts
          and ps.second_paid_at < b.end_ts
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
        values (0, '免费版'), (1, '微光版'), (2, '烛照版'), (3, '洞见版')
      ) as tm(tier_value, tier_label)
    ),
    message_tier_events as (
      select t.user_id, coalesce(gt.tier_value, 0) as tier_value
      from chat_message m
      join chat_thread t on t.id = m.thread_id
      left join "user" u on u.id = t.user_id
      cross join bounds b
      left join lateral (
        select g.tier as tier_value
        from redemption_grant g
        where g.user_id = t.user_id
          and coalesce(g.tier, 0) > 0
          and (g.period_start is null or g.period_start <= m.created_at)
          and (g.period_end is null or g.period_end >= m.created_at)
        order by g.period_end desc nulls last, g.period_start desc nulls last
        limit 1
      ) gt on true
      where m.role = 'user'
        and m.created_at >= b.start_ts
        and m.created_at < b.end_ts
        and coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false
        and coalesce(nullif(lower(trim(u.email)), ''), concat('user:', t.user_id::text)) <> all (${MEMBERSHIP_OPS_EXCLUDED_EMAILS_SQL_ARRAY})
    ),
    user_tier_turns as (
      select user_id, tier_value, count(*)::int as user_turns
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
      select u.id as user_id, coalesce(lg.tier, 0) as tier_value
      from "user" u
      left join latest_grant lg on lg.user_id = u.id
      where coalesce(nullif(lower(trim(u.email)), ''), concat('user:', u.id::text)) <> all (${MEMBERSHIP_OPS_EXCLUDED_EMAILS_SQL_ARRAY})
        and coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false
    ),
    active_user_set as (
      select distinct t.user_id
      from chat_message m
      join chat_thread t on t.id = m.thread_id
      left join "user" u on u.id = t.user_id
      cross join bounds b
      where m.role = 'user'
        and m.created_at >= b.start_ts
        and m.created_at < b.end_ts
        and coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false
        and coalesce(nullif(lower(trim(u.email)), ''), concat('user:', t.user_id::text)) <> all (${MEMBERSHIP_OPS_EXCLUDED_EMAILS_SQL_ARRAY})
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
    user_email as (
      select u.id as user_id, lower(trim(u.email)) as email_key, u.created_at
      from "user" u
      where nullif(trim(u.email), '') is not null
        and coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false
        and lower(trim(u.email)) <> all (${MEMBERSHIP_OPS_EXCLUDED_EMAILS_SQL_ARRAY})
    ),
    email_registration as (
      select ue.email_key, min(ue.created_at) as registered_at
      from user_email ue
      group by ue.email_key
    ),
    first_conversation_stats as (
      select
        ue.email_key,
        min(m.created_at) as first_user_message_at
      from user_email ue
      join chat_thread t on t.user_id = ue.user_id
      join chat_message m on m.thread_id = t.id
      join email_registration er on er.email_key = ue.email_key
      where m.role = 'user'
        and m.created_at >= er.registered_at
      group by ue.email_key
    ),
    paid_events_raw as (
      select
        lower(trim(u.email)) as email_key,
        rh.id as event_id,
        rh.redeemed_at as paid_at,
        coalesce(rc.tier, 0) as tier_value,
        coalesce(rc.subscription_days, 0) as subscription_days,
        coalesce(rc.type, '') as code_type,
        coalesce(rc.credit_amount, 0) as credit_amount
      from redemption_history rh
      join "user" u on u.id = rh.user_id
      left join redemption_code rc on rc.id = rh.code_id
      where ${relevantPaidCodeSql("rc")}
        and nullif(trim(u.email), '') is not null
        and coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false
        and rh.redeemed_at is not null
        and lower(trim(u.email)) <> all (${MEMBERSHIP_OPS_EXCLUDED_EMAILS_SQL_ARRAY})
    ),
    first_paid_ranked as (
      select
        per.email_key,
        per.tier_value,
        per.subscription_days,
        per.code_type,
        per.credit_amount,
        row_number() over (
          partition by per.email_key
          order by per.paid_at asc, per.event_id asc
        ) as rn
      from paid_events_raw per
    ),
    eligible_paid_emails as (
      select fpr.email_key
      from first_paid_ranked fpr
      where fpr.rn = 1
        and ${eligibleFirstPaidEntrySql("fpr")}
    ),
    paid_events as (
      select per.email_key, per.event_id, per.paid_at
      from paid_events_raw per
      join eligible_paid_emails epe on epe.email_key = per.email_key
    ),
    paid_ranked as (
      select
        pe.email_key,
        pe.event_id,
        pe.paid_at,
        row_number() over (
          partition by pe.email_key
          order by pe.paid_at asc, pe.event_id asc
        ) as rn
      from paid_events pe
    ),
    paid_stats as (
      select
        email_key,
        min(paid_at) filter (where rn = 1) as first_paid_at,
        min(paid_at) filter (where rn = 2) as second_paid_at
      from paid_ranked
      group by email_key
    ),
    registered_cohort as (
      select
        er.email_key,
        er.registered_at,
        fcs.first_user_message_at,
        ps.first_paid_at,
        ps.second_paid_at
      from email_registration er
      left join first_conversation_stats fcs on fcs.email_key = er.email_key
      left join paid_stats ps on ps.email_key = er.email_key
    )
    select
      d.day::text as date,
      count(rc.email_key) filter (
        where rc.registered_at >= (d.day::timestamp at time zone '${ANALYTICS_TIMEZONE}')
          and rc.registered_at < ((d.day + interval '1 day')::timestamp at time zone '${ANALYTICS_TIMEZONE}')
      )::int as registered,
      count(rc.email_key) filter (
        where rc.first_user_message_at is not null
          and rc.first_user_message_at >= rc.registered_at
          and rc.first_user_message_at >= (d.day::timestamp at time zone '${ANALYTICS_TIMEZONE}')
          and rc.first_user_message_at < ((d.day + interval '1 day')::timestamp at time zone '${ANALYTICS_TIMEZONE}')
          and rc.registered_at >= (d.day::timestamp at time zone '${ANALYTICS_TIMEZONE}')
          and rc.registered_at < ((d.day + interval '1 day')::timestamp at time zone '${ANALYTICS_TIMEZONE}')
      )::int as active,
      count(ps.email_key) filter (
        where ps.first_paid_at >= (d.day::timestamp at time zone '${ANALYTICS_TIMEZONE}')
          and ps.first_paid_at < ((d.day + interval '1 day')::timestamp at time zone '${ANALYTICS_TIMEZONE}')
      )::int as subscribed,
      count(ps.email_key) filter (
        where ps.second_paid_at >= (d.day::timestamp at time zone '${ANALYTICS_TIMEZONE}')
          and ps.second_paid_at < ((d.day + interval '1 day')::timestamp at time zone '${ANALYTICS_TIMEZONE}')
      )::int as renewed
    from days d
    cross join registered_cohort rc
    left join paid_stats ps on ps.email_key = rc.email_key
    group by d.day
    order by d.day;
  `;

  const [funnelResult, tierResult, trendResult, visitorResult] = await Promise.all([
    pool.query(funnelSql, [startDate, endDate]),
    pool.query(tierSql, [startDate, endDate]),
    pool.query(trendSql, [startDate, endDate]),
    visitorPromise,
  ]);

  const funnel = funnelResult.rows[0] || {};
  const registered = Number(funnel.registered_users || 0);
  const activeUsers = Number(funnel.active_users || 0);
  const subscribed = Number(funnel.subscribed_users || 0);
  const renewed = Number(funnel.renewed_users || 0);
  const visitors = visitorResult.count;

  const tierComparison = tierResult.rows.map((r) => ({
    tier: r.tier,
    totalUsers: Number(r.total_users || 0),
    activeUsers: Number(r.active_users || 0),
    activeRate: Number(r.active_rate || 0),
    totalUserTurns: Number(r.total_user_turns || 0),
    avgUserTurnsPerUser: Number(r.avg_user_turns_per_user || 0),
    p50UserTurnsPerUser: Number(r.p50_user_turns_per_user || 0),
    lowRemainingUsers: Number(r.low_remaining_users || 0),
    lowRemainingRate: Number(r.low_remaining_rate || 0),
    exhaustedUsers: Number(r.exhausted_users || 0),
  }));

  const trend = trendResult.rows.map((r) => ({
    date: r.date,
    label: r.date ? r.date.slice(5) : r.date, // "MM-DD" 格式，用于 X 轴显示
    registered: Number(r.registered || 0),
    activeUsers: Number(r.active || 0),        // 对齐前端 dataKey='activeUsers'
    subscribed: Number(r.subscribed || 0),
    renewed: Number(r.renewed || 0),
  }));

  return {
    range: { timezone: ANALYTICS_TIMEZONE, startDate, endDate },
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

// ─── Users ────────────────────────────────────────────────────────────────────

async function queryUsers(params = {}) {
  const pool = getPool();

  const toArrayParam = (value) => {
    if (Array.isArray(value)) return value.map((x) => String(x || "").trim()).filter(Boolean);
    if (typeof value === "string") return value.split(",").map((x) => x.trim()).filter(Boolean);
    return [];
  };

  const parsePositiveInt = (value, fallback, min, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(Math.floor(parsed), min), max);
  };

  const page = parsePositiveInt(params.page, 1, 1, 500);
  const pageSize = parsePositiveInt(params.pageSize, 10, 1, 5000);
  const offset = (page - 1) * pageSize;
  const nicknameKeyword = typeof params.nickname === "string" ? params.nickname.trim().toLowerCase() : "";
  const subscriptionStatusFilter = toArrayParam(params.subscriptionStatus).filter(
    (x) => x === "免费版" || x === "微光版" || x === "烛照版" || x === "洞见版"
  );
  const subscriptionExpiredFilter = toArrayParam(params.subscriptionExpired).filter(
    (x) => x === "已用完" || x === "未用完" || x === "未过期" || x === "已过期"
  );
  const registerStartDate = typeof params.registerStartDate === "string" ? params.registerStartDate.trim() : "";
  const registerEndDate = typeof params.registerEndDate === "string" ? params.registerEndDate.trim() : "";

  if (registerStartDate && !isValidDateParam(registerStartDate)) {
    const err = new Error("invalid_register_start_date");
    err.statusCode = 400;
    throw err;
  }
  if (registerEndDate && !isValidDateParam(registerEndDate)) {
    const err = new Error("invalid_register_end_date");
    err.statusCode = 400;
    throw err;
  }
  if (registerStartDate && registerEndDate && registerStartDate > registerEndDate) {
    const err = new Error("register_start_date_after_end_date");
    err.statusCode = 400;
    throw err;
  }

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

  const queryParams = [];
  const addParam = (value) => {
    queryParams.push(value);
    return `$${queryParams.length}`;
  };

  const whereConditions = [];

  if (funnelSegment) {
    const startSlot = addParam(startDate);
    const endSlot = addParam(endDate);
    const startBound = `((${startSlot}::date)::timestamp at time zone '${ANALYTICS_TIMEZONE}')`;
    const endBound = `(((${endSlot}::date + interval '1 day')::timestamp) at time zone '${ANALYTICS_TIMEZONE}')`;

    if (funnelSegment === "registered") {
      whereConditions.push(
        "f.email_rank = 1",
        "nullif(trim(f.email), '') is not null",
        `f.created_at >= ${startBound}`,
        `f.created_at < ${endBound}`
      );
    } else if (funnelSegment === "firstConversation") {
      whereConditions.push(
        "f.email_rank = 1",
        "nullif(trim(f.email), '') is not null",
        `f.created_at >= ${startBound}`,
        `f.created_at < ${endBound}`,
        "f.first_user_message_at is not null",
        "f.first_user_message_at >= f.created_at",
        `f.first_user_message_at < ${endBound}`
      );
    } else {
      const rangeFilterField = funnelSegment === "subscribed" ? "f.first_paid_at" : "f.second_paid_at";
      whereConditions.push(
        "f.email_rank = 1",
        "nullif(trim(f.email), '') is not null",
        `${rangeFilterField} is not null`,
        `${rangeFilterField} >= ${startBound}`,
        `${rangeFilterField} < ${endBound}`
      );
    }

    whereConditions.push(`lower(trim(f.email)) <> all (${MEMBERSHIP_OPS_EXCLUDED_EMAILS_SQL_ARRAY})`);
  }

  if (registerStartDate) {
    const slot = addParam(registerStartDate);
    whereConditions.push(`f.created_at >= ((${slot}::date)::timestamp at time zone '${ANALYTICS_TIMEZONE}')`);
  }
  if (registerEndDate) {
    const slot = addParam(registerEndDate);
    whereConditions.push(`f.created_at < (((${slot}::date + interval '1 day')::timestamp) at time zone '${ANALYTICS_TIMEZONE}')`);
  }
  if (nicknameKeyword) {
    const slot = addParam(`%${nicknameKeyword}%`);
    whereConditions.push(`(
      lower(coalesce(f.nickname, '')) like ${slot}
      or lower(coalesce(f.username, '')) like ${slot}
      or lower(coalesce(f.email, '')) like ${slot}
    )`);
  }
  if (subscriptionStatusFilter.length > 0) {
    const slots = subscriptionStatusFilter.map((value) => addParam(value)).join(", ");
    whereConditions.push(`f.subscription_status in (${slots})`);
  }
  if (subscriptionExpiredFilter.length > 0) {
    const slots = subscriptionExpiredFilter.map((value) => addParam(value)).join(", ");
    whereConditions.push(`f.subscription_expired in (${slots})`);
  }

  const whereClause = whereConditions.length > 0 ? `where ${whereConditions.join("\n      and ")}` : "";

  const baseSql = `
    with latest_grant as (
      select distinct on (g.user_id)
        g.user_id, g.tier, g.status, g.period_start, g.period_end
      from redemption_grant g
      order by
        g.user_id,
        case when g.status = 'active' then 1 else 0 end desc,
        g.period_end desc nulls last,
        g.period_start desc nulls last
    ),
    user_email as (
      select u.id as user_id, lower(trim(u.email)) as email_key, u.created_at
      from "user" u
      where nullif(trim(u.email), '') is not null
        and coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false
    ),
    email_registration as (
      select ue.email_key, min(ue.created_at) as registered_at
      from user_email ue
      group by ue.email_key
    ),
    first_user_message as (
      select
        ue.email_key,
        min(m.created_at) as first_user_message_at
      from user_email ue
      join chat_thread t on t.user_id = ue.user_id
      join chat_message m on m.thread_id = t.id
      join email_registration er on er.email_key = ue.email_key
      where m.role = 'user'
        and m.created_at >= er.registered_at
      group by ue.email_key
    ),
    paid_events_raw as (
      select
        lower(trim(u.email)) as email_key,
        rh.id as event_id,
        rh.redeemed_at as paid_at,
        coalesce(rc.tier, 0) as tier_value,
        coalesce(rc.subscription_days, 0) as subscription_days,
        coalesce(rc.type, '') as code_type,
        coalesce(rc.credit_amount, 0) as credit_amount
      from redemption_history rh
      join "user" u on u.id = rh.user_id
      left join redemption_code rc on rc.id = rh.code_id
      where ${relevantPaidCodeSql("rc")}
        and nullif(trim(u.email), '') is not null
        and coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false
        and rh.redeemed_at is not null
    ),
    first_paid_ranked as (
      select
        per.email_key, per.tier_value, per.subscription_days, per.code_type, per.credit_amount,
        row_number() over (partition by per.email_key order by per.paid_at asc, per.event_id asc) as rn
      from paid_events_raw per
    ),
    eligible_paid_emails as (
      select fpr.email_key
      from first_paid_ranked fpr
      where fpr.rn = 1
        and ${eligibleFirstPaidEntrySql("fpr")}
    ),
    paid_events as (
      select per.email_key, per.event_id, per.paid_at
      from paid_events_raw per
      join eligible_paid_emails epe on epe.email_key = per.email_key
    ),
    paid_ranked as (
      select
        pe.email_key, pe.event_id, pe.paid_at,
        row_number() over (partition by pe.email_key order by pe.paid_at asc, pe.event_id asc) as rn
      from paid_events pe
    ),
    paid_stats as (
      select
        email_key,
        min(paid_at) filter (where rn = 1) as first_paid_at,
        min(paid_at) filter (where rn = 2) as second_paid_at
      from paid_ranked
      group by email_key
    ),
    renew_stats as (
      select ps.email_key, ps.second_paid_at from paid_stats ps
    ),
    chat_stats as (
      select t.user_id, count(*)::int as thread_count, max(t.updated_at) as last_active_at
      from chat_thread t
      group by t.user_id
    ),
    latest_thread as (
      select distinct on (t.user_id)
        t.user_id, t.id as latest_conversation_id
      from chat_thread t
      order by t.user_id, t.updated_at desc nulls last, t.created_at desc nulls last
    ),
    raw_users as (
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
        end as remaining_ai_chat_count,
        case
          when nullif(trim(u.name), '') is not null then trim(u.name)
          when nullif(trim(u.email), '') is not null and strpos(u.email, '@') > 1 then split_part(u.email, '@', 1)
          when u.id is not null then right(u.id::text, 8)
          else ''
        end as nickname,
        case
          when nullif(trim(u.email), '') is not null and strpos(u.email, '@') > 1 then split_part(u.email, '@', 1)
          when u.id is not null then right(u.id::text, 8)
          else ''
        end as username,
        row_number() over (
          partition by coalesce(nullif(lower(trim(u.email)), ''), concat('user:', u.id::text))
          order by u.created_at asc, u.id asc
        ) as email_rank
      from "user" u
      left join user_profile up on up.user_id = u.id
      left join latest_grant lg on lg.user_id = u.id
      left join chat_stats cs on cs.user_id = u.id
      left join first_user_message fum on fum.email_key = lower(trim(u.email))
      left join paid_stats ps on ps.email_key = lower(trim(u.email))
      left join renew_stats rs on rs.email_key = lower(trim(u.email))
      left join latest_thread lt on lt.user_id = u.id
      where coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false
    ),
    filtered as (
      select
        r.*,
        case r.membership_tier
          when 1 then '微光版'
          when 2 then '烛照版'
          when 3 then '洞见版'
          else '免费版'
        end as subscription_status,
        case
          when r.membership_tier > 0 then
            case
              when r.membership_status <> 'active'
                   or (r.membership_period_end is not null and r.membership_period_end < now())
                then '已过期'
              when r.remaining_ai_chat_count <= 0 then '已用完'
              else '未过期'
            end
          else
            case
              when r.remaining_ai_chat_count <= 0 then '已用完'
              else '未用完'
            end
        end as subscription_expired
      from raw_users r
    )
  `;

  const rowsSql = `
    ${baseSql}
    select
      f.id,
      f.name,
      f.email,
      f.role,
      f.banned,
      f.created_at,
      f.updated_at,
      f.birth_at,
      f.gender,
      f.thread_count,
      f.last_active_at,
      f.first_user_message_at,
      f.first_paid_at,
      f.second_paid_at,
      f.latest_conversation_id,
      f.membership_status,
      f.membership_tier,
      f.membership_period_end,
      f.remaining_ai_chat_count,
      f.nickname,
      f.username,
      f.subscription_status,
      f.subscription_expired
    from filtered f
    ${whereClause}
    order by f.created_at desc
    limit $${queryParams.length + 1}
    offset $${queryParams.length + 2};
  `;

  const countSql = `
    ${baseSql}
    select count(*)::int as total
    from filtered f
    ${whereClause};
  `;

  const rowsParams = [...queryParams, pageSize, offset];
  const [rowsResult, countResult] = await Promise.all([
    pool.query(rowsSql, rowsParams),
    pool.query(countSql, queryParams),
  ]);

  const toNameParts = (name, email, userId) => {
    const fallback = email && email.includes("@") ? email.split("@")[0] : `user_${(userId || "").slice(-6)}`;
    const safeName = (name || "").trim();
    if (!safeName) return { firstName: fallback, lastName: "" };
    if (safeName.includes(" ")) {
      const parts = safeName.split(/\s+/).filter(Boolean);
      return { firstName: parts[0] || fallback, lastName: parts.slice(1).join(" ") };
    }
    return { firstName: safeName, lastName: "" };
  };

  const toUiRole = (dbRole, membershipTier) => {
    if (dbRole === "admin" && Number(membershipTier) >= 3) return "superadmin";
    if (dbRole === "admin") return "admin";
    if (Number(membershipTier) >= 2) return "manager";
    return "cashier";
  };

  const toAge = (birthAt) => {
    if (!birthAt || typeof birthAt !== "string") return null;
    const date = new Date(birthAt.slice(0, 10));
    if (Number.isNaN(date.getTime())) return null;
    const nowDate = new Date();
    let age = nowDate.getFullYear() - date.getFullYear();
    const monthDiff = nowDate.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && nowDate.getDate() < date.getDate())) age -= 1;
    if (age < 0 || age > 120) return null;
    return age;
  };

  const toGenderLabel = (gender) => {
    if (gender === "male") return "男";
    if (gender === "female") return "女";
    return "-";
  };

  const now = Date.now();
  const activeThreshold = now - 7 * 24 * 60 * 60 * 1000;

  const rows = rowsResult.rows.map((r) => {
    const { firstName, lastName } = toNameParts(r.name, r.email, r.id);
    const email = r.email || "";
    const username = String(r.username || (email.includes("@") ? email.split("@")[0] : (r.id || "").slice(-8)));
    const nickname = String(r.nickname || username);
    const lastActiveAt = r.last_active_at || r.updated_at || r.created_at;
    const status = r.banned
      ? "suspended"
      : new Date(lastActiveAt).getTime() >= activeThreshold
        ? "active"
        : "inactive";

    const membershipTier = Number(r.membership_tier || 0);
    const levelLabel = membershipLevel(membershipTier);
    const membershipStatus = r.membership_status || "inactive";

    return {
      id: r.id,
      firstName,
      lastName,
      nickname,
      username,
      email,
      phoneNumber: "-",
      status,
      role: toUiRole(r.role, membershipTier),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      gender: toGenderLabel(r.gender),
      userAge: toAge(r.birth_at),
      membershipLevel: levelLabel,
      isSubscribed: isSubscribed(membershipStatus, membershipTier),
      subscriptionStatus: String(r.subscription_status || levelLabel),
      subscriptionExpired: String(r.subscription_expired || ""),
      latestConversationId: r.latest_conversation_id || null,
      totalChatCount: Number(r.thread_count || 0),
      remainingAiChatCount: Number(r.remaining_ai_chat_count || 0),
      lastActiveAt,
      firstConversationAt: r.first_user_message_at || null,
      firstPaidAt: r.first_paid_at || null,
      secondPaidAt: r.second_paid_at || null,
    };
  });

  return {
    total: Number(countResult.rows[0]?.total || 0),
    rows,
    page,
    pageSize,
    filters: {
      funnelSegment: funnelSegment || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      nickname: nicknameKeyword || undefined,
      subscriptionStatus: subscriptionStatusFilter,
      subscriptionExpired: subscriptionExpiredFilter,
      registerStartDate: registerStartDate || undefined,
      registerEndDate: registerEndDate || undefined,
    },
  };
}

// ─── Conversation Detail ──────────────────────────────────────────────────────

async function queryConversationDetail(conversationId) {
  const pool = getPool();

  const detailSql = `
    with latest_grant as (
      select distinct on (g.user_id)
        g.user_id, g.tier, g.status, g.period_start, g.period_end
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
      and coalesce(u.email_verified, false) = true
      and coalesce(u.banned, false) = false
    limit 1;
  `;

  const detailResult = await pool.query(detailSql, [conversationId, "inactive", 0]);
  if (!detailResult.rows[0]) return null;

  const messagesSql = `
    select m.id, m.role, m.parts, m.feedback, m.created_at
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

// ─── DB Chat ──────────────────────────────────────────────────────────────────

async function runDbChatQuery(question) {
  const pool = getPool();
  const q = String(question || "").trim();
  if (!q) {
    return { answer: "请输入要查询的问题，例如：**今天新增注册用户有多少？**" };
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
- 最近 10 个注册用户

注：统计口径为「已验证邮箱且未封禁账号」。`;

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
    return { answer: `${summaryPrefix} **${formatDbValue(first[key])}**`, executedSql: compactSql(sql) };
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
      where u.created_at >= b.start_ts
        and u.created_at < b.end_ts
        and coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false;`,
      "今日新增注册人数："
    );
  }

  if (has(["注册", "用户"]) && has(["总", "人数", "多少"])) {
    return runScalar(
      `select count(*)::int as 注册总人数
      from "user" u
      where coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false;`,
      "注册总人数："
    );
  }

  if (has(["今日", "今天"]) && has(["活跃"])) {
    return runScalar(
      `${shanghaiDayBounds}
      select count(distinct t.user_id)::int as 今日活跃用户数
      from chat_message m
      join chat_thread t on t.id = m.thread_id
      left join "user" u on u.id = t.user_id
      cross join bounds b
      where m.role = 'user'
        and m.created_at >= b.start_ts
        and m.created_at < b.end_ts
        and coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false;`,
      "今日活跃用户数："
    );
  }

  if (has(["在线"])) {
    return runScalar(
      `select count(distinct t.user_id)::int as 当前在线人数
      from chat_thread t
      join "user" u on u.id = t.user_id
      where t.updated_at >= now() - interval '${ONLINE_WINDOW_MINUTES} minutes'
        and coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false;`,
      `当前在线人数（${ONLINE_WINDOW_MINUTES}分钟内活跃）：`
    );
  }

  if (has(["订阅"]) && has(["人数", "用户", "多少"])) {
    return runScalar(
      `${latestGrantCte}
      select count(*)::int as 当前订阅人数
      from latest_grant lg
      join "user" u on u.id = lg.user_id
      where lg.tier > 0
        and lg.status = 'active'
        and (lg.period_start is null or lg.period_start <= now())
        and (lg.period_end is null or lg.period_end >= now())
        and coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false;`,
      "当前订阅人数："
    );
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
      where coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false
      group by 1
      order by 2 desc;`;
    const result = await pool.query(sql);
    return {
      answer: `会员等级分布如下：\n\n${rowsToMarkdownTable(result.rows)}`,
      executedSql: compactSql(sql),
    };
  }

  if (has(["剩余"]) && has(["0", "用完"])) {
    return runScalar(
      `select count(*)::int as 剩余次数为0的用户数
      from "user" u
      left join user_profile up on up.user_id = u.id
      where case
        when (up.credits ->> 'chat') ~ '^[0-9]+$' then (up.credits ->> 'chat')::int
        else 0
      end <= 0
        and coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false;`,
      "剩余次数为 0 的用户数："
    );
  }

  if (has(["低", "不足", "<=3"]) && has(["剩余", "额度"])) {
    return runScalar(
      `select count(*)::int as 低剩余额度用户数
      from "user" u
      left join user_profile up on up.user_id = u.id
      where case
        when (up.credits ->> 'chat') ~ '^[0-9]+$' then (up.credits ->> 'chat')::int
        else 0
      end between 0 and 3
        and coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false;`,
      "低剩余额度用户数（0-3）："
    );
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
      where coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false
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
      where coalesce(u.email_verified, false) = true
        and coalesce(u.banned, false) = false
      order by u.created_at desc
      limit $1;`;
    const result = await pool.query(sql, [limit]);
    return {
      answer: `最近 ${limit} 个注册用户：\n\n${rowsToMarkdownTable(result.rows)}`,
      executedSql: compactSql(sql),
    };
  }

  return { answer: `暂时没理解这个问题：\n\n> ${q}\n\n${helpText}` };
}

module.exports = {
  queryOverview,
  queryMembershipOps,
  queryUsers,
  queryConversationDetail,
  runDbChatQuery,
};

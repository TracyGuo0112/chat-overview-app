const dotenv = require("dotenv");
const { createPoolFromEnv } = require("./_db");

dotenv.config();

const TZ = "Asia/Shanghai";
const API_BASE = process.env.API_BASE || "http://127.0.0.1:4173";
const ONLINE_WINDOW_MINUTES = Number.isFinite(Number(process.env.ONLINE_WINDOW_MINUTES))
  ? Math.max(1, Math.floor(Number(process.env.ONLINE_WINDOW_MINUTES)))
  : 5;
const LOW_REMAINING_WINDOW_HOURS = Number.isFinite(Number(process.env.LOW_REMAINING_WINDOW_HOURS))
  ? Math.max(1, Math.floor(Number(process.env.LOW_REMAINING_WINDOW_HOURS)))
  : 48;

const remainingExpr = `
  case
    when (up.credits ->> 'chat') ~ '^[0-9]+$' then (up.credits ->> 'chat')::int
    else 0
  end
`;

async function fetchJson(url) {
  const resp = await fetch(url);
  const body = await resp.json();
  return { ok: resp.ok, status: resp.status, body };
}

async function main() {
  const pool = createPoolFromEnv();
  const report = {
    now: new Date().toISOString(),
    overview: {},
    users: {},
    membershipOps: {},
    env: {
      API_BASE,
      ONLINE_WINDOW_MINUTES,
      LOW_REMAINING_WINDOW_HOURS,
      TZ,
    },
  };

  try {
    const overviewApi = await fetchJson(
      `${API_BASE}/api/overview?limit=15&offset=0&dateRange=all&membership=all&remaining=all&q=`
    );
    const overview = overviewApi.body || {};
    const totalUsers = Number((await pool.query('select count(*)::int as total from "user"')).rows[0].total || 0);

    const currentSubscribed = Number(
      (
        await pool.query(`
          select count(distinct g.user_id)::int as total
          from redemption_grant g
          where g.status = 'active'
            and coalesce(g.tier, 0) > 0
            and (g.period_start is null or g.period_start <= now())
            and (g.period_end is null or g.period_end >= now())
        `)
      ).rows[0].total || 0
    );

    const currentOnline = Number(
      (
        await pool.query(`
          select count(distinct t.user_id)::int as total
          from chat_thread t
          where t.updated_at >= now() - interval '${ONLINE_WINDOW_MINUTES} minutes'
        `)
      ).rows[0].total || 0
    );

    const lowRemaining = Number(
      (
        await pool.query(`
          select count(distinct t.user_id)::int as total
          from chat_thread t
          join user_profile up on up.user_id = t.user_id
          where t.updated_at >= now() - interval '${LOW_REMAINING_WINDOW_HOURS} hours'
            and ${remainingExpr} between 0 and 3
        `)
      ).rows[0].total || 0
    );

    const todayActive = Number(
      (
        await pool.query(`
          with bounds as (
            select
              ((now() at time zone '${TZ}')::date::timestamp at time zone '${TZ}') as start_ts,
              ((((now() at time zone '${TZ}')::date + interval '1 day')::timestamp) at time zone '${TZ}') as end_ts
          )
          select count(distinct t.user_id)::int as total
          from chat_message m
          join chat_thread t on t.id = m.thread_id
          cross join bounds b
          where m.role = 'user'
            and m.created_at >= b.start_ts
            and m.created_at < b.end_ts
        `)
      ).rows[0].total || 0
    );

    report.overview = {
      apiOk: overviewApi.ok,
      checks: {
        totalRegisteredUsers: {
          api: Number(overview?.kpis?.totalRegisteredUsers || 0),
          sql: totalUsers,
        },
        currentSubscribedUsers: {
          api: Number(overview?.kpis?.currentSubscribedUsers || 0),
          sql: currentSubscribed,
        },
        currentOnlineUsers: {
          api: Number(overview?.kpis?.currentOnlineUsers || 0),
          sql: currentOnline,
        },
        lowRemainingUsers: {
          api: Number(overview?.kpis?.lowRemainingUsers || 0),
          sql: lowRemaining,
        },
        todayActiveUsers: {
          api: Number(overview?.kpis?.todayActiveUsers || 0),
          sql: todayActive,
        },
      },
    };

    const usersBase = await fetchJson(`${API_BASE}/api/users?page=1&pageSize=10`);
    const usersJan = await fetchJson(
      `${API_BASE}/api/users?page=1&pageSize=100&registerStartDate=2026-01-01&registerEndDate=2026-01-31`
    );
    const usersTier = await fetchJson(`${API_BASE}/api/users?page=1&pageSize=100&subscriptionStatus=微光版`);
    const usersStatus = await fetchJson(`${API_BASE}/api/users?page=1&pageSize=100&subscriptionExpired=已过期`);
    const usersBadRange = await fetchJson(
      `${API_BASE}/api/users?registerStartDate=2026-02-10&registerEndDate=2026-01-01`
    );

    const allJanInRange = (usersJan.body.rows || []).every((r) => {
      const date = new Date(r.createdAt);
      return !Number.isNaN(date.getTime()) && date >= new Date("2026-01-01T00:00:00.000Z") && date < new Date("2026-02-01T00:00:00.000Z");
    });
    const allTierMatch = (usersTier.body.rows || []).every((r) => r.subscriptionStatus === "微光版");
    const allStatusMatch = (usersStatus.body.rows || []).every((r) => r.subscriptionExpired === "已过期");

    report.users = {
      base: {
        ok: usersBase.ok,
        total: Number(usersBase.body.total || 0),
        rows: Array.isArray(usersBase.body.rows) ? usersBase.body.rows.length : 0,
      },
      registerRangeCheck: {
        ok: usersJan.ok,
        allRowsInRange: allJanInRange,
      },
      subscriptionStatusCheck: {
        ok: usersTier.ok,
        allRowsMatch: allTierMatch,
      },
      subscriptionExpiredCheck: {
        ok: usersStatus.ok,
        allRowsMatch: allStatusMatch,
      },
      invalidDateRangeCheck: {
        status: usersBadRange.status,
        message: usersBadRange.body?.message || null,
      },
    };

    const membershipApi = await fetchJson(`${API_BASE}/api/membership-ops?startDate=2026-01-01&endDate=2026-01-31`);
    const membership = membershipApi.body || {};

    const membershipSql = await pool.query(
      `
      with bounds as (
        select
          (($1::date)::timestamp at time zone '${TZ}') as start_ts,
          ((($2::date + interval '1 day')::timestamp) at time zone '${TZ}') as end_ts
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
          row_number() over (partition by re.email_key order by re.redeemed_at asc) as rn
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
        ) as registered,
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
        ) as subscribed,
        (
          select count(*)::int
          from renew_stats rs
          cross join bounds b
          where rs.second_paid_at is not null
            and rs.second_paid_at >= b.start_ts
            and rs.second_paid_at < b.end_ts
        ) as renewed
      `,
      ["2026-01-01", "2026-01-31"]
    );

    const sqlRow = membershipSql.rows[0] || {};
    report.membershipOps = {
      ok: membershipApi.ok,
      funnelChecks: {
        registered: { api: Number(membership?.funnel?.registered || 0), sql: Number(sqlRow.registered || 0) },
        activeUsers: { api: Number(membership?.funnel?.activeUsers || 0), sql: Number(sqlRow.active_users || 0) },
        subscribed: { api: Number(membership?.funnel?.subscribed || 0), sql: Number(sqlRow.subscribed || 0) },
        renewed: { api: Number(membership?.funnel?.renewed || 0), sql: Number(sqlRow.renewed || 0) },
      },
    };

    const assert = [];
    Object.values(report.overview.checks).forEach((item) => assert.push(item.api === item.sql));
    assert.push(report.users.base.ok);
    assert.push(report.users.registerRangeCheck.ok && report.users.registerRangeCheck.allRowsInRange);
    assert.push(report.users.subscriptionStatusCheck.ok && report.users.subscriptionStatusCheck.allRowsMatch);
    assert.push(report.users.subscriptionExpiredCheck.ok && report.users.subscriptionExpiredCheck.allRowsMatch);
    assert.push(report.users.invalidDateRangeCheck.status === 400);
    Object.values(report.membershipOps.funnelChecks).forEach((item) => assert.push(item.api === item.sql));

    report.ok = assert.every(Boolean);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

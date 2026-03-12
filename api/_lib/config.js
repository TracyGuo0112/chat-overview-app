const ANALYTICS_TIMEZONE = "Asia/Shanghai";

const ONLINE_WINDOW_MINUTES = Number.isFinite(Number(process.env.ONLINE_WINDOW_MINUTES))
  ? Math.max(1, Math.floor(Number(process.env.ONLINE_WINDOW_MINUTES)))
  : 5;

const LOW_REMAINING_WINDOW_HOURS = Number.isFinite(Number(process.env.LOW_REMAINING_WINDOW_HOURS))
  ? Math.max(1, Math.floor(Number(process.env.LOW_REMAINING_WINDOW_HOURS)))
  : 48;

const MEMBERSHIP_OPS_EXCLUDED_EMAILS = [
  "1485059943@qq.com",
  "zhichengfan18@gmail.com",
  "yanessagyh@gmail.com",
  "1207173024@qq.com",
]
  .map((email) => String(email || "").trim().toLowerCase())
  .filter(Boolean);

const MEMBERSHIP_OPS_EXCLUDED_EMAILS_SQL_ARRAY =
  MEMBERSHIP_OPS_EXCLUDED_EMAILS.length > 0
    ? `array[${MEMBERSHIP_OPS_EXCLUDED_EMAILS.map((email) => `'${email.replace(/'/g, "''")}'`).join(", ")}]::text[]`
    : "array[]::text[]";

function standardInitialSubscriptionSql(alias) {
  return `(
    (${alias}.tier_value = 1 and ${alias}.subscription_days = 7)
    or (${alias}.tier_value = 2 and ${alias}.subscription_days = 30)
    or (${alias}.tier_value = 3 and ${alias}.subscription_days = 30)
  )`;
}

function creditSubscriptionSql(typeExpression, amountExpression) {
  return `(
    lower(coalesce(${typeExpression}, '')) = 'credits'
    and coalesce(${amountExpression}, 0) in (10, 50, 600)
  )`;
}

function relevantPaidCodeSql(alias) {
  return `(
    (
      (${alias}.tier = 1 and coalesce(${alias}.subscription_days, 0) = 7)
      or (${alias}.tier = 2 and coalesce(${alias}.subscription_days, 0) = 30)
      or (${alias}.tier = 3 and coalesce(${alias}.subscription_days, 0) = 30)
    )
    or ${creditSubscriptionSql(`${alias}.type`, `${alias}.credit_amount`)}
  )`;
}

function eligibleFirstPaidEntrySql(alias) {
  return `(
    ${standardInitialSubscriptionSql(alias)}
    or ${creditSubscriptionSql(`${alias}.code_type`, `${alias}.credit_amount`)}
  )`;
}

module.exports = {
  ANALYTICS_TIMEZONE,
  ONLINE_WINDOW_MINUTES,
  LOW_REMAINING_WINDOW_HOURS,
  MEMBERSHIP_OPS_EXCLUDED_EMAILS,
  MEMBERSHIP_OPS_EXCLUDED_EMAILS_SQL_ARRAY,
  standardInitialSubscriptionSql,
  creditSubscriptionSql,
  relevantPaidCodeSql,
  eligibleFirstPaidEntrySql,
};

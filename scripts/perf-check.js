const dotenv = require("dotenv");

dotenv.config();

const API_BASE = process.env.API_BASE || "http://127.0.0.1:4173";
const RUNS_PER_CASE = Number.isFinite(Number(process.env.PERF_RUNS))
  ? Math.max(3, Math.floor(Number(process.env.PERF_RUNS)))
  : 20;
const SLOW_MS = 2000;

const CASES = [
  {
    name: "overview_default",
    url: `${API_BASE}/api/overview?limit=15&offset=0&dateRange=all&membership=all&remaining=all&q=`,
  },
  {
    name: "overview_membership_remaining",
    url: `${API_BASE}/api/overview?limit=15&offset=0&dateRange=7d&membership=烛照版&remaining=0-10&q=`,
  },
  {
    name: "users_default",
    url: `${API_BASE}/api/users?page=1&pageSize=20`,
  },
  {
    name: "users_filtered",
    url: `${API_BASE}/api/users?page=1&pageSize=20&subscriptionStatus=微光版&subscriptionExpired=已过期&registerStartDate=2026-01-01&registerEndDate=2026-01-31`,
  },
];

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[index];
}

async function measure(url) {
  const start = process.hrtime.bigint();
  const response = await fetch(url);
  await response.text();
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  return { ok: response.ok, status: response.status, elapsedMs };
}

async function runCase(item) {
  const latencies = [];
  let failures = 0;
  for (let i = 0; i < RUNS_PER_CASE; i += 1) {
    const result = await measure(item.url);
    if (!result.ok) {
      failures += 1;
      continue;
    }
    latencies.push(result.elapsedMs);
  }

  latencies.sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const max = latencies[latencies.length - 1] || 0;
  const min = latencies[0] || 0;
  const avg = latencies.length ? latencies.reduce((sum, x) => sum + x, 0) / latencies.length : 0;

  return {
    name: item.name,
    runs: RUNS_PER_CASE,
    success: latencies.length,
    failures,
    p50Ms: Number(p50.toFixed(2)),
    p95Ms: Number(p95.toFixed(2)),
    avgMs: Number(avg.toFixed(2)),
    minMs: Number(min.toFixed(2)),
    maxMs: Number(max.toFixed(2)),
    pass: failures === 0 && p95 < SLOW_MS,
  };
}

async function main() {
  const results = [];
  for (const item of CASES) {
    // Run sequentially to reduce noise from local DB contention.
    // This is enough for quick acceptance.
    // eslint-disable-next-line no-await-in-loop
    const result = await runCase(item);
    results.push(result);
    console.log(
      `[perf] ${result.name}: p95=${result.p95Ms}ms avg=${result.avgMs}ms success=${result.success}/${result.runs} pass=${result.pass}`
    );
  }

  const ok = results.every((x) => x.pass);
  const report = {
    now: new Date().toISOString(),
    thresholdMs: SLOW_MS,
    runsPerCase: RUNS_PER_CASE,
    ok,
    results,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

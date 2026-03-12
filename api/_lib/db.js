const { Pool } = require("pg");
const { attachDatabasePool } = require("@vercel/functions");

// 支持两种配置方式：
// 1. 单个 DATABASE_URL（推荐，Vercel 上只需配一个变量）
// 2. 分散的 PGHOST / PGUSER / PGPASSWORD / PGDATABASE（本地 .env 兼容）
function createPool() {
  const connectionString = process.env.DATABASE_URL;

  const config = connectionString
    ? { connectionString }
    : {
        host: process.env.PGHOST,
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
      };

  const pool = new Pool({
    ...config,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
  });

  // Vercel Fluid Compute：函数挂起前自动释放空闲连接，防止连接泄漏
  try {
    attachDatabasePool(pool);
  } catch (_) {
    // 本地开发环境没有 Fluid Compute，忽略报错
  }

  return pool;
}

let pool;

function getPool() {
  if (!pool) {
    pool = createPool();
  }
  return pool;
}

module.exports = { getPool };

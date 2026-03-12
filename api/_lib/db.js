const { Pool } = require("pg");

// 模块级单例：Vercel 函数容器保温时复用连接，冷启动时重建。
// max: 1 避免 Serverless 多实例并发导致数据库连接数爆炸。
let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      // Neon 必须开启 SSL
      ssl: { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

module.exports = { getPool };

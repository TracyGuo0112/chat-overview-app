const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { createPoolFromEnv } = require("./_db");

dotenv.config();

const SQL_PATH = path.join(__dirname, "..", "sql", "performance-indexes.sql");

function splitSqlStatements(sql) {
  const withoutLineComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  return withoutLineComments
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function main() {
  if (!fs.existsSync(SQL_PATH)) {
    throw new Error(`sql_not_found: ${SQL_PATH}`);
  }

  const rawSql = fs.readFileSync(SQL_PATH, "utf8");
  const statements = splitSqlStatements(rawSql);
  if (statements.length === 0) {
    throw new Error("no_sql_statements");
  }

  const pool = createPoolFromEnv();
  try {
    console.log(`[db:apply-indexes] start with ${statements.length} statements`);
    for (let i = 0; i < statements.length; i += 1) {
      const sql = statements[i];
      const firstLine = sql.split("\n")[0].slice(0, 120);
      process.stdout.write(`[${i + 1}/${statements.length}] ${firstLine} ... `);
      await pool.query(sql);
      console.log("ok");
    }
    console.log("[db:apply-indexes] completed");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[db:apply-indexes] failed:", error.message);
  process.exit(1);
});

const { Pool } = require("pg");

function createPoolFromEnv() {
  return new Pool({
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: false },
  });
}

module.exports = {
  createPoolFromEnv,
};

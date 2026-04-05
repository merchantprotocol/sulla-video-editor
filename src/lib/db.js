const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sulla:sulla@localhost:5432/sulla_video',
});

module.exports = pool;

'use strict';

const { Pool } = require('pg');

const poolConfig = { connectionString: process.env.DATABASE_URL };

// Supabase (and most cloud Postgres providers) require SSL
if (process.env.DATABASE_URL?.includes('supabase.com') ||
    process.env.DB_SSL === 'true') {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected DB error', err);
  process.exit(1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};

'use strict';

const { Pool } = require('pg');

const poolConfig = { connectionString: process.env.DATABASE_URL };

// Supabase (and most cloud Postgres providers) require SSL. Validate the
// certificate (rejectUnauthorized: true) to prevent MITM. If the host's CA is
// not in Node's trust store, supply it via DB_CA_CERT.
if (process.env.DATABASE_URL?.includes('supabase.com') ||
    process.env.DB_SSL === 'true') {
  poolConfig.ssl = { rejectUnauthorized: true };
  if (process.env.DB_CA_CERT) {
    poolConfig.ssl.ca = process.env.DB_CA_CERT;
  }
}

const pool = new Pool(poolConfig);

// Log idle-client errors but DO NOT exit: pg recovers the pool on the next
// query, so a transient DB hiccup must not take the whole instance down.
pool.on('error', (err) => {
  console.error('Unexpected idle DB client error:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};

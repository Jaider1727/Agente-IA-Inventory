'use strict';

const fs = require('fs');
const { Pool } = require('pg');

const poolConfig = { connectionString: process.env.DATABASE_URL };

// A local DB on the Docker network needs no TLS. For a remote database, opt in
// with DB_SSL=true: the certificate is then verified (rejectUnauthorized: true).
// Supply the CA via DB_CA_CERT_PATH (path to a .crt) or DB_CA_CERT (inline PEM)
// if it is not already in Node's trust store.
if (process.env.DB_SSL === 'true') {
  poolConfig.ssl = { rejectUnauthorized: true };
  const ca = process.env.DB_CA_CERT
    || (process.env.DB_CA_CERT_PATH && fs.readFileSync(process.env.DB_CA_CERT_PATH, 'utf8'));
  if (ca) poolConfig.ssl.ca = ca;
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

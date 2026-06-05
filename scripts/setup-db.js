'use strict';

/**
 * Creates the database (local only) and applies pending migrations.
 * Tracks applied migrations in schema_migrations to avoid re-running them.
 *
 * Usage:
 *   node scripts/setup-db.js                 # local: creates DB + migrates
 *   node scripts/setup-db.js --migrate-only  # hosted DB (Supabase): migrates only
 */

require('dotenv').config();

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERROR: DATABASE_URL is not set in .env');
  process.exit(1);
}

const migrateOnly = process.argv.includes('--migrate-only');

function buildClientConfig(url) {
  const config = { connectionString: url };
  if (url.includes('supabase.com') || process.env.DB_SSL === 'true') {
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
}

async function createDatabase() {
  const url = new URL(connectionString);
  const dbName = url.pathname.replace('/', '');
  const adminUrl = `${url.protocol}//${url.username}:${url.password}@${url.hostname}:${url.port}/postgres`;

  const client = new Client(buildClientConfig(adminUrl));
  await client.connect();

  const { rows } = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [dbName]
  );

  if (rows.length === 0) {
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Database "${dbName}" created.`);
  } else {
    console.log(`Database "${dbName}" already exists.`);
  }

  await client.end();
}

async function runMigrations() {
  const client = new Client(buildClientConfig(connectionString));
  await client.connect();

  // Bootstrap the migrations tracking table — safe to run on every startup.
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, '..', 'src', 'db', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await client.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [file]
    );

    if (rows.length > 0) {
      console.log(`Skipped (already applied): ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1)',
      [file]
    );
    console.log(`Applied: ${file}`);
  }

  await client.end();
}

(async () => {
  try {
    if (!migrateOnly) {
      await createDatabase();
    }
    await runMigrations();
    console.log('Setup complete.');
  } catch (err) {
    console.error('Setup failed:', err.message);
    process.exit(1);
  }
})();

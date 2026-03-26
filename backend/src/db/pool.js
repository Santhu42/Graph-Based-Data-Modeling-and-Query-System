'use strict';

const { Pool } = require('pg');

const config = process.env.DATABASE_URL 
  ? {
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    }
  : {
      host:     process.env.DB_HOST     || 'localhost',
      port:     Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME     || 'fde_db',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || 'admin123',
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    };

// Render and most managed databases require SSL
if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
  config.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(config);
// Crash early if the DB is unreachable
pool.connect((err, client, release) => {
  if (err) {
    console.error('[db] ✘ Connection failed:', err.message);
    process.exit(1);
  }
  release();
  console.log('[db] ✔ PostgreSQL connected');
});

module.exports = pool;

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

// Only enable SSL for non-localhost DATABASE_URLs (mostly for external DBs), configurable via an override.
if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')) {
  // If the user explicitly sets DB_SSL=false, don't use SSL
  if (process.env.DB_SSL !== 'false') {
    config.ssl = { rejectUnauthorized: false };
  }
}

const pool = new Pool(config);

const connectWithRetry = (retries = 5, delay = 5000) => {
  pool.connect((err, client, release) => {
    if (err) {
      console.error(`[db] ✘ Connection failed (${retries} retries left).`);
      console.error('[db] Error details:', err.message || err);
      console.error('[db] Is DATABASE_URL set?', !!process.env.DATABASE_URL);
      
      if (retries === 0) {
        console.error('[db] ✘ Giving up. Please check your DB credentials/URL.');
        process.exit(1);
      }
      setTimeout(() => connectWithRetry(retries - 1, delay), delay);
      return;
    }
    release();
    console.log('[db] ✔ PostgreSQL connected successfully!');
  });
};

connectWithRetry();

module.exports = pool;

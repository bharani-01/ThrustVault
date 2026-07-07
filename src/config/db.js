'use strict';
const { Pool } = require('pg');

const isLocal = process.env.DB_HOST === 'localhost' || process.env.DB_HOST === '127.0.0.1';
const useSSL = process.env.DB_SSL === 'true' || (!isLocal && process.env.DB_SSL !== 'false');

const pool = new Pool({
  host:                   process.env.DB_HOST,
  port:                   parseInt(process.env.DB_PORT || '5432', 10),
  database:               process.env.DB_NAME     || 'postgres',
  user:                   process.env.DB_USER     || 'postgres',
  password:               process.env.DB_PASSWORD,
  ssl:                    useSSL ? { rejectUnauthorized: false } : false,
  max:                    10,
  idleTimeoutMillis:      30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

module.exports = pool;

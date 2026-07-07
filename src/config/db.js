'use strict';
const { Pool } = require('pg');

const isLocal = process.env.DB_HOST === 'localhost' || process.env.DB_HOST === '127.0.0.1';

const pool = new Pool({
  host:                   process.env.DB_HOST,
  port:                   parseInt(process.env.DB_PORT || '5432', 10),
  database:               process.env.DB_NAME     || 'postgres',
  user:                   process.env.DB_USER     || 'postgres',
  password:               process.env.DB_PASSWORD,
  ssl:                    isLocal ? false : { rejectUnauthorized: false },
  max:                    10,
  idleTimeoutMillis:      30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

module.exports = pool;

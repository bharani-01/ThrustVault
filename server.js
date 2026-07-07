'use strict';
require('dotenv').config();

const app  = require('./src/app');
const pool = require('./src/config/db');

const PORT = parseInt(process.env.PORT || '8000', 10);

async function bootstrap() {
  try {
    const client = await pool.connect();
    client.release();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀  ThrustVault running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌  Database connection failed:', err.message);
    process.exit(1);
  }
}

bootstrap();

'use strict';
require('dotenv').config();

const app = require('./src/app');
const pool = require('./src/config/db');

const PORT = parseInt(process.env.PORT || '8000', 10);

// Verify database connection before starting the server
pool.query('SELECT 1').then(() => {
  console.log('✅  AWS RDS connection verified');
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀  ThrustVault running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('❌  Database connection failed:', err.message);
  process.exit(1);
});

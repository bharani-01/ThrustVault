'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '../../database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'guest_catalog.db');
const sqliteDb = new DatabaseSync(dbPath);

console.log(`💾 SQLite Guest database connection established at: ${dbPath}`);

module.exports = sqliteDb;

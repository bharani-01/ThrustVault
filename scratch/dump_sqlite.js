'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, '../database/guest_catalog.db');
const db = new DatabaseSync(dbPath);

console.log('--- CATEGORIES ---');
const categories = db.prepare('SELECT id, name, description FROM categories').all();
console.log(JSON.stringify(categories, null, 2));

console.log('\n--- MOTORS (FIRST 10) ---');
const motors = db.prepare('SELECT id, category_id, motor_name, company, max_thrust, recommended_esc, recommended_propeller FROM motors LIMIT 10').all();
console.log(JSON.stringify(motors, null, 2));

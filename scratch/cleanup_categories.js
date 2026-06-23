'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../src/config/db');
const { syncPostgresToSqlite } = require('../src/utils/sqliteSync');

const STANDARD_CATEGORIES = [
  'No Thrust',
  'Babyhawk O3 Parts',
  '5kg Class',
  '10kg Class',
  '20kg Class',
  '50kg Class',
  '120kg Class'
];

function parseThrustToGrams(thrustStr) {
  if (!thrustStr) return 0;
  const normalized = thrustStr.trim().toLowerCase().replace(/\s+/g, '');
  const match = normalized.match(/^([0-9.]+)(kg|g|n)?$/);
  if (match) {
    const val = parseFloat(match[1]);
    const unit = match[2] || 'kg';
    if (unit === 'g') return val;
    if (unit === 'n') return val * 101.97; // 1 Newton ~ 101.97g
    return val * 1000; // default is kg
  }
  const numbers = normalized.match(/[0-9.]+/);
  if (numbers) {
    const val = parseFloat(numbers[0]);
    if (normalized.includes('g') && !normalized.includes('kg')) {
      return val;
    }
    if (normalized.includes('n')) {
      return val * 101.97;
    }
    return val * 1000;
  }
  return 0;
}

function getThrustCategory(thrustG, originalCategoryName) {
  if (originalCategoryName === 'Babyhawk O3 Parts') {
    return 'Babyhawk O3 Parts';
  }
  if (thrustG <= 0) return 'No Thrust';
  if (thrustG <= 7500) return '5kg Class';
  if (thrustG <= 18000) return '10kg Class';
  if (thrustG <= 35000) return '20kg Class';
  if (thrustG <= 85000) return '50kg Class';
  return '120kg Class';
}

async function run() {
  try {
    console.log('🧹 Category Cleanup Started...');

    // 1. Ensure all standard categories exist in the database
    const catMap = {};
    for (const name of STANDARD_CATEGORIES) {
      const res = await pool.query('SELECT id FROM categories WHERE name = $1', [name]);
      if (res.rows.length > 0) {
        catMap[name] = res.rows[0].id;
      } else {
        const insertRes = await pool.query(
          'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING id',
          [name, `Standard Thrust Class: ${name}`]
        );
        catMap[name] = insertRes.rows[0].id;
        console.log(`✨ Created missing category: ${name}`);
      }
    }

    // 2. Fetch all motors and their current category name
    const motorsRes = await pool.query(`
      SELECT m.id, m.motor_name, m.max_thrust, m.category_id, c.name as current_category_name 
      FROM motors m
      JOIN categories c ON m.category_id = c.id
    `);
    console.log(`📋 Found ${motorsRes.rows.length} motors to classify...`);

    // 3. Update category mapping for each motor in batch
    const updates = {};
    for (const motor of motorsRes.rows) {
      const thrustG = parseThrustToGrams(motor.max_thrust);
      const targetCategoryName = getThrustCategory(thrustG, motor.current_category_name);
      const targetCategoryId = catMap[targetCategoryName];

      if (targetCategoryId && motor.category_id !== targetCategoryId) {
        if (!updates[targetCategoryId]) {
          updates[targetCategoryId] = [];
        }
        updates[targetCategoryId].push(motor.id);
      }
    }

    let updatedCount = 0;
    for (const [targetCategoryId, ids] of Object.entries(updates)) {
      await pool.query('UPDATE motors SET category_id = $1 WHERE id = ANY($2)', [targetCategoryId, ids]);
      updatedCount += ids.length;
    }
    console.log(`✅ Categorized ${updatedCount} motors into standard classes.`);

    // 4. Delete non-standard categories
    const deleteRes = await pool.query(
      'DELETE FROM categories WHERE name NOT IN ($1, $2, $3, $4, $5, $6, $7) RETURNING name',
      STANDARD_CATEGORIES
    );
    console.log(`🗑️ Deleted ${deleteRes.rows.length} redundant categories:`, deleteRes.rows.map(r => r.name).join(', '));

    // 5. Trigger SQLite sync
    console.log('🔄 Triggering SQLite Guest Database Cache Sync...');
    await syncPostgresToSqlite();

    console.log('🎉 Category Cleanup Completed Successfully.');
  } catch (err) {
    console.error('❌ Category Cleanup failed:', err);
  } finally {
    await pool.end();
  }
}

run();

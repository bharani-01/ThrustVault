'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function findCategory() {
  try {
    const catsRes = await pool.query('SELECT id, name FROM categories');
    const motorsRes = await pool.query('SELECT category_id, max_thrust FROM motors');
    
    function parseThrustToKg(thrustStr) {
      if (!thrustStr) return 0;
      const normalized = String(thrustStr).trim().toLowerCase().replace(/\s+/g, '');
      const match = normalized.match(/^([0-9.]+)(kg|g)?$/);
      if (match) {
        const val = parseFloat(match[1]);
        const unit = match[2] || 'kg';
        return unit === 'g' ? val / 1000 : val;
      }
      const numbers = normalized.match(/[0-9.]+/);
      if (numbers) {
        const val = parseFloat(numbers[0]);
        return (normalized.includes('g') && !normalized.includes('kg')) ? val / 1000 : val;
      }
      return 0;
    }

    const categories = catsRes.rows;
    const motors = motorsRes.rows;

    categories.forEach(cat => {
      const catMotors = motors.filter(m => m.category_id === cat.id);
      let minThrust = Infinity;
      let maxThrust = -Infinity;
      
      catMotors.forEach(m => {
        const parsed = parseThrustToKg(m.max_thrust);
        if (parsed > 0) {
          if (parsed < minThrust) minThrust = parsed;
          if (parsed > maxThrust) maxThrust = parsed;
        }
      });

      console.log(`Category: "${cat.name}" (ID: ${cat.id})`);
      console.log(`  Count: ${catMotors.length} motors`);
      console.log(`  Thrust Range: ${minThrust === Infinity ? 'N/A' : minThrust.toFixed(2) + ' – ' + maxThrust.toFixed(2) + ' kg'}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
findCategory();

'use strict';
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

async function testSqlite() {
  try {
    const dbPath = path.join(__dirname, '..', 'database', 'guest_catalog.db');
    console.log('Opening SQLite database at:', dbPath);
    const db = new DatabaseSync(dbPath);
    
    // Count motors
    const row = db.prepare('SELECT COUNT(*) AS count FROM motors').get();
    console.log('Total motors in SQLite:', row.count);

    // Get min-max thrust
    const motors = db.prepare('SELECT max_thrust FROM motors').all();
    console.log('Total motors retrieved from SQLite:', motors.length);

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

    let minThrust = Infinity;
    let maxThrust = -Infinity;
    motors.forEach(m => {
      const parsed = parseThrustToKg(m.max_thrust);
      if (parsed > 0) {
        if (parsed < minThrust) minThrust = parsed;
        if (parsed > maxThrust) maxThrust = parsed;
      }
    });

    console.log(`SQLite Thrust Range: ${minThrust === Infinity ? 'N/A' : minThrust.toFixed(2) + ' – ' + maxThrust.toFixed(2) + ' kg'}`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
testSqlite();

'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function testGetOrCalculateStats() {
  try {
    const res = await pool.query('SELECT max_thrust, recommended_esc, motor_name, custom_parameters FROM motors');
    const allMotors = res.rows;

    const totalMotors = allMotors.length;

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
    allMotors.forEach(m => {
      const parsed = parseThrustToKg(m.max_thrust);
      if (parsed > 0) {
        if (parsed < minThrust) minThrust = parsed;
        if (parsed > maxThrust) maxThrust = parsed;
      }
    });

    let minThrustVal = 0;
    let maxThrustVal = 0;
    let thrustRangeStr = 'N/A';
    let maxThrustStr = 'N/A';

    if (minThrust !== Infinity && maxThrust !== -Infinity) {
      minThrustVal = minThrust;
      maxThrustVal = maxThrust;
      thrustRangeStr = minThrust === maxThrust 
        ? `${minThrust.toFixed(2)} kg` 
        : `${minThrust.toFixed(2)} – ${maxThrust.toFixed(2)} kg`;
      maxThrustStr = `${maxThrust.toFixed(2)} kg`;
    }

    let sRatings = [];
    allMotors.forEach(m => {
      const customParams = m.custom_parameters || {};
      const v = (customParams.voltage || customParams.voltage_v || customParams.operating_voltage)
        ? String(customParams.voltage || customParams.voltage_v || customParams.operating_voltage)
        : '';
      const esc = m.recommended_esc || '';
      const name = m.motor_name || '';
      
      const match = v.match(/(\d+)s/i) || esc.match(/(\d+)s/i) || name.match(/(\d+)s/i);
      if (match) {
        sRatings.push(parseInt(match[1], 10));
      }
    });

    let voltageRangeStr = 'N/A';
    if (sRatings.length > 0) {
      const minS = Math.min(...sRatings);
      const maxS = Math.max(...sRatings);
      voltageRangeStr = minS === maxS ? `${minS}S` : `${minS}S – ${maxS}S`;
    }

    const calculatedStats = {
      total_motors: totalMotors,
      min_thrust: minThrustVal,
      max_thrust: maxThrustVal,
      thrust_range: thrustRangeStr,
      max_thrust_str: maxThrustStr,
      voltage_range: voltageRangeStr
    };

    console.log('CALCULATED STATS:', calculatedStats);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}
testGetOrCalculateStats();

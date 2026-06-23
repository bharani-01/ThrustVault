'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function testPagination() {
  try {
    const INITIAL_LIMIT = 15;
    const BATCH_SIZE = 50;

    // Simulate Phase 1
    const firstRes = await pool.query(
      `SELECT id, category_id, motor_name, company, max_thrust 
       FROM motors ORDER BY max_thrust ASC LIMIT $1 OFFSET 0`,
      [INITIAL_LIMIT]
    );
    let motors = firstRes.rows;
    console.log(`Phase 1 loaded: ${motors.length} motors`);

    // Simulate Phase 2 background loop
    let offset = INITIAL_LIMIT;
    let iterations = 0;
    while (true) {
      iterations++;
      const res = await pool.query(
        `SELECT id, category_id, motor_name, company, max_thrust 
         FROM motors ORDER BY max_thrust ASC LIMIT $1 OFFSET $2`,
        [BATCH_SIZE, offset]
      );
      const batch = res.rows;
      console.log(`Iteration ${iterations}: offset ${offset}, fetched ${batch.length} motors`);
      if (batch.length === 0) break;
      
      motors = [...motors, ...batch];
      offset += batch.length;
      if (batch.length < BATCH_SIZE) break;
    }

    console.log(`Total motors loaded via pagination: ${motors.length}`);
    const uniqueIds = new Set(motors.map(m => m.id));
    console.log(`Unique motor IDs: ${uniqueIds.size}`);

    process.exit(0);
  } catch (err) {
    console.error('Error during pagination simulation:', err);
    process.exit(1);
  }
}
testPagination();

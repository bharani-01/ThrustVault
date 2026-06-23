'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function testInitData() {
  try {
    const res = await pool.query('SELECT COUNT(*)::int AS count FROM motors');
    console.log('Total motors in DB table directly:', res.rows[0].count);

    const LIMIT = 15;
    const [cats, counts, schema, motors] = await Promise.all([
      pool.query('SELECT id, name, description FROM categories ORDER BY name'),
      pool.query('SELECT category_id, COUNT(*)::int AS cnt FROM motors GROUP BY category_id'),
      pool.query('SELECT * FROM custom_specs_schema ORDER BY created_at'),
      pool.query(`SELECT id, category_id, motor_name, company, max_thrust,
                         recommended_esc, recommended_propeller,
                         link_motor, link_esc, link_propeller, custom_parameters, uploaded_by
                  FROM motors ORDER BY max_thrust ASC LIMIT $1`, [LIMIT])
    ]);

    console.log('Init Data counts:');
    console.log('Categories count:', cats.rows.length);
    console.log('First motors batch size:', motors.rows.length);

    let totalCategoryCounts = 0;
    counts.rows.forEach(r => {
      console.log(`Category ID ${r.category_id}: ${r.cnt} motors`);
      totalCategoryCounts += r.cnt;
    });
    console.log('Sum of category counts:', totalCategoryCounts);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}
testInitData();

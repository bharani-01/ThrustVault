'use strict';
async function test() {
  try {
    const res = await fetch('http://localhost:8001/login');
    console.log('STATUS:', res.status);
    console.log('HEADERS:', Object.fromEntries(res.headers.entries()));
    process.exit(0);
  } catch (err) {
    console.error('FETCH ERROR:', err.message);
    process.exit(1);
  }
}
test();

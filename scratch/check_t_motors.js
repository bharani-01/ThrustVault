'use strict';
const fs = require('fs');
const path = require('path');

const filePath = 'd:\\scrappy\\store_t_motors\\motor\\all_motors.json';
if (!fs.existsSync(filePath)) {
  console.log('File does not exist');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
console.log('Total items in t_motors:', data.length);
if (data.length > 0) {
  console.log('First item sample:', JSON.stringify(data[0], null, 2));
}
process.exit(0);

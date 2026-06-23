'use strict';
const fs = require('fs');
const filePath = 'd:\\scrappy\\store_t_motors\\motor\\all_motors.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
console.log('NUMBER OF MOTORS:', data.length);
process.exit(0);

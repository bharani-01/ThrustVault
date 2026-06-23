'use strict';
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'motor_finder.html');
const content = fs.readFileSync(filePath, 'utf8');

console.log('Checking motor_finder.html modifications...');

// Check if categories-container is gone
if (content.includes('id="categories-container"')) {
  console.error('❌ Error: categories-container still exists in HTML.');
  process.exit(1);
} else {
  console.log('✅ Success: categories-container is removed.');
}

// Check if subapps-container exists
if (!content.includes('id="subapps-container"')) {
  console.error('❌ Error: subapps-container does not exist in HTML.');
  process.exit(1);
} else {
  console.log('✅ Success: subapps-container is present.');
}

// Check if renderCategories is gone
if (content.includes('function renderCategories()')) {
  console.error('❌ Error: renderCategories function still exists.');
  process.exit(1);
} else {
  console.log('✅ Success: renderCategories function is removed.');
}

// Check if renderSubapps exists
if (!content.includes('function renderSubapps()')) {
  console.error('❌ Error: renderSubapps function does not exist.');
  process.exit(1);
} else {
  console.log('✅ Success: renderSubapps function is present.');
}

// Check if renderSubapps is called
if (!content.includes('renderSubapps();')) {
  console.error('❌ Error: renderSubapps() is not called.');
  process.exit(1);
} else {
  console.log('✅ Success: renderSubapps() call is present.');
}

console.log('All static check verifications passed successfully!');
process.exit(0);

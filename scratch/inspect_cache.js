'use strict';
const fs = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, '..', 'old-backups', 'motor_scraper', 'storage', 'search_cache');

if (!fs.existsSync(cacheDir)) {
  console.log('Cache directory does not exist:', cacheDir);
  process.exit(1);
}

const files = fs.readdirSync(cacheDir);
console.log('Cache files:', files);

files.forEach(file => {
  if (file.endsWith('.json')) {
    const filePath = path.join(cacheDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const motors = data.motors || [];
      const perf = data.performance || [];
      console.log(`File: ${file}`);
      console.log(`  Motors: ${motors.length}`);
      console.log(`  Performance: ${perf.length}`);
      if (motors.length > 0) {
        console.log(`  Sample motor:`, motors[0]);
      }
    } catch (e) {
      console.error(`Failed parsing ${file}:`, e.message);
    }
  }
});

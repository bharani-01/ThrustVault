'use strict';
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');

const filesToUpdate = [
  'index.html',
  'login.html',
  'request_access.html',
  'version_catalog.html',
  'documentation.html',
  '404.html',
  'guest_dashboard.html',
  'user_dashboard.html',
  'motor_explorer.html',
  'performance_analytics.html',
  'thrustvault_presentation.html',
  'sidebar_user.html',
  'sidebar_guest.html'
];

function runReplacements() {
  console.log('🔄 Starting reference replacements in HTML files...');
  
  for (const filename of filesToUpdate) {
    const filePath = path.join(publicDir, filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Warning: ${filename} not found, skipping.`);
      continue;
    }

    try {
      let content = fs.readFileSync(filePath, 'utf8');
      let originalContent = content;

      // 1. Replace logo files
      content = content.replace(/logo_light\.png/g, 'logo_light.webp');
      content = content.replace(/logo_dark\.png/g, 'logo_dark.webp');

      // 2. Replace favicon files
      content = content.replace(/favicon_light\.png/g, 'favicon_light.webp');
      content = content.replace(/favicon_dark\.png/g, 'favicon_dark.webp');

      // 3. Replace icon link type attributes
      content = content.replace(/type="image\/png"\s+href="favicon_(light|dark)\.webp"/g, 'type="image/webp" href="favicon_$1.webp"');
      content = content.replace(/type="image\/png"\s+href='favicon_(light|dark)\.webp'/g, 'type="image/webp" href="favicon_$1.webp"');

      if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ Updated reference in ${filename}`);
      } else {
        console.log(`ℹ️ No changes needed in ${filename}`);
      }
    } catch (err) {
      console.error(`❌ Error updating ${filename}:`, err.message);
    }
  }

  console.log('🎉 References replacement complete!');
}

runReplacements();

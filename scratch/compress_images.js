'use strict';
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const directories = [
  path.join(__dirname, '..', 'public'),
  path.join(__dirname, '..', 'admin_portal', 'public')
];

const imagesToCompress = [
  'logo_light.png',
  'logo_dark.png',
  'favicon_light.png',
  'favicon_dark.png'
];

async function compress() {
  console.log('🖼️ Starting image compression for all directories...');
  for (const dir of directories) {
    console.log(`📁 Processing directory: ${dir}`);
    for (const filename of imagesToCompress) {
      const inputPath = path.join(dir, filename);
      const outputFilename = filename.replace('.png', '.webp');
      const outputPath = path.join(dir, outputFilename);

      if (fs.existsSync(inputPath)) {
        try {
          await sharp(inputPath)
            .webp({ quality: 85 })
            .toFile(outputPath);
          
          const inputSize = fs.statSync(inputPath).size;
          const outputSize = fs.statSync(outputPath).size;
          const savingPercent = ((inputSize - outputSize) / inputSize * 100).toFixed(1);
          
          console.log(`✅ Compressed ${filename} -> ${outputFilename} (${savingPercent}% savings, ${inputSize} B -> ${outputSize} B)`);
        } catch (err) {
          console.error(`❌ Failed to compress ${filename}:`, err.message);
        }
      } else {
        console.warn(`⚠️ Warning: ${filename} does not exist in ${dir}`);
      }
    }
  }
  console.log('🎉 Compression complete!');
}

compress();

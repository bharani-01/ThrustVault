'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../src/config/db');
const fs = require('fs');
const path = require('path');

const SCRAPPY_DIR = 'd:\\scrappy';

function parseThrustToGrams(thrustStr) {
  if (!thrustStr) return 0;
  const normalized = String(thrustStr).trim().toLowerCase().replace(/\s+/g, '');
  const match = normalized.match(/^([0-9.]+)(kg|g|n)?$/);
  if (match) {
    const val = parseFloat(match[1]);
    const unit = match[2] || 'kg';
    if (unit === 'g') return val;
    if (unit === 'n') return val * 101.97;
    return val * 1000;
  }
  const numbers = normalized.match(/[0-9.]+/);
  if (numbers) {
    const val = parseFloat(numbers[0]);
    if (normalized.includes('g') && !normalized.includes('kg')) {
      return val;
    }
    if (normalized.includes('n')) {
      return val * 101.97;
    }
    return val * 1000;
  }
  return 0;
}

function getThrustCategory(thrustG, originalCategoryName) {
  if (originalCategoryName === 'Babyhawk O3 Parts') {
    return 'Babyhawk O3 Parts';
  }
  if (thrustG <= 0) return 'No Thrust';
  if (thrustG <= 7500) return '5kg Class';
  if (thrustG <= 18000) return '10kg Class';
  if (thrustG <= 35000) return '20kg Class';
  if (thrustG <= 85000) return '50kg Class';
  return '120kg Class';
}

const categoryCache = {};
async function getOrCreateCategory(categoryName) {
  if (!categoryName) categoryName = 'Unassigned';
  const name = String(categoryName).trim();
  if (categoryCache[name]) {
    return categoryCache[name];
  }
  const res = await pool.query('SELECT id FROM categories WHERE name = $1', [name]);
  if (res.rows.length > 0) {
    categoryCache[name] = res.rows[0].id;
    return res.rows[0].id;
  }
  const insertRes = await pool.query(
    'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING id',
    [name, `Automatically imported category: ${name}`]
  );
  categoryCache[name] = insertRes.rows[0].id;
  return insertRes.rows[0].id;
}

async function seedMotors(filePath) {
  if (!fs.existsSync(filePath)) return;
  console.log(`📂 Seeding Motors from: ${filePath}`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  // Cache existing motors in memory
  const existingRes = await pool.query('SELECT id, motor_name, company FROM motors');
  const existingMap = new Map();
  existingRes.rows.forEach(m => {
    existingMap.set(`${m.motor_name}|${m.company}`, m.id);
  });

  let inserted = 0;
  let updated = 0;

  for (const item of data) {
    if (!item.name) continue;

    const rawThrust = item.max_thrust_g !== undefined ? `${item.max_thrust_g} g` : (item.max_thrust || '0.0');
    const thrustG = parseThrustToGrams(rawThrust);
    const mappedCategoryName = getThrustCategory(thrustG, item.category);
    const categoryId = await getOrCreateCategory(mappedCategoryName);
    const motorName = item.name;
    const company = item.brand || 'Unknown';
    const maxThrust = rawThrust;
    const recommendedEsc = item.recommended_esc || item.options?.recommended_esc || null;
    const recommendedProp = item.recommended_prop || item.recommended_propeller || null;
    const linkMotor = item.url || null;
    const mainImage = item.main_image || null;
    const galleryImages = JSON.stringify(item.gallery_images || []);

    const customParameters = { ...item };
    delete customParameters.name;
    delete customParameters.brand;
    delete customParameters.category;
    delete customParameters.main_image;
    delete customParameters.gallery_images;
    delete customParameters.url;

    // Check if motor exists using in-memory cache
    const existingId = existingMap.get(`${motorName}|${company}`);

    if (existingId) {
      // Update existing motor
      await pool.query(
        `UPDATE motors 
         SET category_id = $1, max_thrust = $2, recommended_esc = $3, recommended_propeller = $4,
             link_motor = $5, main_image = $6, gallery_images = $7, custom_parameters = $8, updated_at = now()
         WHERE id = $9`,
        [categoryId, maxThrust, recommendedEsc, recommendedProp, linkMotor, mainImage, galleryImages, JSON.stringify(customParameters), existingId]
      );
      updated++;
    } else {
      // Insert new motor
      await pool.query(
        `INSERT INTO motors (category_id, motor_name, company, max_thrust, recommended_esc, recommended_propeller, link_motor, main_image, gallery_images, custom_parameters)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [categoryId, motorName, company, maxThrust, recommendedEsc, recommendedProp, linkMotor, mainImage, galleryImages, JSON.stringify(customParameters)]
      );
      inserted++;
    }
  }

  console.log(`✅ Motors Seeding Done. Inserted: ${inserted}, Updated: ${updated}`);
}

async function seedESCs(filePath) {
  if (!fs.existsSync(filePath)) return;
  console.log(`📂 Seeding ESCs from: ${filePath}`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  let count = 0;
  for (const item of data) {
    if (!item.name) continue;

    const name = item.name;
    const brand = item.brand || 'Unknown';
    const price = item.price ? String(item.price).replace('$', '') : null;
    const currency = item.currency || 'USD';
    const url = item.url || null;
    const sku = item.sku || null;
    const mainImage = item.main_image || null;
    const galleryImages = JSON.stringify(item.gallery_images || []);

    const customParameters = { ...item };
    delete customParameters.name;
    delete customParameters.brand;
    delete customParameters.price;
    delete customParameters.currency;
    delete customParameters.url;
    delete customParameters.sku;
    delete customParameters.main_image;
    delete customParameters.gallery_images;

    await pool.query(
      `INSERT INTO escs (name, brand, price, currency, url, sku, main_image, gallery_images, custom_parameters)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (name, brand) DO UPDATE 
       SET price = EXCLUDED.price,
           currency = EXCLUDED.currency,
           url = EXCLUDED.url,
           sku = EXCLUDED.sku,
           main_image = EXCLUDED.main_image,
           gallery_images = EXCLUDED.gallery_images,
           custom_parameters = EXCLUDED.custom_parameters,
           updated_at = now()`,
      [name, brand, price, currency, url, sku, mainImage, galleryImages, JSON.stringify(customParameters)]
    );
    count++;
  }

  console.log(`✅ ESCs Seeding Done. Total processed: ${count}`);
}

async function seedPropellers(filePath) {
  if (!fs.existsSync(filePath)) return;
  console.log(`📂 Seeding Propellers from: ${filePath}`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  let count = 0;
  for (const item of data) {
    if (!item.name) continue;

    const name = item.name;
    const brand = item.brand || 'Unknown';
    const price = item.price ? String(item.price).replace('$', '') : null;
    const currency = item.currency || 'USD';
    const url = item.url || null;
    const sku = item.sku || null;
    const mainImage = item.main_image || null;
    const galleryImages = JSON.stringify(item.gallery_images || []);

    const customParameters = { ...item };
    delete customParameters.name;
    delete customParameters.brand;
    delete customParameters.price;
    delete customParameters.currency;
    delete customParameters.url;
    delete customParameters.sku;
    delete customParameters.main_image;
    delete customParameters.gallery_images;

    await pool.query(
      `INSERT INTO propellers (name, brand, price, currency, url, sku, main_image, gallery_images, custom_parameters)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (name, brand) DO UPDATE 
       SET price = EXCLUDED.price,
           currency = EXCLUDED.currency,
           url = EXCLUDED.url,
           sku = EXCLUDED.sku,
           main_image = EXCLUDED.main_image,
           gallery_images = EXCLUDED.gallery_images,
           custom_parameters = EXCLUDED.custom_parameters,
           updated_at = now()`,
      [name, brand, price, currency, url, sku, mainImage, galleryImages, JSON.stringify(customParameters)]
    );
    count++;
  }

  console.log(`✅ Propellers Seeding Done. Total processed: ${count}`);
}

async function run() {
  try {
    const stores = fs.readdirSync(SCRAPPY_DIR).filter(file => {
      return fs.statSync(path.join(SCRAPPY_DIR, file)).isDirectory() && file.startsWith('store_');
    });

    console.log(`🔍 Found scraper directories: ${stores.join(', ')}`);

    for (const store of stores) {
      const storePath = path.join(SCRAPPY_DIR, store);
      
      // Emax is a special case (all_products.json in root folder)
      if (store === 'store_emax') {
        const emaxProductsPath = path.join(storePath, 'all_products.json');
        if (fs.existsSync(emaxProductsPath)) {
          console.log(`📂 Processing Emax products from: ${emaxProductsPath}`);
          const emaxData = JSON.parse(fs.readFileSync(emaxProductsPath, 'utf8'));
          
          const emaxMotors = emaxData.filter(i => i.product_type === 'Motor');
          const emaxProps = emaxData.filter(i => i.product_type === 'Propeller');
          const emaxEscs = emaxData.filter(i => i.product_type === 'ESC');

          // Seed Emax motor list
          const tempMotorsPath = path.join(__dirname, 'emax_motors_temp.json');
          fs.writeFileSync(tempMotorsPath, JSON.stringify(emaxMotors));
          await seedMotors(tempMotorsPath);
          fs.unlinkSync(tempMotorsPath);

          // Seed Emax propellers list
          const tempPropsPath = path.join(__dirname, 'emax_props_temp.json');
          fs.writeFileSync(tempPropsPath, JSON.stringify(emaxProps));
          await seedPropellers(tempPropsPath);
          fs.unlinkSync(tempPropsPath);
          
          // Seed Emax ESCs list
          const tempEscsPath = path.join(__dirname, 'emax_escs_temp.json');
          fs.writeFileSync(tempEscsPath, JSON.stringify(emaxEscs));
          await seedESCs(tempEscsPath);
          fs.unlinkSync(tempEscsPath);
        }
      } else {
        // Standard layout for other stores
        const motorPath = path.join(storePath, 'motor', 'all_motors.json');
        const escPath = path.join(storePath, 'esc', 'escs.json');
        const propPath = path.join(storePath, 'prop', 'propellers.json');

        await seedMotors(motorPath);
        await seedESCs(escPath);
        await seedPropellers(propPath);
      }
    }

    console.log('🎉 Database seeding successfully completed.');
  } catch (err) {
    console.error('❌ Database seeding failed:', err);
  } finally {
    await pool.end();
  }
}

run();

'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../database/guest_catalog.db');
console.log('Opening database at:', dbPath);
const db = new DatabaseSync(dbPath);

try {
  const categoriesQuery = db.prepare('SELECT * FROM categories');
  const categories = categoriesQuery.all();
  
  const motorsQuery = db.prepare('SELECT * FROM motors');
  const motors = motorsQuery.all();

  const specSchemaQuery = db.prepare('SELECT * FROM custom_specs_schema');
  const specs = specSchemaQuery.all();

  let out = '';
  out += `Total Categories: ${categories.length}\n`;
  out += `Total Motors: ${motors.length}\n`;
  out += `Total Custom Specs: ${specs.length}\n\n`;

  out += '=== CATEGORIES ===\n';
  categories.forEach(cat => {
    out += `ID: ${cat.id} | Name: ${cat.name} | Description: ${cat.description || 'None'}\n`;
  });

  out += '\n=== MOTORS ===\n';
  motors.forEach((m, idx) => {
    const cat = categories.find(c => c.id === m.category_id);
    const catName = cat ? cat.name : 'Unknown';
    out += `${idx + 1}. Company: ${m.company} | Name: ${m.motor_name} | Max Thrust: ${m.max_thrust} | Cat: ${catName}\n`;
    out += `   Rec ESC: ${m.recommended_esc || 'N/A'} | Rec Prop: ${m.recommended_propeller || 'N/A'}\n`;
    out += `   Links: Motor: ${m.link_motor || 'N/A'} | ESC: ${m.link_esc || 'N/A'} | Prop: ${m.link_propeller || 'N/A'}\n`;
    out += `   Custom Parameters: ${m.custom_parameters}\n`;
  });

  fs.writeFileSync(path.join(__dirname, 'full_db_summary.txt'), out, 'utf8');
  console.log('Summary written to full_db_summary.txt');
} catch (err) {
  console.error('Error querying SQLite database:', err);
}

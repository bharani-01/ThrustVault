'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

try {
  console.log('Testing node:sqlite DatabaseSync availability...');
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
  
  const insert = db.prepare('INSERT INTO test (name) VALUES (?)');
  insert.run('Alice');
  insert.run('Bob');
  
  const query = db.prepare('SELECT * FROM test ORDER BY id');
  const rows = query.all();
  console.log('Rows:', rows);
  console.log('✅ node:sqlite is working perfectly!');
} catch (err) {
  console.error('❌ Error with node:sqlite:', err);
}

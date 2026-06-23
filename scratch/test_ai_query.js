'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getChatCompletions } = require('../src/controllers/aiController');
const pool = require('../src/config/db');

async function test(queryText) {
  console.log(`\n==================================================`);
  console.log(`Testing user query: "${queryText}"`);
  console.log(`==================================================`);
  
  const req = {
    body: {
      messages: [
        { role: 'user', content: queryText }
      ]
    }
  };

  const res = {
    status: function(code) {
      console.log(`Response status code: ${code}`);
      return this;
    },
    json: function(data) {
      if (data.reply) {
        console.log(`AI Reply:`, data.reply);
      } else {
        console.log(`Response data:`, JSON.stringify(data, null, 2));
      }
    }
  };

  await getChatCompletions(req, res);
}

async function run() {
  try {
    // Test 1: Category thrust query
    await test("Suggest a motor for 3-5 kg payload");

    // Test 2: Brand/Company query
    await test("Show me KDE Direct motors");

    // Test 3: Specific motor keyword search
    await test("Do you have U8 motors?");

    // Test 4: General chit chat (should not trigger DB query)
    await test("Hello, who are you?");

  } catch (err) {
    console.error("Test error:", err);
  } finally {
    await pool.end();
  }
}

run();

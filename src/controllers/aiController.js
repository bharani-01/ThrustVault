'use strict';

const pool = require('../config/db');

const GROQ_TIMEOUT_MS = 5000;
const MAX_HISTORY_MESSAGES = 8;
const MAX_DB_RESULTS = 15;

const systemPrompt = `You are the ThrustVault AI Copilot, an expert UAV propulsion systems specialist and drone aerospace engineer.
Your purpose is to answer users' questions about motor specifications, stator sizes, KV selections, propeller matching, ESC configurations, battery choices, and test bench run interpretations.

Strict Rules for Veracity and Missing Data:
1. EXPLICIT DATA ORIGIN: You must clearly segregate information. Label specifications as either "**[Database Verified]**" (matching fields directly provided in the search results context) or "**[Engineering Suggestion]**" (when fields are null, blank, or missing, and you are estimating/recommending safe defaults using aerospace formulas).
2. EVALUATING SUITABILITY ("Is this motor/ESC/propeller OK?"): When asked if a powertrain element is suitable for a drone build:
   - Perform safety calculations (e.g. current safety margin, thrust-to-weight ratio). Multirotors require a minimum thrust-to-weight ratio of 2:1 for basic hover, and ideally 3:1 or higher for agility.
   - Match continuous current ratings of ESCs to peak motor currents with a 20% safety margin buffer.
3. HANDLING MISSING DATA: If key fields are missing from the database record, explicitly notify the user: "The database is missing verification for [FIELD]." Then, provide a safe recommendation.

Give detailed, technical, data-centric, and clear answers. Refuse to discuss topics unrelated to aerospace propulsion systems, ThrustVault platform, or general drone engineering. Keep your tone helpful, professional, and precise.`;

const extractSystemPrompt = `You are a data extraction assistant for the ThrustVault UAV database.
Your job is to analyze the user's latest query along with the conversation context and output a JSON search request.
You MUST output ONLY a valid JSON object. Do not wrap it in markdown codeblocks (no \`\`\`json). Do not explain your output.

Tables available in DB: "motors", "escs", "propellers"
Categories available in DB (Motors only): "1-2 kg", "3-5 kg", "8-10 kg", "18-22 kg", "45-55 kg"
Companies/Brands available in DB: "T-Motor", "KDE Direct", "MAD Components", "SunnySky", "EMAX", "iFlight", "Tarot", "Foxtech", "Scorpion", "Hacker", "Hobbywing", "APC"

JSON structure:
{
  "target_table": "motors" | "escs" | "propellers", // The primary category of product the user is asking about (defaults to "motors")
  "search_query": "string or null", // Keywords to search in name/model (e.g. "F80", "40A", "15x5")
  "company": "string or null", // Normalized brand/company name matching database or null
  "category_name": "string or null", // Only for motors: One of the available categories or null
  "min_thrust_kg": number or null, // Only for motors: Minimum thrust value in kg
  "max_thrust_kg": number or null  // Only for motors: Maximum thrust value in kg
}

Example 1: "Recommend a T-Motor that can lift 5kg"
Response: {"target_table": "motors", "search_query": null, "company": "T-Motor", "category_name": "3-5 kg", "min_thrust_kg": 5.0, "max_thrust_kg": null}

Example 2: "Is there any 40A Hobbywing ESC?"
Response: {"target_table": "escs", "search_query": "40A", "company": "Hobbywing", "category_name": null, "min_thrust_kg": null, "max_thrust_kg": null}

Example 3: "List APC 15 inch props"
Response: {"target_table": "propellers", "search_query": "15", "company": "APC", "category_name": null, "min_thrust_kg": null, "max_thrust_kg": null}`;

const CATEGORY_RANGES = [
  { name: '1-2 kg', min: 1, max: 2 },
  { name: '3-5 kg', min: 3, max: 5 },
  { name: '8-10 kg', min: 8, max: 10 },
  { name: '18-22 kg', min: 18, max: 22 },
  { name: '45-55 kg', min: 45, max: 55 },
];

function normalizeCategory(input) {
  if (!input || typeof input !== 'string') return null;
  const cleaned = input.toLowerCase().trim();

  for (const range of CATEGORY_RANGES) {
    const compact = range.name.replace(/\s+/g, '').toLowerCase();
    if (cleaned.replace(/\s+/g, '') === compact) return range.name;
  }

  const nums = (cleaned.match(/\d+(\.\d+)?/g) || []).map(Number);
  if (nums.length >= 2) {
    const lo = Math.min(nums[0], nums[1]);
    const hi = Math.max(nums[0], nums[1]);
    const match = CATEGORY_RANGES.find(r => lo <= r.max && hi >= r.min);
    if (match) return match.name;
  } else if (nums.length === 1) {
    const v = nums[0];
    const match = CATEGORY_RANGES.find(r => v >= r.min && v <= r.max);
    if (match) return match.name;
  }

  if (/(light|small|micro)/.test(cleaned)) return CATEGORY_RANGES[0].name;
  if (/medium/.test(cleaned)) return CATEGORY_RANGES[1].name;
  if (/(heavy|large|industrial)/.test(cleaned)) return CATEGORY_RANGES[3].name;
  if (/(extreme|max|ultra)/.test(cleaned)) return CATEGORY_RANGES[4].name;

  return null;
}

function parseThrustRange(thrustStr) {
  if (!thrustStr || typeof thrustStr !== 'string') return null;

  let clean = thrustStr.replace(/kg/gi, '').replace(/[~*()]/g, '').trim();
  const hasPlus = clean.includes('+');
  clean = clean.replace(/\+/g, '').trim();

  const parts = clean
    .split(/[-–]|to/gi)
    .map(s => parseFloat(s.trim()))
    .filter(n => !isNaN(n));

  if (parts.length === 1) {
    return hasPlus ? { min: parts[0], max: Infinity } : { min: parts[0], max: parts[0] };
  }

  if (parts.length >= 2) {
    return { min: Math.min(parts[0], parts[1]), max: Math.max(parts[0], parts[1]) };
  }

  return null;
}

function trimMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const valid = messages.filter(
    m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')
  );
  return valid.slice(-MAX_HISTORY_MESSAGES);
}

function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (err) {
    return null;
  }
}

async function fetchWithTimeout(url, options, timeoutMs = GROQ_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Motors search query engine
async function queryMotors({ company, categoryName, searchQuery }) {
  let query = `
    SELECT m.id, m.motor_name, m.company, m.max_thrust, m.recommended_esc, m.recommended_propeller,
           m.link_motor, m.link_esc, m.link_propeller, c.name as category_name
    FROM public.motors m
    LEFT JOIN public.categories c ON m.category_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (company) {
    params.push(`%${company}%`);
    query += ` AND m.company ILIKE $${params.length}`;
  }

  if (categoryName) {
    params.push(categoryName);
    query += ` AND c.name = $${params.length}`;
  }

  if (searchQuery) {
    params.push(`%${searchQuery}%`);
    query += ` AND (m.motor_name ILIKE $${params.length} OR m.company ILIKE $${params.length})`;
  }

  query += ` ORDER BY m.motor_name ASC LIMIT ${MAX_DB_RESULTS}`;

  const result = await pool.query(query, params);
  return result.rows;
}

// ESCs search query engine
async function queryEscs({ company, searchQuery }) {
  let query = `
    SELECT id, name, brand, price, currency, url, sku, custom_parameters
    FROM public.escs
    WHERE 1=1
  `;
  const params = [];

  if (company) {
    params.push(`%${company}%`);
    query += ` AND brand ILIKE $${params.length}`;
  }

  if (searchQuery) {
    params.push(`%${searchQuery}%`);
    query += ` AND (name ILIKE $${params.length} OR brand ILIKE $${params.length})`;
  }

  query += ` ORDER BY name ASC LIMIT ${MAX_DB_RESULTS}`;

  const result = await pool.query(query, params);
  return result.rows;
}

// Propellers search query engine
async function queryPropellers({ company, searchQuery }) {
  let query = `
    SELECT id, name, brand, price, currency, url, sku, custom_parameters
    FROM public.propellers
    WHERE 1=1
  `;
  const params = [];

  if (company) {
    params.push(`%${company}%`);
    query += ` AND brand ILIKE $${params.length}`;
  }

  if (searchQuery) {
    params.push(`%${searchQuery}%`);
    query += ` AND (name ILIKE $${params.length} OR brand ILIKE $${params.length})`;
  }

  query += ` ORDER BY name ASC LIMIT ${MAX_DB_RESULTS}`;

  const result = await pool.query(query, params);
  return result.rows;
}

// Shared search engine routing with fallback constraints relaxations
async function searchDbWithFallback(queryParams) {
  const table = queryParams.target_table || 'motors';

  if (table === 'escs') {
    let rows = await queryEscs(queryParams);
    if (rows.length > 0) return { rows, table, relaxed: false };
    if (queryParams.company) {
      rows = await queryEscs({ ...queryParams, company: null });
      if (rows.length > 0) return { rows, table, relaxed: true, note: 'dropped brand filter' };
    }
    return { rows: [], table, relaxed: true, note: 'no matching ESCs found' };
  }

  if (table === 'propellers') {
    let rows = await queryPropellers(queryParams);
    if (rows.length > 0) return { rows, table, relaxed: false };
    if (queryParams.company) {
      rows = await queryPropellers({ ...queryParams, company: null });
      if (rows.length > 0) return { rows, table, relaxed: true, note: 'dropped brand filter' };
    }
    return { rows: [], table, relaxed: true, note: 'no matching propellers found' };
  }

  // Default to motors
  let rows = await queryMotors(queryParams);
  if (rows.length > 0) return { rows, table, relaxed: false };

  if (queryParams.category_name) {
    rows = await queryMotors({ ...queryParams, category_name: null });
    if (rows.length > 0) return { rows, table, relaxed: true, note: 'dropped category threshold constraint' };
  }

  if (queryParams.company || queryParams.category_name) {
    rows = await queryMotors({ company: null, category_name: null, searchQuery: queryParams.search_query });
    if (rows.length > 0) return { rows, table, relaxed: true, note: 'dropped category and company name constraints' };
  }

  return { rows: [], table, relaxed: true, note: 'no matching motors found after filter relaxation' };
}

function applyThrustFilter(rows, minThrustKg, maxThrustKg) {
  if (minThrustKg == null && maxThrustKg == null) return rows;

  return rows.filter(m => {
    const range = parseThrustRange(m.max_thrust);
    if (!range) return true;
    if (minThrustKg != null && range.max < minThrustKg) return false;
    if (maxThrustKg != null && range.min > maxThrustKg) return false;
    return true;
  });
}

async function callGroq(messages, { temperature, maxTokens }) {
  const apiKey = process.env.GROQ_API_KEY;
  const modelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  return response;
}

async function getChatCompletions(req, res) {
  const { messages: rawMessages } = req.body || {};
  if (!rawMessages || !Array.isArray(rawMessages)) {
    return res.status(400).json({ error: 'Missing or invalid messages list' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Groq API Key is not configured on the server.' });
  }

  const messages = trimMessages(rawMessages);
  if (messages.length === 0) {
    return res.status(400).json({ error: 'No valid messages provided.' });
  }

  let queryParams = { target_table: 'motors', search_query: null, company: null, category_name: null, min_thrust_kg: null, max_thrust_kg: null };
  let hasQueryParams = false;

  try {
    const extractResponse = await callGroq(
      [{ role: 'system', content: extractSystemPrompt }, ...messages],
      { temperature: 0.1, maxTokens: 256 }
    );

    if (extractResponse.ok) {
      const extractData = await extractResponse.json();
      const replyText = extractData.choices?.[0]?.message?.content || '';
      const parsed = extractJson(replyText);

      if (parsed && typeof parsed === 'object') {
        queryParams = {
          target_table: parsed.target_table || 'motors',
          search_query: parsed.search_query ?? null,
          company: parsed.company ?? null,
          category_name: normalizeCategory(parsed.category_name) ?? null,
          min_thrust_kg: typeof parsed.min_thrust_kg === 'number' ? parsed.min_thrust_kg : null,
          max_thrust_kg: typeof parsed.max_thrust_kg === 'number' ? parsed.max_thrust_kg : null,
        };
        hasQueryParams =
          queryParams.search_query !== null ||
          queryParams.company !== null ||
          queryParams.category_name !== null ||
          queryParams.min_thrust_kg !== null ||
          queryParams.max_thrust_kg !== null;
      }
    }
  } catch (err) {
    console.warn('[AI Controller] Failed to extract query parameters:', err.message);
  }

  let matchedItems = [];
  let table = 'motors';
  let dbNote = '';
  let queryParamsText = '';

  if (hasQueryParams) {
    try {
      const result = await searchDbWithFallback(queryParams);
      table = result.table;
      dbNote = result.relaxed ? result.note : '';

      if (table === 'motors') {
        matchedItems = applyThrustFilter(result.rows, queryParams.min_thrust_kg, queryParams.max_thrust_kg);
      } else {
        matchedItems = result.rows;
      }
      queryParamsText = JSON.stringify(queryParams);
    } catch (dbErr) {
      console.error('[AI Controller] DB search query failed:', dbErr.message);
      hasQueryParams = false;
    }
  }

  const outboundMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  if (hasQueryParams) {
    let dbContext;
    if (matchedItems.length > 0) {
      dbContext = `[ThrustVault DB Search Results] Target Table: ${table} | Criteria: ${queryParamsText}\n`;
      if (dbNote) dbContext += `Note: exact match not found, results below come from a relaxed search (${dbNote}).\n`;

      if (table === 'escs') {
        matchedItems.forEach(item => {
          dbContext += `- ESC: ${item.brand} ${item.name} | ID: ${item.id} | Price: ${item.price || 'N/A'} ${item.currency || ''} | SKU: ${item.sku || 'N/A'}\n`;
          if (item.url) dbContext += `  Product URL: ${item.url}\n`;
          if (item.custom_parameters) dbContext += `  Specs: ${JSON.stringify(item.custom_parameters)}\n`;
        });
        dbContext += `\nInstructions: Detail the matching ESCs from the search results to answer the user's question. For each ESC, you MUST output a link of format [Open ESC](thrustvault://open-esc?id=ESC_ID) right after its name so the user can open its details directly. If URLs are provided, show them as clickable markdown links.`;
      } else if (table === 'propellers') {
        matchedItems.forEach(item => {
          dbContext += `- Propeller: ${item.brand} ${item.name} | ID: ${item.id} | Price: ${item.price || 'N/A'} ${item.currency || ''} | SKU: ${item.sku || 'N/A'}\n`;
          if (item.url) dbContext += `  Product URL: ${item.url}\n`;
          if (item.custom_parameters) dbContext += `  Specs: ${JSON.stringify(item.custom_parameters)}\n`;
        });
        dbContext += `\nInstructions: Detail the matching propellers from the search results to answer the user's question. For each propeller, you MUST output a link of format [Open Propeller](thrustvault://open-propeller?id=PROPELLER_ID) right after its name so the user can open its details directly. If URLs are provided, show them as clickable markdown links.`;
      } else {
        matchedItems.forEach(m => {
          dbContext += `- Motor: ${m.company} ${m.motor_name} | ID: ${m.id} | Max Thrust: ${m.max_thrust} | Category: ${m.category_name}\n`;
          if (m.recommended_esc) dbContext += `  Recommended ESC: ${m.recommended_esc}\n`;
          if (m.recommended_propeller) dbContext += `  Recommended Propeller: ${m.recommended_propeller}\n`;
          if (m.link_motor) dbContext += `  Motor URL: ${m.link_motor}\n`;
          if (m.link_esc) dbContext += `  ESC URL: ${m.link_esc}\n`;
          if (m.link_propeller) dbContext += `  Propeller URL: ${m.link_propeller}\n`;
        });
        dbContext += `\nInstructions: Detail the matching motors from the search results to answer the user's question. Format their specifications beautifully. For each motor, you MUST output a link of format [Open Motor](thrustvault://open-motor?id=MOTOR_ID) right after its name so the user can open its details modal directly. If URLs are provided, show them as clickable markdown links.`;
      }
    } else {
      dbContext = `[ThrustVault DB Search Results] Target Table: ${table} | Criteria: ${queryParamsText}\nNo matching items were found in the database. Notify the user that no matches exist, then answer using general aerospace knowledge.`;
    }
    outboundMessages.push({ role: 'system', content: dbContext });
  }

  try {
    const response = await callGroq(outboundMessages, { temperature: 0.7, maxTokens: 1024 });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Groq API Error] Status: ${response.status}, Details: ${errorText}`);
      return res.status(response.status).json({ error: `Groq API error: Status ${response.status}` });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    return res.json({ reply });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'The AI service took too long to respond. Please try again.' });
    }
    console.error('[AI Controller Error]', err.message);
    return res.status(500).json({ error: 'Failed to communicate with AI chat completions.' });
  }
}

module.exports = {
  getChatCompletions,
  normalizeCategory,
  parseThrustRange,
  trimMessages,
  extractJson,
};

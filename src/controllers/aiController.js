'use strict';

const pool = require('../config/db');

const GROQ_TIMEOUT_MS = 5000;
const MAX_HISTORY_MESSAGES = 8;
const MAX_DB_RESULTS = 15;

const systemPrompt = `You are the ThrustVault AI Copilot, an expert UAV propulsion systems specialist and drone aerospace engineer.
Your purpose is to answer users' questions about motor specifications, stator sizes, KV selections, propeller matching, ESC configurations, battery choices, and test bench run interpretations.

Strict Rules for Veracity and Missing Data:
1. EXPLICIT DATA ORIGIN: You must clearly segregate information. Label specifications as either "**[Database Verified]**" (matching fields directly provided in the search results context) or "**[Engineering Suggestion]**" (when fields are null, blank, or missing, and you are estimating/recommending safe defaults using aerospace formulas).
2. EVALUATING SUITABILITY ("Is this motor OK?"): When asked if a motor is suitable/OK for a payload or drone build:
   - Perform a thrust-to-weight ratio evaluation. Multirotors require a minimum thrust-to-weight ratio of 2:1 for basic hover, and ideally 3:1 or higher for wind resistance and agility.
   - For a given payload, double/triple it to find the required total thrust, divide by the number of motors (assume 4 for quadcopter, 6 for hexacopter if not specified), and compare this against the motor's max_thrust.
3. HANDLING MISSING DATA: If key fields (like recommended ESC, propeller, or voltage) are missing from the database record, explicitly notify the user: "The database is missing verification for [FIELD]." Then, provide a safe, calculated recommendation based on KV, max current, and typical propeller loads, clearly marked as an [Engineering Suggestion].

Give detailed, technical, data-centric, and clear answers. Refuse to discuss topics unrelated to aerospace propulsion systems, ThrustVault platform, or general drone engineering. Keep your tone helpful, professional, and precise.`;

const extractSystemPrompt = `You are a data extraction assistant for the ThrustVault UAV database.
Your job is to analyze the user's latest query along with the conversation context and output a JSON search request.
You MUST output ONLY a valid JSON object. Do not wrap it in markdown codeblocks (no \`\`\`json). Do not explain your output.

Categories available in DB: "1-2 kg", "3-5 kg", "8-10 kg", "18-22 kg", "45-55 kg"
Companies available in DB: "T-Motor", "KDE Direct", "MAD Components", "SunnySky", "EMAX", "iFlight", "Tarot", "Foxtech", "Scorpion", "Hacker", "Hobbywing"

JSON structure:
{
  "search_query": "string or null", // Keywords to search in motor name (e.g. "F80", "U8", "MN3510")
  "company": "string or null", // Normalized company name matching the list or null
  "category_name": "string or null", // One of the available categories (any reasonable phrasing, e.g. "3-5kg", "medium payload"), or null
  "min_thrust_kg": number or null, // Minimum thrust value in kg (e.g., if user mentions a payload or thrust)
  "max_thrust_kg": number or null  // Maximum thrust value in kg
}

Example: "Is T-Motor F80 Pro available?"
Response: {"search_query": "F80 Pro", "company": "T-Motor", "category_name": null, "min_thrust_kg": null, "max_thrust_kg": null}`;

// ---------------------------------------------------------------------------
// Known category ranges (kg). Used to normalize loosely-phrased category
// names coming back from the extraction LLM into the exact strings stored
// in the categories table.
// ---------------------------------------------------------------------------
const CATEGORY_RANGES = [
  { name: '1-2 kg', min: 1, max: 2 },
  { name: '3-5 kg', min: 3, max: 5 },
  { name: '8-10 kg', min: 8, max: 10 },
  { name: '18-22 kg', min: 18, max: 22 },
  { name: '45-55 kg', min: 45, max: 55 },
];

/**
 * Normalize a loosely-phrased category string (e.g. "3-5kg", "3 to 5 kg",
 * "medium payload") into the exact category name stored in the DB.
 * Returns null if nothing reasonable can be matched.
 */
function normalizeCategory(input) {
  if (!input || typeof input !== 'string') return null;
  const cleaned = input.toLowerCase().trim();

  // 1) Direct match ignoring whitespace differences.
  for (const range of CATEGORY_RANGES) {
    const compact = range.name.replace(/\s+/g, '').toLowerCase();
    if (cleaned.replace(/\s+/g, '') === compact) return range.name;
  }

  // 2) Extract numeric bounds and match against known ranges.
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

  // 3) Loose semantic phrasing fallback.
  if (/(light|small|micro)/.test(cleaned)) return CATEGORY_RANGES[0].name;
  if (/medium/.test(cleaned)) return CATEGORY_RANGES[1].name;
  if (/(heavy|large|industrial)/.test(cleaned)) return CATEGORY_RANGES[3].name;
  if (/(extreme|max|ultra)/.test(cleaned)) return CATEGORY_RANGES[4].name;

  return null;
}

/**
 * Parse a free-text thrust value (e.g. "3-5 kg", "20kg+", "~12kg") into a
 * { min, max } range in kg. Returns null (rather than {0,0}) when the value
 * can't be parsed, so callers can choose to skip rather than wrongly exclude
 * the record.
 */
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
    // "20kg+" => treat as an open-ended high-capacity bound rather than an
    // arbitrary +50kg guess.
    return hasPlus ? { min: parts[0], max: Infinity } : { min: parts[0], max: parts[0] };
  }

  if (parts.length >= 2) {
    return { min: Math.min(parts[0], parts[1]), max: Math.max(parts[0], parts[1]) };
  }

  return null;
}

/**
 * Trim and sanitize incoming chat history: drop malformed entries and keep
 * only the most recent N messages to bound token usage.
 */
function trimMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const valid = messages.filter(
    m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')
  );
  return valid.slice(-MAX_HISTORY_MESSAGES);
}

/**
 * Pull a JSON object out of an LLM response even if it's wrapped in
 * markdown fences or preceded/followed by explanatory text.
 */
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

/**
 * Wraps fetch with an AbortController-based timeout so a slow/hanging Groq
 * call can't hang the Express request handler indefinitely.
 */
async function fetchWithTimeout(url, options, timeoutMs = GROQ_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Query the motors table using parameterized filters pushed down to
 * PostgreSQL (instead of pulling the whole table and filtering in JS).
 */
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

/**
 * Run the primary filtered search; if it returns nothing, progressively
 * relax constraints (drop category first, then drop company) rather than
 * surfacing a hard "no results" to the user when a looser match exists.
 */
async function searchMotorsWithFallback(filters) {
  let rows = await queryMotors(filters);
  if (rows.length > 0) return { rows, relaxed: false };

  if (filters.categoryName) {
    rows = await queryMotors({ ...filters, categoryName: null });
    if (rows.length > 0) return { rows, relaxed: true, note: 'dropped category constraint' };
  }

  if (filters.company || filters.categoryName) {
    rows = await queryMotors({ company: null, categoryName: null, searchQuery: filters.searchQuery });
    if (rows.length > 0) return { rows, relaxed: true, note: 'dropped category and company constraints' };
  }

  return { rows: [], relaxed: true, note: 'no matches even after relaxing filters' };
}

/**
 * Apply thrust-range filtering in-memory on the (already DB-filtered, small)
 * candidate set, since max_thrust is stored as free text and can't be
 * filtered efficiently in SQL.
 */
function applyThrustFilter(rows, minThrustKg, maxThrustKg) {
  if (minThrustKg == null && maxThrustKg == null) return rows;

  return rows.filter(m => {
    const range = parseThrustRange(m.max_thrust);
    if (!range) return true; // unparseable thrust text: don't wrongly exclude it
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

  // -------------------------------------------------------------------
  // Step 1: Extract structured search criteria via Groq (best-effort).
  // Any failure here (timeout, bad JSON, network error) just means we
  // proceed without DB grounding rather than failing the whole request.
  // -------------------------------------------------------------------
  let queryParams = { search_query: null, company: null, category_name: null, min_thrust_kg: null, max_thrust_kg: null };
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
    if (err.name === 'AbortError') {
      console.warn('[AI Controller] Extraction call timed out after', GROQ_TIMEOUT_MS, 'ms');
    } else {
      console.warn('[AI Controller] Failed to extract query parameters:', err.message);
    }
  }

  // -------------------------------------------------------------------
  // Step 2: Query DB if parameters were extracted, with relevance fallback.
  // -------------------------------------------------------------------
  let matchedMotors = [];
  let dbNote = '';
  let queryParamsText = '';

  if (hasQueryParams) {
    try {
      const { rows, relaxed, note } = await searchMotorsWithFallback({
        company: queryParams.company,
        categoryName: queryParams.category_name,
        searchQuery: queryParams.search_query,
      });

      matchedMotors = applyThrustFilter(rows, queryParams.min_thrust_kg, queryParams.max_thrust_kg);
      dbNote = relaxed ? note : '';
      queryParamsText = JSON.stringify(queryParams);
    } catch (dbErr) {
      console.error('[AI Controller] DB search query failed:', dbErr.message);
      hasQueryParams = false;
    }
  }

  // -------------------------------------------------------------------
  // Step 3: Inject DB context (if any) and call Groq for the final reply.
  // -------------------------------------------------------------------
  const outboundMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  if (hasQueryParams) {
    let dbContext;
    if (matchedMotors.length > 0) {
      dbContext = `[ThrustVault DB Search Results] Criteria: ${queryParamsText}\n`;
      if (dbNote) dbContext += `Note: exact match not found, results below come from a relaxed search (${dbNote}).\n`;
      matchedMotors.forEach(m => {
        dbContext += `- Motor: ${m.company} ${m.motor_name} | ID: ${m.id} | Max Thrust: ${m.max_thrust} | Category: ${m.category_name}\n`;
        if (m.recommended_esc) dbContext += `  Recommended ESC: ${m.recommended_esc}\n`;
        if (m.recommended_propeller) dbContext += `  Recommended Propeller: ${m.recommended_propeller}\n`;
        if (m.link_motor) dbContext += `  Motor URL: ${m.link_motor}\n`;
        if (m.link_esc) dbContext += `  ESC URL: ${m.link_esc}\n`;
        if (m.link_propeller) dbContext += `  Propeller URL: ${m.link_propeller}\n`;
      });
      dbContext += `\nInstructions: Detail the matching motors from the search results to answer the user's question. Format their specifications beautifully. For each motor, you MUST output a link of format [Open Motor](thrustvault://open-motor?id=MOTOR_ID) right after its name so the user can open its details modal directly. If URLs are provided, show them as clickable markdown links. Keep descriptions concise and informative. If this was a relaxed search, briefly mention that the exact criteria had no match and these are the closest alternatives.`;
    } else {
      dbContext = `[ThrustVault DB Search Results] Criteria: ${queryParamsText}\nNo matching motors were found in the database, even after relaxing search constraints. Notify the user that no matches exist for their criteria, then answer using general aerospace knowledge.`;
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
  // exported for unit testing
  normalizeCategory,
  parseThrustRange,
  trimMessages,
  extractJson,
};


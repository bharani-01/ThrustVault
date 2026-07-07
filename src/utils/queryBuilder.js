'use strict';
const pool = require('../config/db');

const SAFE = /^[a-zA-Z0-9_]+$/;
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'search']);

function buildFilter(col, val, startIdx) {
  if (!SAFE.test(col)) throw new Error(`Unsafe column: ${col}`);
  const s = String(val);
  if (s === 'is.null')     return { clause: `"${col}" IS NULL`,      vals: [], idx: startIdx };
  if (s === 'is.not.null') return { clause: `"${col}" IS NOT NULL`,  vals: [], idx: startIdx };

  const dot = s.indexOf('.');
  const op  = dot === -1 ? 'eq'  : s.slice(0, dot);
  const v   = dot === -1 ? s     : s.slice(dot + 1);

  const ph = `$${startIdx}`;
  switch (op) {
    case 'eq':    return { clause: `"${col}" = ${ph}`,      vals: [v],                idx: startIdx + 1 };
    case 'neq':   return { clause: `"${col}" != ${ph}`,     vals: [v],                idx: startIdx + 1 };
    case 'gt':    return { clause: `"${col}" > ${ph}`,      vals: [v],                idx: startIdx + 1 };
    case 'gte':   return { clause: `"${col}" >= ${ph}`,     vals: [v],                idx: startIdx + 1 };
    case 'lt':    return { clause: `"${col}" < ${ph}`,      vals: [v],                idx: startIdx + 1 };
    case 'lte':   return { clause: `"${col}" <= ${ph}`,     vals: [v],                idx: startIdx + 1 };
    case 'like':  return { clause: `"${col}" LIKE ${ph}`,   vals: [v.replace(/\*/g,'%')], idx: startIdx + 1 };
    case 'ilike': return { clause: `"${col}" ILIKE ${ph}`,  vals: [v.replace(/\*/g,'%')], idx: startIdx + 1 };
    case 'in': {
      const items = v.replace(/^\(|\)$/g,'').split(',').map(x => x.trim());
      return { clause: `"${col}" = ANY(${ph})`, vals: [items], idx: startIdx + 1 };
    }
    default:      return { clause: `"${col}" = ${ph}`,      vals: [v],                idx: startIdx + 1 };
  }
}

async function queryTable(table, method, payload, params) {
  if (!SAFE.test(table)) throw new Error(`Unsafe table name: ${table}`);
  method = (method || 'GET').toUpperCase();
  params = params || {};

  // GET
  if (method === 'GET') {
    let cols = '*';
    if (params.select) {
      cols = params.select.split(',')
        .map(c => {
          const t = c.trim();
          if (table === 'motors' && t === 'operating_voltage') {
            return `(custom_parameters->>'operating_voltage') AS "operating_voltage"`;
          }
          if (table === 'motors' && t === 'kv_rating') {
            return `(custom_parameters->>'kv_rating') AS "kv_rating"`;
          }
          if (table === 'escs' && t === 'continuous_current') {
            return `(custom_parameters->>'continuous_current_a') AS "continuous_current"`;
          }
          if (table === 'escs' && t === 'peak_current') {
            return `(custom_parameters->>'peak_current_a') AS "peak_current"`;
          }
          if (table === 'escs' && t === 'input_voltage') {
            return `(custom_parameters->>'voltage_range') AS "input_voltage"`;
          }
          if (table === 'propellers' && t === 'diameter') {
            return `(custom_parameters->>'diameter') AS "diameter"`;
          }
          if (table === 'propellers' && t === 'pitch') {
            return `(custom_parameters->>'pitch') AS "pitch"`;
          }
          if (table === 'propellers' && t === 'material') {
            return `(custom_parameters->>'material') AS "material"`;
          }
          if (!SAFE.test(t)) throw new Error(`Unsafe col: ${t}`);
          return `"${t}"`;
        })
        .join(', ');
    }

    const whereParts = [], vals = [];
    let idx = 1;
    for (const [k, v] of Object.entries(params)) {
      if (RESERVED.has(k)) continue;
      let colKey = k;
      if (table === 'motor_test_data_points' && k === 'run_id') {
        colKey = 'test_run_id';
      }
      const f = buildFilter(colKey, v, idx);
      whereParts.push(f.clause);
      vals.push(...f.vals);
      idx = f.idx;
    }

    if (params.search) {
      const searchVal = `%${params.search.trim().replace(/\*/g, '%')}%`;
      const ph = `$${idx}`;
      if (table === 'motors') {
        whereParts.push(`("motor_name" ILIKE ${ph} OR "company" ILIKE ${ph} OR "recommended_esc" ILIKE ${ph} OR "recommended_propeller" ILIKE ${ph})`);
      } else if (table === 'escs' || table === 'propellers') {
        whereParts.push(`("name" ILIKE ${ph} OR "brand" ILIKE ${ph} OR "sku" ILIKE ${ph})`);
      } else {
        whereParts.push(`("name" ILIKE ${ph} OR "email" ILIKE ${ph})`);
      }
      vals.push(searchVal);
      idx++;
    }

    let sql = `SELECT ${cols} FROM "${table}"`;
    if (whereParts.length) sql += ` WHERE ${whereParts.join(' AND ')}`;

    if (params.order) {
      const orderClauses = [];
      const orderItems = params.order.split(',');
      for (const item of orderItems) {
        const parts = item.trim().split('.');
        const col   = parts[0];
        const dir   = parts[1] === 'desc' ? 'DESC' : 'ASC';
        
        if (table === 'escs' && col === 'continuous_current') {
          orderClauses.push(`NULLIF(custom_parameters->>'continuous_current_a', '')::numeric ${dir}`);
        } else if (table === 'escs' && col === 'peak_current') {
          orderClauses.push(`NULLIF(custom_parameters->>'peak_current_a', '')::numeric ${dir}`);
        } else if (table === 'propellers' && col === 'diameter') {
          orderClauses.push(`NULLIF(custom_parameters->>'diameter', '')::numeric ${dir}`);
        } else if (table === 'propellers' && col === 'pitch') {
          orderClauses.push(`NULLIF(custom_parameters->>'pitch', '')::numeric ${dir}`);
        } else {
          if (!SAFE.test(col)) throw new Error(`Unsafe order col: ${col}`);
          orderClauses.push(`"${col}" ${dir}`);
        }
      }
      if (orderClauses.length) {
        sql += ` ORDER BY ${orderClauses.join(', ')}`;
      }
    }
    if (params.limit)  sql += ` LIMIT  ${parseInt(params.limit,  10)}`;
    if (params.offset) sql += ` OFFSET ${parseInt(params.offset, 10)}`;

    const res = await pool.query(sql, vals);
    return res.rows;

  // POST
  } else if (method === 'POST') {
    if (!payload || typeof payload !== 'object') throw new Error('POST requires payload');
    const items = Array.isArray(payload) ? payload : [payload];
    if (items.length === 0) return [];
    const insertedRows = [];
    for (const item of items) {
      const keys = Object.keys(item).filter(k => SAFE.test(k));
      if (keys.length === 0) continue;
      const cols  = keys.map(k => `"${k}"`).join(', ');
      const phs   = keys.map((_, i) => `$${i + 1}`).join(', ');
      const vals  = keys.map(k => {
        const val = item[k];
        if (val !== null && typeof val === 'object' && !(val instanceof Date) && !Buffer.isBuffer(val)) {
          return JSON.stringify(val);
        }
        return val;
      });
      const res = await pool.query(
        `INSERT INTO "${table}" (${cols}) VALUES (${phs}) RETURNING *`, vals
      );
      if (res.rows.length) insertedRows.push(res.rows[0]);
    }
    return insertedRows;

  // PATCH
  } else if (method === 'PATCH') {
    if (!payload || typeof payload !== 'object') throw new Error('PATCH requires payload');
    const setKeys = Object.keys(payload).filter(k => SAFE.test(k));
    if (setKeys.length === 0) throw new Error('No valid fields to update');

    const setClauses = setKeys.map((k, i) => `"${k}" = $${i + 1}`);
    const vals = setKeys.map(k => {
      const val = payload[k];
      if (val !== null && typeof val === 'object' && !(val instanceof Date) && !Buffer.isBuffer(val)) {
        return JSON.stringify(val);
      }
      return val;
    });
    let idx = setKeys.length + 1;

    const whereParts = [];
    for (const [k, v] of Object.entries(params)) {
      if (RESERVED.has(k)) continue;
      const f = buildFilter(k, v, idx);
      whereParts.push(f.clause);
      vals.push(...f.vals);
      idx = f.idx;
    }

    let sql = `UPDATE "${table}" SET ${setClauses.join(', ')}`;
    if (whereParts.length) sql += ` WHERE ${whereParts.join(' AND ')}`;
    sql += ` RETURNING *`;
    const res = await pool.query(sql, vals);
    return res.rows;

  // DELETE
  } else if (method === 'DELETE') {
    const whereParts = [], vals = [];
    let idx = 1;
    for (const [k, v] of Object.entries(params)) {
      if (RESERVED.has(k)) continue;
      const f = buildFilter(k, v, idx);
      whereParts.push(f.clause);
      vals.push(...f.vals);
      idx = f.idx;
    }
    if (whereParts.length === 0) throw new Error('DELETE without filters is not allowed');
    const sql = `DELETE FROM "${table}" WHERE ${whereParts.join(' AND ')} RETURNING *`;
    const res = await pool.query(sql, vals);
    return res.rows;
  }

  throw new Error(`Unsupported method: ${method}`);
}

module.exports = {
  queryTable,
};

'use strict';
const sqliteDb = require('../config/sqlite');

const SAFE = /^[a-zA-Z0-9_]+$/;
const RESERVED = new Set(['select', 'order', 'limit', 'offset']);

function buildSQLiteFilter(col, val) {
  if (!SAFE.test(col)) throw new Error(`Unsafe column name: ${col}`);
  const s = String(val);

  if (s === 'is.null')     return { clause: `"${col}" IS NULL`,      vals: [] };
  if (s === 'is.not.null') return { clause: `"${col}" IS NOT NULL`,  vals: [] };

  const dot = s.indexOf('.');
  const op  = dot === -1 ? 'eq'  : s.slice(0, dot);
  const v   = dot === -1 ? s     : s.slice(dot + 1);

  switch (op) {
    case 'eq':    return { clause: `"${col}" = ?`,      vals: [v] };
    case 'neq':   return { clause: `"${col}" != ?`,     vals: [v] };
    case 'gt':    return { clause: `"${col}" > ?`,      vals: [v] };
    case 'gte':   return { clause: `"${col}" >= ?`,     vals: [v] };
    case 'lt':    return { clause: `"${col}" < ?`,      vals: [v] };
    case 'lte':   return { clause: `"${col}" <= ?`,     vals: [v] };
    case 'like':  
    case 'ilike': return { clause: `"${col}" LIKE ?`,   vals: [v.replace(/\*/g, '%')] }; // SQLite LIKE is case-insensitive by default
    case 'in': {
      const items = v.replace(/^\(|\)$/g, '').split(',').map(x => x.trim());
      const placeholders = items.map(() => '?').join(', ');
      return { clause: `"${col}" IN (${placeholders})`, vals: items };
    }
    default:      return { clause: `"${col}" = ?`,      vals: [v] };
  }
}

/**
 * Executes a GET query builder on SQLite table
 */
async function querySQLiteTable(table, params) {
  if (!SAFE.test(table)) throw new Error(`Unsafe table name: ${table}`);
  params = params || {};

  let cols = '*';
  if (params.select) {
    cols = params.select.split(',')
      .map(c => {
        const t = c.trim();
        if (!SAFE.test(t)) throw new Error(`Unsafe col: ${t}`);
        return `"${t}"`;
      })
      .join(', ');
  }

  const whereParts = [];
  const vals = [];

  for (const [k, v] of Object.entries(params)) {
    if (RESERVED.has(k)) continue;
    const f = buildSQLiteFilter(k, v);
    whereParts.push(f.clause);
    vals.push(...f.vals);
  }

  let sql = `SELECT ${cols} FROM "${table}"`;
  if (whereParts.length) {
    sql += ` WHERE ${whereParts.join(' AND ')}`;
  }

  if (params.order) {
    const orderClauses = [];
    const orderItems = params.order.split(',');
    for (const item of orderItems) {
      const parts = item.trim().split('.');
      const col   = parts[0];
      const dir   = parts[1] === 'desc' ? 'DESC' : 'ASC';
      if (!SAFE.test(col)) throw new Error(`Unsafe order col: ${col}`);
      orderClauses.push(`"${col}" ${dir}`);
    }
    if (orderClauses.length) {
      sql += ` ORDER BY ${orderClauses.join(', ')}`;
    }
  }

  if (params.limit) {
    sql += ` LIMIT ${parseInt(params.limit, 10)}`;
  }
  if (params.offset) {
    sql += ` OFFSET ${parseInt(params.offset, 10)}`;
  }

  try {
    const stmt = sqliteDb.prepare(sql);
    const rows = stmt.all(...vals);

    // SQLite returns parsed objects but we need to ensure custom_parameters and extra_data are parsed to JSON objects to match Postgres structure
    return rows.map(r => {
      const copy = { ...r };
      if (copy.custom_parameters && typeof copy.custom_parameters === 'string') {
        try {
          copy.custom_parameters = JSON.parse(copy.custom_parameters);
        } catch (e) {}
      }
      if (copy.extra_data && typeof copy.extra_data === 'string') {
        try {
          copy.extra_data = JSON.parse(copy.extra_data);
        } catch (e) {}
      }
      return copy;
    });
  } catch (err) {
    console.error(`[SQLite Query Error] SQL: ${sql} | Error:`, err.message);
    throw err;
  }
}

module.exports = {
  querySQLiteTable,
};

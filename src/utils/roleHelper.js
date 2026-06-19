'use strict';

/**
 * Maps DB role 'intern' to 'user' for consistency.
 */
function normaliseRole(dbRole) {
  if (!dbRole) return null;
  if (dbRole === 'intern') return 'user';
  return dbRole; // 'user', 'admin', 'guest'
}

/**
 * Returns role that the client expects (hides admin role if needed).
 */
function clientRole(role) {
  return role === 'admin' ? 'user' : role;
}

module.exports = {
  normaliseRole,
  clientRole,
};

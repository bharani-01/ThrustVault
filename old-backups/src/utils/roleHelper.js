'use strict';

function normaliseRole(dbRole) {
  if (!dbRole) return null;
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

'use strict';

function normaliseRole(dbRole) {
  if (!dbRole) return null;
  return dbRole; // 'user', 'admin', 'guest'
}

function clientRole(role) {
  return role === 'admin' ? 'user' : role;
}

module.exports = {
  normaliseRole,
  clientRole,
};

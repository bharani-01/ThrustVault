'use strict';

/**
 * Middleware to restrict route access to authenticated roles ('user', 'admin').
 * Expires sessions older than 24 hours.
 */
function requireRole(...allowedRoles) {
  const allowed = allowedRoles.flat();
  
  return (req, res, next) => {
    const role = req.session.role;
    const ts = req.session.timestamp || 0;

    // Strict check: Session must exist, match allowed roles, and be less than 24 hours old
    if (!role || !allowed.includes(role)) {
      return res.status(401).json({ error: 'Unauthorized: Access restricted to registered members.' });
    }

    if (Date.now() - ts > 86_400_000) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Session expired: Please log in again.' });
    }

    next();
  };
}

module.exports = {
  requireRole,
};

'use strict';

/**
 * Express middleware to restrict route access by session user role.
 * Expires session if it exceeds 24 hours.
 */
function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, res, next) => {
    let role = req.session.role;
    let ts   = req.session.timestamp || 0;

    // Anonymous GET bypass for public guest catalog browsing
    if (!role && req.method === 'GET' && allowed.includes('guest')) {
      return next();
    }

    if (!role || !allowed.includes(role)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (role !== 'guest' && Date.now() - ts > 86_400_000) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Session expired' });
    }
    next();
  };
}

module.exports = {
  requireRole,
};

'use strict';
const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');
const { requireRole } = require('../middlewares/auth');
const { requestAccessLimiter } = require('../middlewares/rateLimiter');

// Public write-only Postgres submission endpoints
router.post('/request-demo', dataController.requestDemo);
router.post('/public/request-access', requestAccessLimiter, dataController.requestAccess);

// Lock all remaining database endpoints to 'admin' and 'user' roles only
router.get('/init-data', requireRole('admin', 'user'), dataController.initData);

// Motors routes
router.get('/motors', requireRole('admin', 'user'), dataController.getMotors);
router.post('/motors', requireRole('admin', 'user'), dataController.createMotor);
router.patch('/motors/:id/recommendations', requireRole('admin', 'user'), dataController.updateRecommendations);

// Categories routes
router.get('/categories', requireRole('admin', 'user'), dataController.getCategories);
router.post('/categories', requireRole('admin', 'user'), dataController.createCategory);
router.delete('/categories/:id', requireRole('admin', 'user'), dataController.deleteCategory);

// Custom Specs routes
router.get('/custom-specs', requireRole('admin', 'user'), dataController.getCustomSpecs);
router.post('/custom-specs', requireRole('admin', 'user'), dataController.createCustomSpec);
router.delete('/custom-specs/:id', requireRole('admin', 'user'), dataController.deleteCustomSpec);

// Onboarding routes
router.get('/onboarding', requireRole('admin', 'user'), dataController.getOnboarding);
router.post('/onboarding', requireRole('admin', 'user'), dataController.saveOnboarding);

// User Profiles routes
router.get('/user-profiles', requireRole('admin', 'user'), dataController.getUserProfiles);

// Audit logs
router.post('/log-activity', requireRole('admin', 'user'), dataController.logActivity);

// Proxy routes for telemetry and draft runs (checked internally in dbProxy)
router.all('/:table(motor-test-runs|motor-test-data-points|draft-test-runs)', (req, res, next) => {
  next();
}, dataController.dbProxy);

router.all('/:table(motor-test-runs|motor-test-data-points|draft-test-runs)/:id', (req, res, next) => {
  req.query.id = `eq.${req.params.id}`;
  next();
}, dataController.dbProxy);

// Generic database table API proxy (ACL checked internally)
router.all('/db/:table', dataController.dbProxy);
router.all('/db/:table/:id', (req, res, next) => {
  req.query.id = `eq.${req.params.id}`;
  next();
}, dataController.dbProxy);

// Legacy Supabase config mock endpoint
router.get('/config', (_req, res) => {
  res.json({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '' });
});

module.exports = router;

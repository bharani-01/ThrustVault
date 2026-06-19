'use strict';
const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');
const { requireRole } = require('../middlewares/auth');

// Bootstrap data route
router.get('/init-data', requireRole('admin', 'user', 'guest'), dataController.initData);

// Motors routes
router.get('/motors', requireRole('admin', 'user', 'guest'), dataController.getMotors);
router.post('/motors', requireRole('admin', 'user'), dataController.createMotor);
router.patch('/motors/:id/recommendations', requireRole('admin', 'user'), dataController.updateRecommendations);

// Categories routes
router.get('/categories', requireRole('admin', 'user', 'guest'), dataController.getCategories);
router.post('/categories', requireRole('admin', 'user'), dataController.createCategory);
router.delete('/categories/:id', requireRole('admin', 'user'), dataController.deleteCategory);

// Custom Specs routes
router.get('/custom-specs', requireRole('admin', 'user', 'guest'), dataController.getCustomSpecs);
router.post('/custom-specs', requireRole('admin', 'user'), dataController.createCustomSpec);
router.delete('/custom-specs/:id', requireRole('admin', 'user'), dataController.deleteCustomSpec);

// Onboarding routes
router.get('/onboarding', requireRole('admin', 'user', 'guest'), dataController.getOnboarding);
router.post('/onboarding', requireRole('admin', 'user', 'guest'), dataController.saveOnboarding);

// User Profiles routes
router.get('/user-profiles', requireRole('admin', 'user'), dataController.getUserProfiles);

// Audit logs
router.post('/log-activity', requireRole('admin', 'user', 'guest'), dataController.logActivity);

// Public access / demo requests
router.post('/request-demo', dataController.requestDemo);
router.post('/public/request-access', dataController.requestAccess);

// Proxy routes for telemetry and draft runs to match client-side endpoints
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

'use strict';
const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');
const { requireRole } = require('../middlewares/auth');

// ── Mount Modular Sub-routers ────────────────────────────────────────────────
router.use('/public', require('./publicRoutes'));
router.use('/ai', require('./aiRoutes'));
router.use('/guest', require('./guestRoutes'));
router.use('/motors', require('./motorRoutes'));
router.use('/categories', require('./categoryRoutes'));
router.use('/custom-specs', require('./customSpecRoutes'));
router.use('/escs', require('./escRoutes'));
router.use('/propellers', require('./propellerRoutes'));
router.use('/onboarding', require('./onboardingRoutes'));
router.use('/user-profiles', require('./userProfileRoutes'));

// ── Root-level Legacy / General Endpoints ────────────────────────────────────
router.post('/request-demo', dataController.requestDemo);
router.get('/init-data', requireRole('admin', 'user'), dataController.initData);
router.post('/log-activity', requireRole('admin', 'user'), dataController.logActivity);

// Proxy routes
router.use('/', require('./proxyRoutes'));

module.exports = router;

'use strict';
const express = require('express');
const router = express.Router();
const guestController = require('../controllers/guestController');
const { guestLimiter } = require('../middlewares/rateLimiter');

// Guest catalog endpoints
router.get('/init-data', guestLimiter, guestController.initData);
router.get('/categories', guestLimiter, guestController.getCategories);
router.get('/motors', guestLimiter, guestController.getMotors);
router.get('/custom-specs', guestLimiter, guestController.getCustomSpecs);
router.get('/motor-test-runs', guestLimiter, guestController.getMotorTestRuns);
router.get('/motor-test-data-points', guestLimiter, guestController.getMotorTestDataPoints);
router.post('/log-activity', guestController.logActivity);

module.exports = router;

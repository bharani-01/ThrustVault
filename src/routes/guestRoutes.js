'use strict';
const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');
const { guestLimiter } = require('../middlewares/rateLimiter');

router.get('/custom-specs', guestLimiter, dataController.getGuestCustomSpecs);
router.get('/share/:type/:name', guestLimiter, dataController.getGuestShareItem);
router.get('/motors/search', guestLimiter, dataController.searchGuestMotors);
router.get('/:table(motor-test-runs|motor-test-data-points)', guestLimiter, dataController.getGuestDbTable);

module.exports = router;

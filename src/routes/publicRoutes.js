'use strict';
const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');
const { requestAccessLimiter } = require('../middlewares/rateLimiter');

router.post('/request-demo', dataController.requestDemo);
router.post('/request-access', requestAccessLimiter, dataController.requestAccess);
router.get('/find-item/:name', dataController.findItemByName);

module.exports = router;

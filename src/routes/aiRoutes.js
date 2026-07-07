'use strict';
const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { guestLimiter } = require('../middlewares/rateLimiter');

router.post('/chat', guestLimiter, aiController.getChatCompletions);

module.exports = router;

'use strict';
const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');
const { requireRole } = require('../middlewares/auth');

router.get('/', requireRole('admin', 'user'), dataController.getUserProfiles);

module.exports = router;

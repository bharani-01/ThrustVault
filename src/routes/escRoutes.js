'use strict';
const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');
const { requireRole } = require('../middlewares/auth');

router.get('/', requireRole('admin', 'user'), dataController.getEscs);
router.post('/', requireRole('admin', 'user'), dataController.createEsc);

module.exports = router;

'use strict';
const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');
const { requireRole } = require('../middlewares/auth');

router.get('/', requireRole('admin', 'user'), dataController.getCustomSpecs);
router.post('/', requireRole('admin', 'user'), dataController.createCustomSpec);
router.delete('/:id', requireRole('admin', 'user'), dataController.deleteCustomSpec);

module.exports = router;

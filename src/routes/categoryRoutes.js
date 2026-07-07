'use strict';
const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');
const { requireRole } = require('../middlewares/auth');

router.get('/', requireRole('admin', 'user'), dataController.getCategories);
router.post('/', requireRole('admin', 'user'), dataController.createCategory);
router.delete('/:id', requireRole('admin', 'user'), dataController.deleteCategory);

module.exports = router;

'use strict';
const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');
const { requireRole } = require('../middlewares/auth');

router.get('/', requireRole('admin', 'user'), dataController.getMotors);
router.get('/finder', requireRole('admin', 'user'), dataController.findMotorsWizard);
router.post('/', requireRole('admin', 'user'), dataController.createMotor);
router.patch('/:id/recommendations', requireRole('admin', 'user'), dataController.updateRecommendations);

module.exports = router;

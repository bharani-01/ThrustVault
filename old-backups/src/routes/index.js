'use strict';
const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');
const apiRoutes = require('./apiRoutes');

router.use('/auth', authRoutes);
router.use('/', apiRoutes);

module.exports = router;

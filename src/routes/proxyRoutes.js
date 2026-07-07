'use strict';
const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');

// Proxy routes for telemetry and draft runs (checked internally in dbProxy)
router.all('/:table(motor-test-runs|motor-test-data-points|draft-test-runs)', (req, res, next) => {
  next();
}, dataController.dbProxy);

router.all('/:table(motor-test-runs|motor-test-data-points|draft-test-runs)/:id', (req, res, next) => {
  req.query.id = `eq.${req.params.id}`;
  next();
}, dataController.dbProxy);

// Generic database table API proxy (ACL checked internally)
router.all('/db/:table', dataController.dbProxy);
router.all('/db/:table/:id', (req, res, next) => {
  req.query.id = `eq.${req.params.id}`;
  next();
}, dataController.dbProxy);

module.exports = router;

'use strict';
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { loginLimiter } = require('../middlewares/rateLimiter');

router.post('/login', loginLimiter, authController.login);
router.post('/logout', authController.logout);
router.get('/session', authController.getSession);
router.post('/forgot-password', loginLimiter, authController.forgotPassword);
router.post('/verify-otp', loginLimiter, authController.verifyOtp);
router.post('/reset-password', loginLimiter, authController.resetPassword);

module.exports = router;

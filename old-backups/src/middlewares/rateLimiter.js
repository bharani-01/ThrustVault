'use strict';
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 5,
  message: { error: 'Too many login attempts. Please try again in a minute.' },
});

const requestAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // limit each IP to 3 requests per 15 minutes
  message: { error: 'Too many requests. Please try again after 15 minutes.' },
});

const guestLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 60, // Limit each IP to 60 requests per minute
  message: { error: 'Too many requests. Please slow down.' },
});

module.exports = {
  loginLimiter,
  requestAccessLimiter,
  guestLimiter,
};

'use strict';
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 5,
  message: { error: 'Too many login attempts. Please try again in a minute.' },
});

module.exports = {
  loginLimiter,
};

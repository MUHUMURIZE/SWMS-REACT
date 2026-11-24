const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const loginAttempts = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const ip = ipKeyGenerator(req);
    const email = typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "unknown";
    return `${ip}:${email}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "Too many login attempts. Try again later.",
      },
    });
  },
});

module.exports = loginAttempts;

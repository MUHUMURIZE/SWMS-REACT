const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { createClient } = require("redis");

const redisUrl = process.env.REDIS_URL;
if (process.env.NODE_ENV === "production" && !redisUrl) {
  throw new Error("REDIS_URL must be configured in production for shared login rate limiting.");
}

const redisClient = redisUrl
  ? createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy(retries) {
        return retries >= 5 ? new Error("Redis login rate-limit connection failed.") : retries * 200;
      },
    },
  })
  : null;

if (redisClient) {
  redisClient.on("error", (error) => {
    console.error("Login rate-limit Redis client error:", error);
  });
}

function loginRateLimitKeyGenerator(req) {
  const ip = ipKeyGenerator(req.ip);
  const email = typeof req.body?.email === "string"
    ? req.body.email.trim().toLowerCase()
    : "unknown";
  return `${ip}:${email}`;
}

const loginAttempts = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: loginRateLimitKeyGenerator,
  ...(redisClient ? {
    store: new RedisStore({
      prefix: "swms:login:",
      sendCommand: (...args) => redisClient.sendCommand(args),
    }),
  } : {}),
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "Too many login attempts. Try again later.",
      },
    });
  },
});

async function connectLoginRateLimiter() {
  if (redisClient && !redisClient.isOpen) await redisClient.connect();
}

module.exports = {
  loginAttempts,
  loginRateLimitKeyGenerator,
  connectLoginRateLimiter,
};

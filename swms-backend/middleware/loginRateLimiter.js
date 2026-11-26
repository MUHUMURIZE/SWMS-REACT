const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { createClient } = require("redis");

const isProduction = process.env.NODE_ENV === "production";
const redisUrl = process.env.REDIS_URL;

if (isProduction && !redisUrl) {
  throw new Error("REDIS_URL must be configured in production for shared rate limiting.");
}
if (isProduction) {
  let protocol;
  try {
    protocol = new URL(redisUrl).protocol;
  } catch {
    throw new Error("REDIS_URL must be a valid rediss:// URL in production.");
  }
  if (protocol !== "rediss:") {
    throw new Error("REDIS_URL must use rediss:// in production.");
  }
}

const redisClient = redisUrl
  ? createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy(retries) {
        return retries >= 5 ? new Error("Redis rate-limit connection failed.") : retries * 200;
      },
    },
  })
  : null;

if (redisClient) {
  redisClient.on("error", (error) => {
    console.error("Rate-limit Redis client error:", error);
  });
}

function configuredLimit(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function loginRateLimitKeyGenerator(req) {
  const ip = ipKeyGenerator(req.ip);
  const email = typeof req.body?.email === "string"
    ? req.body.email.trim().toLowerCase()
    : "unknown";
  return `${ip}:${email}`;
}

function createRateLimiter({
  name,
  windowMs,
  limit,
  keyGenerator,
  skip,
  skipSuccessfulRequests,
  useMemoryStore = false,
}) {
  const options = {
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    passOnStoreError: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests. Try again later.",
        },
      });
    },
  };
  if (keyGenerator) options.keyGenerator = keyGenerator;
  if (skip) options.skip = skip;
  if (skipSuccessfulRequests !== undefined) options.skipSuccessfulRequests = skipSuccessfulRequests;
  if (redisClient && !useMemoryStore) {
    options.store = new RedisStore({
      prefix: `swms:rate-limit:${name}:`,
      sendCommand: (...args) => redisClient.sendCommand(args),
    });
  }
  return rateLimit(options);
}

const loginAttempts = createRateLimiter({
  name: "login",
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: loginRateLimitKeyGenerator,
  skipSuccessfulRequests: true,
});

const authRequests = createRateLimiter({
  name: "auth",
  windowMs: 15 * 60 * 1000,
  limit: configuredLimit("AUTH_RATE_LIMIT_PER_15_MINUTES", 60),
});

const apiRequests = createRateLimiter({
  name: "api",
  windowMs: 15 * 60 * 1000,
  limit: configuredLimit("API_RATE_LIMIT_PER_15_MINUTES", 600),
  skip: (req) => req.path === "/tracking/ingest" || req.path === "/iot/ingest",
});

const deviceIngestionIpRequests = createRateLimiter({
  name: "device-ip",
  windowMs: 60 * 1000,
  limit: configuredLimit("DEVICE_INGESTION_IP_LIMIT_PER_MINUTE", 12000),
});

const gpsDeviceIngestionRequests = createRateLimiter({
  name: "gps-device",
  windowMs: 60 * 1000,
  limit: configuredLimit("GPS_DEVICE_INGESTION_LIMIT_PER_MINUTE", 600),
  keyGenerator: (req) => (req.device
    ? `device:${req.device.id}`
    : `ip:${ipKeyGenerator(req.ip)}`),
});

const iotDeviceIngestionRequests = createRateLimiter({
  name: "iot-device",
  windowMs: 60 * 1000,
  limit: configuredLimit("IOT_DEVICE_INGESTION_LIMIT_PER_MINUTE", 120),
  keyGenerator: (req) => (req.device
    ? `device:${req.device.id}`
    : `ip:${ipKeyGenerator(req.ip)}`),
});

async function connectLoginRateLimiter() {
  if (redisClient && !redisClient.isOpen) await redisClient.connect();
}

async function closeRateLimitStore() {
  if (redisClient && redisClient.isOpen) await redisClient.quit();
}

module.exports = {
  loginAttempts,
  loginRateLimitKeyGenerator,
  createRateLimiter,
  authRequests,
  apiRequests,
  deviceIngestionIpRequests,
  gpsDeviceIngestionRequests,
  iotDeviceIngestionRequests,
  connectLoginRateLimiter,
  closeRateLimitStore,
};

const fs = require("node:fs");

function dbTlsConfiguration(env = process.env, readFile = fs.readFileSync) {
  const mode = (env.DB_SSL_MODE || (env.NODE_ENV === "production" ? "" : "disable")).toLowerCase();
  if (env.NODE_ENV === "production" && mode !== "verify-full") {
    throw new Error("DB_SSL_MODE=verify-full is required in production.");
  }

  if (mode === "disable") {
    if (env.DB_SSL_CA_FILE) {
      throw new Error("DB_SSL_CA_FILE requires DB_SSL_MODE=verify-full.");
    }
    return false;
  }
  if (mode !== "verify-full") {
    throw new Error("DB_SSL_MODE must be either disable or verify-full.");
  }

  const ssl = { rejectUnauthorized: true };
  if (env.DB_SSL_CA_FILE) {
    const ca = readFile(env.DB_SSL_CA_FILE, "utf8");
    if (typeof ca !== "string" || !ca.trim()) {
      throw new Error("DB_SSL_CA_FILE must refer to a non-empty CA certificate.");
    }
    ssl.ca = ca;
  }
  return ssl;
}

module.exports = { dbTlsConfiguration };

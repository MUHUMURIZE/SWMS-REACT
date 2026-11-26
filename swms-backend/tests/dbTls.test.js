const test = require("node:test");
const assert = require("node:assert/strict");
const { dbTlsConfiguration } = require("../config/dbTls");

test("local database connections do not require TLS by default", () => {
  assert.equal(dbTlsConfiguration({ NODE_ENV: "development" }), false);
});

test("verify-full enables certificate and hostname verification with optional custom CA", () => {
  const config = dbTlsConfiguration(
    {
      NODE_ENV: "production",
      DB_SSL_MODE: "verify-full",
      DB_SSL_CA_FILE: "postgres-ca.pem",
    },
    (filePath, encoding) => {
      assert.equal(filePath, "postgres-ca.pem");
      assert.equal(encoding, "utf8");
      return "-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----";
    }
  );
  assert.equal(config.rejectUnauthorized, true);
  assert.match(config.ca, /BEGIN CERTIFICATE/);
});

test("production refuses missing or disabled PostgreSQL TLS", () => {
  assert.throws(
    () => dbTlsConfiguration({ NODE_ENV: "production" }),
    /DB_SSL_MODE=verify-full is required in production/
  );
  assert.throws(
    () => dbTlsConfiguration({ NODE_ENV: "production", DB_SSL_MODE: "disable" }),
    /DB_SSL_MODE=verify-full is required in production/
  );
});

test("unsupported TLS modes and empty CA files fail explicitly", () => {
  assert.throws(
    () => dbTlsConfiguration({ NODE_ENV: "development", DB_SSL_MODE: "require" }),
    /DB_SSL_MODE must be either disable or verify-full/
  );
  assert.throws(
    () => dbTlsConfiguration(
      { NODE_ENV: "development", DB_SSL_MODE: "verify-full", DB_SSL_CA_FILE: "empty.pem" },
      () => "  "
    ),
    /non-empty CA certificate/
  );
});

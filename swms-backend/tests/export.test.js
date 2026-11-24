const test = require("node:test");
const assert = require("node:assert/strict");
const { Writable } = require("node:stream");
const { pool } = require("../config/db");
const auditModel = require("../models/auditModel");
const { exportData } = require("../controllers/exportController");

function responseCapture() {
  const response = {
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
  return response;
}

test("CSV and Excel exports return downloadable files with correct content types", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 1, name: "Green City" }] }));
  t.mock.method(auditModel, "record", async () => {});

  for (const [format, contentType, check] of [
    ["csv", "text/csv; charset=utf-8", (body) => assert.match(body, /Green City/)],
    [
      "xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      (body) => assert.equal(Buffer.isBuffer(body), true),
    ],
  ]) {
    const response = responseCapture();
    await exportData({
      params: { resource: "companies", format },
      user: { id: 1, role: "ADMIN" },
      ip: "127.0.0.1",
    }, response);
    assert.equal(response.headers["Content-Type"], contentType);
    assert.match(response.headers["Content-Disposition"], new RegExp(`companies\\.${format}`));
    check(response.body);
  }
});

test("PDF export streams a valid PDF response", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 1, name: "Green City" }] }));
  t.mock.method(auditModel, "record", async () => {});
  const chunks = [];
  const response = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  response.headers = {};
  response.setHeader = function setHeader(name, value) {
    this.headers[name] = value;
  };

  const finished = new Promise((resolve, reject) => {
    response.once("finish", resolve);
    response.once("error", reject);
  });
  await exportData({
    params: { resource: "companies", format: "pdf" },
    user: { id: 1, role: "ADMIN" },
    ip: "127.0.0.1",
  }, response);
  await finished;
  assert.equal(response.headers["Content-Type"], "application/pdf");
  assert.equal(Buffer.concat(chunks).subarray(0, 4).toString(), "%PDF");
});

test("unsupported export formats and inherited resource names are rejected", async () => {
  const response = responseCapture();
  await assert.rejects(
    exportData({
      params: { resource: "companies", format: "json" },
      user: { id: 1, role: "ADMIN" },
    }, response),
    (error) => error.statusCode === 400 && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    exportData({
      params: { resource: "constructor", format: "csv" },
      user: { id: 1, role: "ADMIN" },
    }, response),
    (error) => error.statusCode === 404 && error.code === "NOT_FOUND"
  );
});


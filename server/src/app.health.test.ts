import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";

test("GET /api/v1/health returns service status", async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:example@127.0.0.1:5432/croxton_east";
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "test_access_secret_min_16_chars";
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "test_refresh_secret_min_16_chars";

  const { createApp } = await import("./app");
  const app = createApp();

  const res = await request(app).get("/api/v1/health");

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.service, "croxton-east-api");
});

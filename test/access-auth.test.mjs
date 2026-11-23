// Cloudflare Access mode: the studio trusts only requests carrying a valid Access JWT for its audience, plus requests
// addressed to loopback from tools on the server itself. Keys are generated here; nothing reaches Cloudflare.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import crypto from "node:crypto";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = mkdtempSync(join(tmpdir(), "minimax-studio-access-"));
process.env.MINIMAX_ASSETS_ROOT = root;
const TEAM = "example";
const AUD = "aud-tag-123";
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: otherKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
let certFetches = 0;
const fakeFetch = async (url) => {
  certFetches += 1;
  assert.equal(url, `https://${TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`);
  return { ok: true, json: async () => ({ keys: [jwk] }) };
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token(claims = {}, { key = privateKey, kid = "k1" } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "RS256", kid, typ: "JWT" })}.${b64({ iss: `https://${TEAM}.cloudflareaccess.com`, aud: [AUD], email: "owner@example.com", iat: now, nbf: now, exp: now + 600, ...claims })}`;
  return `${body}.${crypto.sign("RSA-SHA256", Buffer.from(body), key).toString("base64url")}`;
}

let server, port;
before(async () => {
  const { accessVerifier } = await import("../src/security.js");
  const { createStudioServer } = await import("../src/server.js");
  server = createStudioServer({ auth: { type: "access", team: TEAM, verify: accessVerifier({ team: TEAM, aud: AUD, fetchImpl: fakeFetch }) } });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  port = server.address().port;
});
after(async () => {
  server.closeAllConnections?.();
  await new Promise((ok) => server.close(ok));
  rmSync(root, { recursive: true, force: true });
});

// fetch() cannot set Host, and the public hostname is exactly what the tunnel sends.
const get = (path, headers = {}) =>
  new Promise((ok, fail) => {
    const req = http.request({ host: "127.0.0.1", port, path, headers: { host: "minimax.example.com", ...headers } }, (res) => {
      res.resume();
      res.on("end", () => ok(res.statusCode));
    });
    req.on("error", fail);
    req.end();
  });

test("a valid Access token (header or cookie) is the only login needed", async () => {
  assert.equal(await get("/api/status", { "cf-access-jwt-assertion": token() }), 200);
  assert.equal(await get("/", { cookie: `other=1; CF_Authorization=${token()}` }), 200);
});

test("requests that did not pass Access are refused", async () => {
  assert.equal(await get("/api/status"), 403);
  assert.equal(await get("/api/status", { "cf-access-jwt-assertion": "not-a-jwt" }), 403);
  assert.equal(await get("/api/status", { "cf-access-jwt-assertion": token({ aud: ["another-app"] }) }), 403);
  assert.equal(await get("/api/status", { "cf-access-jwt-assertion": token({ exp: Math.floor(Date.now() / 1000) - 5 }) }), 403);
  assert.equal(await get("/api/status", { "cf-access-jwt-assertion": token({ iss: "https://evil.cloudflareaccess.com" }) }), 403);
  assert.equal(await get("/api/status", { "cf-access-jwt-assertion": token({}, { key: otherKey }) }), 403);
  assert.equal(await get("/api/status", { authorization: "Basic " + Buffer.from("studio:x").toString("base64") }), 403);
});

test("tools on the server itself use loopback without a token; keys are cached", async () => {
  assert.equal(await get("/api/status", { host: `127.0.0.1:${port}` }), 200);
  assert.equal(await get("/api/status", { host: `localhost:${port}` }), 200);
  assert.ok(certFetches <= 2, `certs fetched ${certFetches} times`);
});

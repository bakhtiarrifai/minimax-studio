// Login and file-access rules of the Web Studio. No ComfyUI, GPU or ffmpeg needed: only the HTTP layer is exercised.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = mkdtempSync(join(tmpdir(), "minimax-studio-security-"));
const assets = join(root, "production_assets");
const outside = join(root, "outside");
for (const d of ["audio", "images/keys", "videos/ep01", "final"]) mkdirSync(join(assets, d), { recursive: true });
mkdirSync(outside);
writeFileSync(join(assets, "audio", "narration.wav"), "RIFFfake");
writeFileSync(join(assets, "images", "keys", "frame-01.png"), "png");
writeFileSync(join(assets, "videos", "ep01", "shot.mp4"), "0123456789");
writeFileSync(join(outside, "secret.env"), "GATEWAY_KEY=do-not-leak");
writeFileSync(join(outside, "other.mp4"), "video");
process.env.MINIMAX_ASSETS_ROOT = assets;
delete process.env.MINIMAX_STUDIO_OUT;
delete process.env.MINIMAX_FINAL_DIR;

const auth = { user: "studio", password: "correct horse battery" };
const AUTH = "Basic " + Buffer.from(`${auth.user}:${auth.password}`).toString("base64");
let server, base, security;

before(async () => {
  security = await import("../src/security.js");
  const { createStudioServer } = await import("../src/server.js");
  server = createStudioServer({ auth });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections?.();
  await new Promise((ok) => server.close(ok));
  rmSync(root, { recursive: true, force: true });
});

const get = (path, headers = { authorization: AUTH }) => fetch(base + path, { headers });
const post = (path, body) => fetch(base + path, { method: "POST", headers: { authorization: AUTH, "content-type": "application/json" }, body: JSON.stringify(body) });

test("every route, including the page itself, needs the login", async () => {
  for (const p of ["/", "/api/status", "/api/assets", "/api/scenes", `/api/video?path=${encodeURIComponent(join(assets, "videos", "ep01", "shot.mp4"))}`]) {
    const r = await get(p, {});
    assert.equal(r.status, 401, p);
    assert.match(r.headers.get("www-authenticate"), /^Basic /);
  }
  const wrong = "Basic " + Buffer.from("studio:wrong").toString("base64");
  assert.equal((await get("/api/assets", { authorization: wrong })).status, 401);
  assert.equal((await get("/", {})).headers.get("access-control-allow-origin"), null, "no CORS");
});

test("files outside the production folders are never served", async () => {
  for (const p of [join(outside, "secret.env"), join(outside, "other.mp4"), join(assets, "..", "outside", "other.mp4")]) {
    for (const route of ["/api/video", "/api/asset", "/api/thumbnail"]) {
      const r = await get(`${route}?path=${encodeURIComponent(p)}`);
      assert.equal(r.status, 404, `${route} ${p}`);
      assert.ok(!(await r.text()).includes("do-not-leak"));
    }
  }
  assert.equal((await get(`/api/asset?path=${encodeURIComponent(join(outside, "secret.env"))}`)).status, 404);
});

test("files inside are served, with ranges for the video player", async () => {
  const shot = encodeURIComponent(join(assets, "videos", "ep01", "shot.mp4"));
  const full = await get(`/api/video?path=${shot}`);
  assert.equal(full.status, 200);
  assert.equal(await full.text(), "0123456789");
  const part = await fetch(`${base}/api/video?path=${shot}`, { headers: { authorization: AUTH, range: "bytes=2-5" } });
  assert.equal(part.status, 206);
  assert.equal(await part.text(), "2345");
  const audio = await get(`/api/asset?path=${encodeURIComponent(join(assets, "audio", "narration.wav"))}`);
  assert.equal(audio.status, 200);
  assert.equal(audio.headers.get("content-type"), "audio/wav");
});

test("shared assets are listed by kind, and storage paths are reported", async () => {
  const { configured, assets: list } = await (await get("/api/assets")).json();
  assert.equal(configured, true);
  assert.deepEqual(list.audio.map((a) => a.name), ["narration.wav"]);
  assert.deepEqual(list.images.map((a) => a.name), ["keys/frame-01.png"]);
  assert.deepEqual(list.videos.map((a) => a.name), ["ep01/shot.mp4"]);
  const { scenes } = await (await get("/api/scenes")).json();
  assert.deepEqual(scenes.map((s) => s.filename), ["shot.mp4"]);
});

test("cut refuses clips, music or output outside the production folders", async () => {
  const inside = join(assets, "videos", "ep01", "shot.mp4");
  assert.equal((await post("/api/cut", { clips: [join(outside, "other.mp4")] })).status, 403);
  assert.equal((await post("/api/cut", { clips: [inside], musicPath: join(outside, "secret.env") })).status, 403);
  assert.equal((await post("/api/cut", { clips: [inside], outputPath: join(outside, "x.mp4") })).status, 403);
  assert.equal((await post("/api/cut", { clips: [inside], outputPath: join(assets, "final", "..", "..", "outside", "x.mp4") })).status, 403);
  assert.equal(existsSync(join(outside, "x.mp4")), false);
});

test("generate needs a prompt and refuses keyframes outside the images folder", async () => {
  assert.equal((await post("/api/generate", {})).status, 400);
  assert.equal((await post("/api/generate", { prompt: "x", firstFramePath: join(outside, "secret.env") })).status, 403);
  assert.equal((await post("/api/generate", { prompt: "x", firstFramePath: join(outside, "other.mp4") })).status, 403);
});

test("a body over 1 MB is refused", async () => {
  const r = await fetch(base + "/api/cut", { method: "POST", headers: { authorization: AUTH, "content-type": "application/json" }, body: JSON.stringify({ clips: ["x".repeat(1_100_000)] }) }).catch(() => null);
  assert.ok(!r || r.status === 413);
});

test("credentials: env wins, a LAN studio gets a generated password file, loopback may run open", () => {
  const file = join(root, "pw", "password");
  assert.equal(security.loadCredentials({ host: "127.0.0.1", env: {}, file }), null);
  const lan = security.loadCredentials({ host: "0.0.0.0", env: {}, file });
  assert.equal(lan.source, "generated");
  assert.ok(lan.password.length >= 20);
  assert.equal(readFileSync(file, "utf8").trim(), lan.password);
  assert.equal(security.loadCredentials({ host: "0.0.0.0", env: {}, file }).password, lan.password, "reused, not regenerated");
  assert.equal(security.loadCredentials({ host: "0.0.0.0", env: { MINIMAX_STUDIO_PASSWORD: "p" }, file }).password, "p");
  assert.equal(security.loadCredentials({ host: "127.0.0.1", env: { MINIMAX_STUDIO_REQUIRE_AUTH: "1" }, file }).password, lan.password);
});

test("project names cannot climb out of the shots folder", () => {
  assert.equal(security.safeName("../../etc"), "etc");
  assert.equal(security.safeName("ep 13/sahl"), "ep_13_sahl");
  assert.equal(security.safeName(""), "default");
});

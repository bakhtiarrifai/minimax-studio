// Login and file-access rules for the Web Studio. The studio can start GPU jobs and read files, so it must never be
// reachable without a password, and its file endpoints only ever touch the production folders.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);
export const PASSWORD_FILE = path.join(os.homedir(), ".config", "minimax-studio", "password");

// Password from MINIMAX_STUDIO_PASSWORD, else from PASSWORD_FILE. A studio bound beyond loopback without either gets a
// generated password written to PASSWORD_FILE (mode 600). Only a loopback-only studio may run without a login.
export function loadCredentials({ host, env = process.env, file = PASSWORD_FILE } = {}) {
  const user = env.MINIMAX_STUDIO_USER || "studio";
  if (env.MINIMAX_STUDIO_PASSWORD) return { user, password: env.MINIMAX_STUDIO_PASSWORD, source: "env" };
  if (fs.existsSync(file)) {
    const password = fs.readFileSync(file, "utf8").trim();
    if (password) return { user, password, source: "file", file };
  }
  if (LOOPBACK.has(host) && env.MINIMAX_STUDIO_REQUIRE_AUTH !== "1") return null;
  const password = crypto.randomBytes(18).toString("base64url");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${password}\n`, { mode: 0o600 });
  return { user, password, source: "generated", file };
}

const digest = (s) => crypto.createHash("sha256").update(String(s)).digest();
const b64json = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

// Cloudflare Access in front of the studio (MINIMAX_STUDIO_ACCESS_TEAM + MINIMAX_STUDIO_ACCESS_AUD): the visitor logs in
// once at Cloudflare, and every request reaches the studio with a signed Cf-Access-Jwt-Assertion. The studio checks that
// signature, so a request that did not pass Access (a misconfigured policy, another route to the port) is still refused.
export function accessVerifier({ team, aud, fetchImpl = fetch, now = () => Date.now() }) {
  const issuer = `https://${team}.cloudflareaccess.com`;
  let keys = new Map();
  let fetchedAt = 0;
  const refresh = async () => {
    const res = await fetchImpl(`${issuer}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Access certs: HTTP ${res.status}`);
    const { keys: list = [] } = await res.json();
    keys = new Map(list.map((k) => [k.kid, crypto.createPublicKey({ key: k, format: "jwk" })]));
    fetchedAt = now();
  };
  return async function verify(token) {
    try {
      const [h, p, s] = String(token || "").split(".");
      if (!h || !p || !s) return null;
      const header = b64json(h);
      if (header.alg !== "RS256") return null;
      // Keys rotate: refresh hourly, or at most once a minute when an unknown key id shows up.
      if (!keys.has(header.kid) || now() - fetchedAt > 3_600_000) {
        if (now() - fetchedAt > 60_000 || !keys.size) await refresh();
      }
      const key = keys.get(header.kid);
      if (!key || !crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), key, Buffer.from(s, "base64url"))) return null;
      const claims = b64json(p);
      const t = now() / 1000;
      const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (claims.iss !== issuer || !auds.includes(aud) || !(claims.exp > t) || (claims.nbf && claims.nbf > t + 60)) return null;
      return claims;
    } catch {
      return null;
    }
  };
}

const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
const cookie = (req, name) => (req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

// `auth`: null (open, loopback only), { type: "basic", user, password }, or { type: "access", verify }.
export async function authorized(req, auth) {
  if (!auth) return true;
  if (auth.type === "access") {
    // Tools on the server itself call http://127.0.0.1:<port>; the tunnel always sends the public hostname.
    if (LOCAL_HOST.test(req.headers.host || "")) return true;
    const token = req.headers["cf-access-jwt-assertion"] || cookie(req, "CF_Authorization");
    return Boolean(await auth.verify(token));
  }
  const creds = auth;
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  const userOk = crypto.timingSafeEqual(digest(decoded.slice(0, i)), digest(creds.user));
  const passOk = crypto.timingSafeEqual(digest(decoded.slice(i + 1)), digest(creds.password));
  return userOk && passOk;
}

const norm = (p) => (process.platform === "win32" ? p.toLowerCase() : p);

// Resolves symlinks of the path, or of its nearest existing parent for files that are about to be written.
function realish(p) {
  let cur = path.resolve(p);
  const rest = [];
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) return path.resolve(p);
    rest.unshift(path.basename(cur));
    cur = parent;
  }
  return path.join(fs.realpathSync(cur), ...rest);
}

// Returns a checker that accepts only paths inside one of `roots` with one of the given extensions.
export function pathGuard(roots) {
  const allowed = roots.filter(Boolean).map((r) => norm(realish(r)));
  return (p, { exts, mustExist = true } = {}) => {
    if (typeof p !== "string" || !p || p.includes("\0")) return null;
    const full = realish(p);
    const n = norm(full);
    if (!allowed.some((r) => n === r || n.startsWith(r.endsWith(path.sep) ? r : r + path.sep))) return null;
    if (exts && !exts.includes(path.extname(full).toLowerCase())) return null;
    if (mustExist && !(fs.existsSync(full) && fs.statSync(full).isFile())) return null;
    return full;
  };
}

// Project folder names become directory names: keep them plain.
export function safeName(name, fallback = "default") {
  const clean = String(name ?? "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(0, 64);
  return clean || fallback;
}

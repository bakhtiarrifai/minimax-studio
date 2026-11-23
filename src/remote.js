// Talking to the Web Studio on the Ubuntu node from anywhere.
// - On the server itself (no MINIMAX_REMOTE_HOST): plain HTTP to http://127.0.0.1:<port>, which needs no login.
// - From the Windows PC or a laptop: over SSH (MINIMAX_REMOTE_HOST, e.g. "bakhtiar-server-ts"), running curl against the
//   same loopback address on the server. SSH keys are the only credential; nothing new is exposed to the network.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.MINIMAX_STUDIO_PORT || 8795);
const WIN_SSH = "C:\\Windows\\System32\\OpenSSH";
// Windows' own OpenSSH reaches the ssh-agent; Git for Windows' ssh does not.
const bin = (name) => {
  const env = process.env[`MINIMAX_${name.toUpperCase()}`];
  if (env) return env;
  const win = path.join(WIN_SSH, `${name}.exe`);
  return process.platform === "win32" && fs.existsSync(win) ? win : name;
};
const SSH_OPTS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15"];

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${path.basename(cmd)} exited ${code}: ${err.trim().slice(0, 400)}`))));
    child.stdin.end(input ?? "");
  });
}

const quote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

export function remoteHost() {
  return process.env.MINIMAX_REMOTE_HOST || null;
}

// Calls the studio API and returns the parsed JSON (errors from the studio become exceptions).
export async function api(method, route, body, { host = remoteHost() } = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  let text;
  if (!host) {
    const res = await fetch(`http://127.0.0.1:${PORT}${route}`, { method, headers: { "content-type": "application/json" }, body: payload });
    text = await res.text();
  } else {
    const curl = `curl -s -X ${method} ${quote(`http://127.0.0.1:${PORT}${route}`)} -H 'content-type: application/json'${payload ? " --data-binary @-" : ""}`;
    text = await run(bin("ssh"), [...SSH_OPTS, host, curl], payload);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Studio answered with something that is not JSON: ${text.slice(0, 200) || "(nothing: is the studio running?)"}`);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// Runs a shell command on the server (or locally when there is no host).
export async function shell(command, { input, host = remoteHost() } = {}) {
  if (!host) return run("bash", ["-c", command], input);
  return run(bin("ssh"), [...SSH_OPTS, host, command], input);
}

// Copies local files into a folder on the server, atomically per file (.part, then rename).
export async function upload(files, remoteDir, { host = remoteHost() } = {}) {
  if (!files.length) return [];
  if (!/^\/[\w./-]+$/.test(remoteDir)) throw new Error(`Unexpected remote folder: ${remoteDir}`);
  const names = files.map((f) => path.basename(f));
  if (names.some((n) => !/^[\w.-]+$/.test(n))) throw new Error("File names may only use letters, digits, '.', '-' and '_'");
  if (!host) {
    fs.mkdirSync(remoteDir, { recursive: true });
    files.forEach((f, i) => fs.copyFileSync(f, path.join(remoteDir, names[i])));
    return names.map((n) => path.posix.join(remoteDir, n));
  }
  await shell(`mkdir -p ${quote(remoteDir)}`, { host });
  const staged = [];
  for (const [i, f] of files.entries()) {
    const part = `${path.posix.join(remoteDir, names[i])}.part`;
    await run(bin("scp"), [...SSH_OPTS, "-q", f, `${host}:${part}`]);
    staged.push(part);
  }
  await shell(staged.map((p) => `mv -f ${quote(p)} ${quote(p.slice(0, -5))}`).join(" && "), { host });
  return names.map((n) => path.posix.join(remoteDir, n));
}

// Writes a small text file on the server (used for the audio_done.json marker, written last).
export async function writeRemote(remoteFile, text, { host = remoteHost() } = {}) {
  if (!/^\/[\w./-]+$/.test(remoteFile)) throw new Error(`Unexpected remote file: ${remoteFile}`);
  if (!host) return fs.writeFileSync(remoteFile, text);
  return shell(`cat > ${quote(remoteFile)}.part && mv -f ${quote(remoteFile)}.part ${quote(remoteFile)}`, { host, input: text });
}

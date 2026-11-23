// On-demand services on the Windows PC (audio node): ComfyUI is started when an audio job needs it and stopped again
// after it has been idle; the audio worker is started when Claude Code on this PC triggers a production.
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMFY = process.env.COMFYUI_URL || "http://127.0.0.1:8188";
export const WORKER_PID = path.join(os.tmpdir(), "minimax-audio-worker.pid");

const firstExisting = (list) => list.find((f) => f && fs.existsSync(f)) ?? null;
const startMinimized = (title, file) =>
  spawn("cmd.exe", ["/c", `start "${title}" /min "${file}"`], { cwd: REPO, detached: true, stdio: "ignore", windowsVerbatimArguments: true, windowsHide: true }).unref();

export async function comfyUp() {
  try {
    const res = await fetch(`${COMFY}/system_stats`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Starts ComfyUI with this PC's launcher when it is not running. Returns "running", "started" or a reason it cannot.
export async function ensureComfy({ waitMs = 300_000, log = () => {} } = {}) {
  if (await comfyUp()) return "running";
  if (process.platform !== "win32") return "not running (start it yourself on this system)";
  const launcher = firstExisting([process.env.MINIMAX_COMFY_LAUNCHER, path.join(REPO, "start_comfyui_local.bat"), path.join(REPO, "start_comfyui_nas.bat")]);
  if (!launcher) return "no launcher found (set MINIMAX_COMFY_LAUNCHER)";
  log(`  starting ComfyUI: ${path.basename(launcher)}`);
  startMinimized("ComfyUI", launcher);
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 3000));
    if (await comfyUp()) return "started";
  }
  return "did not come up in time";
}

const ps = (script) =>
  new Promise((ok) => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true }, (err, out) => ok(err ? "" : String(out).trim())));

// Stops the ComfyUI listening on the configured port, with the console window that launched it.
export async function stopComfy() {
  if (process.platform !== "win32") return false;
  const port = new URL(COMFY).port || "8188";
  const pid = Number(await ps(`(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`));
  if (!pid) return false;
  const parent = Number(await ps(`(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ParentProcessId`));
  const parentName = parent ? await ps(`(Get-Process -Id ${parent} -ErrorAction SilentlyContinue).ProcessName`) : "";
  const target = parentName === "cmd" ? parent : pid;
  await new Promise((ok) => execFile("taskkill.exe", ["/PID", String(target), "/T", "/F"], { windowsHide: true }, () => ok()));
  return true;
}

export function workerRunning() {
  try {
    const pid = Number(fs.readFileSync(WORKER_PID, "utf8"));
    process.kill(pid, 0);
    return pid;
  } catch {
    return 0;
  }
}

// Starts the audio worker (start_audio_worker.bat) when it is not running. Windows only.
export function ensureWorker() {
  if (process.platform !== "win32" || process.env.MINIMAX_AUDIO_WORKER_AUTOSTART === "0") return "not managed here";
  if (workerRunning()) return "running";
  const bat = path.join(REPO, "start_audio_worker.bat");
  if (!fs.existsSync(bat)) return "start_audio_worker.bat not found";
  startMinimized("MiniMax audio worker", bat);
  return "started";
}

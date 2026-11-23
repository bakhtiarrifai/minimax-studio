// Runs started from an uploaded spec: "auto" produces the draft directly; "agent" first lets Claude Code check the facts
// against the hadith texts, then starts the auto run itself and reviews the result. One GPU run at a time.
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FINAL_DIR, PORT } from "./config.js";
import { DEFAULTS, episodeDirs, parseSpec, preview, runEpisode } from "./episode.js";
import { pathGuard, safeName } from "./security.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_LINES = 400;
const runs = new Map(); // id -> state (persisted to final/<id>/pipeline.json)
let gpuRun = null; // id of the auto run holding the GPU
let agentRun = null; // id of the running agent

const stateFile = (id) => path.join(episodeDirs(id).final, "pipeline.json");
const persist = (st) => fsp.writeFile(stateFile(st.id), JSON.stringify({ ...st, child: undefined }, null, 2)).catch(() => {});
const view = (st) => (st ? { ...st, child: undefined, stopRequested: undefined } : null);
const busy = (id, mode) => Object.assign(new Error(`${mode === "agent" ? "An agent" : "A production"} run is already going (${id}). Wait for it or stop it.`), { status: 409 });

export function parseUpload(markdown, settings) {
  const episodes = parseSpec(markdown);
  if (!episodes.length) throw Object.assign(new Error("No storyboard JSON with \"scenes\" was found in this file."), { status: 400 });
  return episodes.map((ep) => preview(ep, settings));
}

function newState(id, mode, settings) {
  const st = { id, mode, status: "running", startedAt: new Date().toISOString(), settings, log: [], warnings: [], output: null, error: null, agent: null };
  runs.set(id, st);
  return st;
}
const logTo = (st) => (line) => {
  st.log.push(line);
  if (st.log.length > LOG_LINES) st.log.splice(0, st.log.length - LOG_LINES);
  persist(st);
};

// body: { markdown | specPath, episodeId, mode: "auto" | "agent", settings }
export async function start(body) {
  let markdown = body.markdown;
  if (!markdown && body.specPath) {
    const file = pathGuard([FINAL_DIR])(body.specPath, { exts: [".md"] });
    if (!file) throw Object.assign(new Error("specPath must be a .md inside the final folder"), { status: 403 });
    markdown = await fsp.readFile(file, "utf8");
  }
  if (typeof markdown !== "string" || markdown.length > 512 * 1024) throw Object.assign(new Error("Upload a spec .md (at most 512 KB)"), { status: 400 });
  const episodes = parseSpec(markdown);
  const ep = episodes.find((e) => e.id === safeName(body.episodeId)) ?? (episodes.length === 1 ? episodes[0] : null);
  if (!ep) throw Object.assign(new Error(`Episode ${body.episodeId ?? "(none)"} is not in this spec. Found: ${episodes.map((e) => e.id).join(", ") || "none"}`), { status: 400 });
  const mode = body.mode === "agent" ? "agent" : "auto";
  const settings = sanitize(body.settings);

  // Refuse before anything runs: text-only shots drift and break the visual rules.
  const p = preview(ep, settings);
  if (p.keyframes < p.scenes && !settings.allowTextOnly) {
    throw Object.assign(new Error(`Only ${p.keyframes} of ${p.scenes} scenes have a keyframe in images/${ep.id}/ (frame-01.png …). Add them, or allow text-only shots.`), { status: 400 });
  }
  const dirs = episodeDirs(ep.id);
  await fsp.mkdir(dirs.final, { recursive: true });
  if (!body.specPath) await fsp.writeFile(path.join(dirs.final, "spec.md"), markdown);

  if (mode === "agent") {
    if (agentRun) throw busy(agentRun, "agent");
    if (gpuRun) throw busy(gpuRun);
    return view(startAgent(ep, settings));
  }
  if (gpuRun) throw busy(gpuRun);
  const st = newState(ep.id, "auto", settings);
  gpuRun = ep.id;
  const log = logTo(st);
  persist(st);
  runEpisode(ep, settings, { onLog: log, shouldStop: () => st.stopRequested })
    .then((r) => Object.assign(st, { status: "done", output: r.output, thumbnail: r.thumbnail, warnings: r.warnings }))
    .catch((err) => Object.assign(st, { status: err.stopped ? "stopped" : "failed", error: err.message }))
    .finally(() => {
      st.finishedAt = new Date().toISOString();
      gpuRun = null;
      log(`run ${st.status}${st.error ? ": " + st.error : ""}`);
    });
  return view(st);
}

function sanitize(raw = {}) {
  const n = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
  const size = /^(\d{3,4})x(\d{3,4})$/.exec(String(raw.resolution ?? `${raw.width ?? DEFAULTS.width}x${raw.height ?? DEFAULTS.height}`));
  return {
    width: size ? n(size[1], 256, 1344, DEFAULTS.width) : DEFAULTS.width,
    height: size ? n(size[2], 256, 1344, DEFAULTS.height) : DEFAULTS.height,
    frames: n(raw.frames, 25, 124, DEFAULTS.frames),
    steps: n(raw.steps, 8, 50, DEFAULTS.steps),
    shotsPerScene: n(raw.shotsPerScene, 1, 4, DEFAULTS.shotsPerScene),
    seed: raw.seed === null || raw.seed === "" || raw.seed === undefined ? null : n(raw.seed, 0, 2 ** 31, null),
    voice: /^[A-Za-z]{3,20}$/.test(raw.voice ?? "") ? raw.voice : DEFAULTS.voice,
    allowTextOnly: raw.allowTextOnly === true,
    narration: raw.narration === "chatterbox" ? "chatterbox" : "google",
  };
}

// ------------------------------------------------------------------ agent mode (Claude Code, headless)

function claudeBin() {
  if (process.env.MINIMAX_CLAUDE_BIN) return process.env.MINIMAX_CLAUDE_BIN;
  const local = path.join(os.homedir(), ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude");
  return fs.existsSync(local) ? local : "claude";
}

export function agentPrompt(ep, settings) {
  const dirs = episodeDirs(ep.id);
  const api = `http://127.0.0.1:${PORT}`;
  return [
    `You are producing episode ${ep.id} ("${ep.coverTitle}") of the Kisah Sahabat Cilik series on this server.`,
    `Rules: read CONTENT_PRODUCTION_SPEC.md and .claude/skills/sirah-shorts-production/SKILL.md first and follow them.`,
    `The uploaded spec is ${path.join(dirs.final, "spec.md")}. Work only in ${dirs.final} and the production folders.`,
    ``,
    `1. Fact check. Check the protagonist (is he/she really the child in the story, not only the narrator of the hadith?),`,
    `   every hadith number and every detail of the narration, subtitles and prompts against the hadith texts. sunnah.com`,
    `   refuses automated reads: use other collections such as en.tohed.com. Write your findings with links to`,
    `   ${path.join(dirs.final, "factcheck.md")}.`,
    `2. Write ${path.join(dirs.final, "spec.reviewed.md")}: the uploaded spec with only the corrections the texts require`,
    `   (narration, subtitles, prompts, sources). Keep its structure, storyboard JSON and episode ID.`,
    `3. If something cannot be fixed safely (the story itself is not supported), stop here and say why. Otherwise start`,
    `   the GPU run with exactly this command (it returns at once):`,
    `   curl -s -X POST ${api}/api/episodes/start -H 'content-type: application/json' -d '{"specPath":"${path.join(dirs.final, "spec.reviewed.md").replace(/\\/g, "/")}","episodeId":"${ep.id}","mode":"auto","settings":${JSON.stringify(settings)}}'`,
    `4. Wait for it with: curl -s '${api}/api/episodes/${ep.id}/wait?timeout=900' (repeat until status is not "running";`,
    `   rendering takes one to several hours).`,
    `5. Review the draft: ffmpeg -v error -y -i <draft> -vf "fps=1/2,scale=270:480,tile=6x3" -frames:v 1 ${path.join(dirs.final, "review.png")}`,
    `   then read that image and check every shot against the visual rules. Append a "Review by the agent" section to`,
    `   ${path.join(dirs.final, "PRODUCTION.md")} with what you checked, what is wrong, and what a person must still check`,
    `   (listening to the audio is always one of them).`,
    `Never spend money: no paid generation services. Do not edit anything outside ${dirs.final}.`,
  ].join("\n");
}

function startAgent(ep, settings) {
  const st = newState(ep.id, "agent", settings);
  agentRun = ep.id;
  const log = logTo(st);
  const tools = ["Read", "Write", "Edit", "Glob", "Grep", "WebSearch", "WebFetch", "Bash(curl:*)", "Bash(ffmpeg:*)", "Bash(ffprobe:*)", "Bash(ls:*)"];
  const args = ["-p", agentPrompt(ep, settings), "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits", "--allowedTools", tools.join(","), "--max-turns", "300"];
  const env = { ...process.env, PATH: `${path.join(os.homedir(), ".local", "bin")}${path.delimiter}${process.env.PATH ?? ""}` };
  const child = spawn(claudeBin(), args, { cwd: REPO, env, stdio: ["ignore", "pipe", "pipe"] });
  st.child = child;
  st.agent = { pid: child.pid, logFile: path.join(episodeDirs(ep.id).final, "agent.log") };
  const raw = fs.createWriteStream(st.agent.logFile, { flags: "a" });
  let buf = "";
  child.stdout.on("data", (chunk) => {
    raw.write(chunk);
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      for (const msg of summarize(line)) log(msg);
    }
  });
  child.stderr.on("data", (chunk) => raw.write(chunk));
  child.on("error", (err) => log("agent could not start: " + err.message));
  child.on("close", (code) => {
    raw.end();
    st.finishedAt = new Date().toISOString();
    st.status = st.stopRequested ? "stopped" : code === 0 ? "done" : "failed";
    if (code && !st.stopRequested) st.error = `Claude Code exited with code ${code}`;
    agentRun = null;
    log(`agent ${st.status}`);
  });
  log("agent started (Claude Code, headless)");
  return st;
}

// Short human-readable lines from Claude Code's stream-json output.
export function summarize(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return [];
  }
  const out = [];
  if (msg.type === "assistant") {
    for (const part of msg.message?.content ?? []) {
      if (part.type === "text" && part.text.trim()) out.push("agent: " + part.text.trim().slice(0, 600));
      if (part.type === "tool_use") {
        const detail = part.input?.command ?? part.input?.file_path ?? part.input?.url ?? part.input?.query ?? "";
        out.push(`agent → ${part.name}${detail ? ": " + String(detail).slice(0, 160) : ""}`);
      }
    }
  } else if (msg.type === "result") {
    out.push(`agent finished (${msg.subtype ?? "result"}${msg.num_turns ? `, ${msg.num_turns} turns` : ""})`);
  }
  return out;
}

// ------------------------------------------------------------------ queries

export async function list() {
  const out = [];
  if (fs.existsSync(FINAL_DIR)) {
    for (const ent of await fsp.readdir(FINAL_DIR, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const live = runs.get(ent.name);
      if (live) out.push(view(live));
      else if (fs.existsSync(stateFile(ent.name))) {
        try {
          const st = JSON.parse(await fsp.readFile(stateFile(ent.name), "utf8"));
          // A run that was "running" when the studio stopped did not finish.
          if (st.status === "running") st.status = "interrupted";
          out.push(st);
        } catch {}
      }
    }
  }
  return out.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

export async function get(id) {
  const key = safeName(id);
  return view(runs.get(key)) ?? (await list()).find((r) => r.id === key) ?? null;
}

// Long poll for the agent: returns when the run is no longer running, or after `timeout` seconds.
export async function wait(id, timeout = 600) {
  const until = Date.now() + Math.min(Math.max(Number(timeout) || 600, 1), 1800) * 1000;
  for (;;) {
    const st = runs.get(safeName(id));
    if (!st || st.status !== "running" || Date.now() > until) return get(id);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

export function stop(id) {
  const st = runs.get(safeName(id));
  if (!st || st.status !== "running") throw Object.assign(new Error("No running job for " + id), { status: 404 });
  st.stopRequested = true;
  if (st.child) st.child.kill("SIGTERM");
  return { stopping: true, note: st.mode === "auto" ? "Stops after the shot that is rendering now." : "The agent is stopped now." };
}

// ------------------------------------------------------------------ audio worker queue (the Windows PC pulls these)

// Requests written by runs with MINIMAX_AUDIO_FROM=worker whose audio has not been delivered yet.
export async function audioJobs() {
  const out = [];
  if (!fs.existsSync(FINAL_DIR)) return out;
  for (const ent of await fsp.readdir(FINAL_DIR, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const req = path.join(FINAL_DIR, ent.name, "audio_request.json");
    if (!fs.existsSync(req) || fs.existsSync(path.join(episodeDirs(ent.name).audio, "audio_done.json"))) continue;
    try {
      const job = JSON.parse(await fsp.readFile(req, "utf8"));
      out.push({ ...job, id: safeName(job.id ?? ent.name), audioDir: episodeDirs(ent.name).audio });
    } catch {}
  }
  return out.sort((a, b) => String(a.requestedAt).localeCompare(String(b.requestedAt)));
}

#!/usr/bin/env node
// Audio worker for the Windows PC (RTX 3060): picks up audio requests from the Ubuntu node over SSH, records the
// Indonesian narration (Google AI Studio TTS, voice from the request, normally Leda) and the backsound (Stable Audio Open
// on the local ComfyUI), and uploads both to GaiaNAS audio/<episode>/. The server renders the video meanwhile and
// assembles the episode as soon as audio_done.json appears.
//
//   node scripts/audio_worker.mjs                     keep polling (start_audio_worker.bat)
//   node scripts/audio_worker.mjs --once              handle what is waiting now, then exit
//   MINIMAX_REMOTE_HOST=bakhtiar-server-ts (default here) selects the server.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

process.env.MINIMAX_REMOTE_HOST ??= "bakhtiar-server-ts";
const { api, upload, writeRemote } = await import("../src/remote.js");
const { speak } = await import("../src/episode.js");
const { generateBgm, BGM_CREDIT } = await import("../src/bgm.js");
const { ensureComfy, stopComfy, WORKER_PID } = await import("../src/local_services.js");
// ComfyUI is started for a job and stopped again after this many idle minutes, if this worker started it.
const IDLE_MIN = Number(process.env.MINIMAX_COMFY_IDLE_MIN ?? 10);
let startedComfy = false;
let lastJobAt = 0;

const { values: a } = parseArgs({ options: { once: { type: "boolean", default: false }, interval: { type: "string", default: "30" } } });
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)}Z ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bgmWithRetry(job, file) {
  const state = await ensureComfy({ log });
  if (state === "started") startedComfy = true;
  else if (state !== "running") log(`  ComfyUI: ${state}`);
  // ComfyUI may still be loading; give it ten minutes before delivering the narration alone.
  for (let i = 0; i < 20; i++) {
    try {
      const r = await generateBgm({ seconds: Math.min(47, job.bgm?.seconds ?? 36), seed: job.bgm?.seed, prompt: job.bgm?.prompt ?? undefined, name: job.id });
      const out = file.replace(/\.\w+$/, r.ext);
      fs.writeFileSync(out, r.audio);
      return { file: out, seed: r.seed };
    } catch (err) {
      if (!/not reachable/.test(err.message) || i === 19) throw err;
      if (i === 0) log(`  ComfyUI is not running on this PC; waiting for it (start_comfyui_local.bat)`);
      await sleep(30_000);
    }
  }
}

async function handle(job) {
  if (!/^[A-Za-z0-9._-]+$/.test(job.id)) throw new Error(`Bad episode id ${job.id}`);
  log(`${job.id}: audio requested ${job.requestedAt}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `audio-${job.id}-`));
  const files = [];
  const warnings = [];
  try {
    if (job.narration) {
      const vo = path.join(dir, "vo_id.wav");
      log(`  narration: Google TTS ${job.voice ?? "Leda"} (${job.narration.split(/\s+/).length} words)`);
      await speak(job.narration, vo, { voice: job.voice ?? "Leda", style: job.narrateStyle ?? undefined });
      files.push(vo);
    } else warnings.push("The request had no narration text.");
    try {
      log("  backsound: Stable Audio Open on this PC");
      const b = await bgmWithRetry(job, path.join(dir, "bgm.flac"));
      files.push(b.file);
      log(`  backsound done (seed ${b.seed})`);
    } catch (err) {
      warnings.push(`No backsound: ${err.message}`);
      log(`  backsound failed: ${err.message}`);
    }
    await upload(files, job.audioDir);
    await writeRemote(path.posix.join(job.audioDir, "audio_done.json"), JSON.stringify({
      id: job.id, doneAt: new Date().toISOString(), host: os.hostname(), files: files.map((f) => path.basename(f)), warnings,
      credit: files.some((f) => /bgm\./.test(f)) ? BGM_CREDIT : undefined,
    }, null, 2));
    log(`${job.id}: delivered ${files.map((f) => path.basename(f)).join(", ")} to ${job.audioDir}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

fs.writeFileSync(WORKER_PID, String(process.pid));
log(`audio worker: polling ${process.env.MINIMAX_REMOTE_HOST} every ${a.interval} s${a.once ? " (once)" : ""}; ComfyUI starts on demand`);
for (;;) {
  try {
    const { jobs = [] } = await api("GET", "/api/audio-jobs");
    for (const job of jobs) {
      lastJobAt = Date.now();
      try {
        await handle(job);
      } catch (err) {
        log(`${job.id}: failed: ${err.message}`);
      }
    }
  } catch (err) {
    log(`cannot reach the studio: ${err.message}`);
  }
  if (startedComfy && Date.now() - lastJobAt > IDLE_MIN * 60_000) {
    log(`ComfyUI idle for ${IDLE_MIN} min: stopping it to free the GPU and memory`);
    await stopComfy();
    startedComfy = false;
  }
  if (a.once) break;
  await sleep(Number(a.interval) * 1000);
}

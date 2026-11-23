#!/usr/bin/env node
// MCP server "minimax-remote": drives the production pipeline on the Ubuntu node from Claude Code anywhere.
// On the server it calls the studio on loopback; elsewhere set MINIMAX_REMOTE_HOST to an SSH host of the server
// (Windows PC: bakhtiar-server-ts; Fedora laptop: whatever `ssh <name>` reaches the server).
//   claude mcp add --scope user minimax-remote -e MINIMAX_REMOTE_HOST=bakhtiar-server-ts -- node <repo>/src/remote_mcp.js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { api, remoteHost, upload } from "./remote.js";
import { ensureWorker } from "./local_services.js";

const ASSETS = process.env.MINIMAX_REMOTE_ASSETS || "/mnt/gaia/production_assets";
const server = new McpServer({ name: "minimax-remote", version: "0.1.0" });
const ok = (data) => ({ content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
const fail = (err) => ({ content: [{ type: "text", text: `Error: ${err.message}` }], isError: true });
const guard = (fn) => async (args) => {
  try {
    return ok(await fn(args));
  } catch (err) {
    return fail(err);
  }
};
const episodeId = z.string().regex(/^[A-Za-z0-9._-]+$/).describe("Episode ID from the spec, e.g. ep15_mahmud");
const settings = z
  .object({
    resolution: z.enum(["576x1024", "768x1344"]).optional(),
    frames: z.number().int().min(25).max(124).optional().describe("Frames per shot at 24 fps (49 ≈ 2 s, 97 ≈ 4 s, 124 ≈ 5.2 s)"),
    shotsPerScene: z.number().int().min(1).max(4).optional(),
    steps: z.number().int().min(8).max(50).optional(),
    seed: z.number().int().optional(),
    allowTextOnly: z.boolean().optional().describe("Render scenes that have no keyframe from text only (characters drift; adults' faces may appear)"),
  })
  .optional();
const readSpec = (p) => {
  const file = path.resolve(p);
  if (!file.endsWith(".md")) throw new Error("spec_path must be a .md file");
  return fs.readFileSync(file, "utf8");
};

server.registerTool(
  "studio_status",
  { description: "Where this MCP points, GPU/VRAM on the Ubuntu node, storage folders, running episode runs and pending audio requests for the Windows PC.", inputSchema: z.object({}) },
  guard(async () => {
    const [status, runs, audio] = await Promise.all([api("GET", "/api/status"), api("GET", "/api/episodes"), api("GET", "/api/audio-jobs")]);
    return { via: remoteHost() ? `ssh ${remoteHost()}` : "loopback (on the server)", gpu: status.gpu, storage: status.storage, running: runs.runs.filter((r) => r.status === "running").map((r) => `${r.id} (${r.mode})`), audioRequests: audio.jobs.map((j) => j.id) };
  }),
);

server.registerTool(
  "episode_preview",
  { description: "Parse a local episode spec .md and show, per episode, the shot list, keyframes found on the NAS, narration and subtitles. Starts nothing.", inputSchema: z.object({ spec_path: z.string().describe("Path of the spec .md on this computer"), settings }) },
  guard(async ({ spec_path, settings: s }) => {
    const { episodes } = await api("POST", "/api/episodes/parse", { markdown: readSpec(spec_path), settings: s ?? {} });
    return episodes.map((e) => ({ id: e.id, title: e.coverTitle, sources: e.sources, scenes: e.scenes, keyframes: e.keyframes, shots: e.shots.length, notRendered: e.shots.filter((x) => !x.done).length, narration: e.narration, subtitles: e.subtitles, footageSeconds: e.footageSeconds, settings: e.settings }));
  }),
);

server.registerTool(
  "episode_start",
  {
    description:
      "Start producing one episode from a local spec .md on the Ubuntu node. mode 'auto': narration and backsound from the Windows PC audio worker, MiniMax H3 shots, 33 s draft in final/<episode>/. mode 'agent': Claude Code on the server checks the facts first, then runs 'auto' and reviews it. Uses the GPU for one to several hours; confirm with the user first.",
    inputSchema: z.object({ spec_path: z.string(), episode_id: episodeId, mode: z.enum(["auto", "agent"]).default("auto"), settings }),
  },
  guard(async ({ spec_path, episode_id, mode, settings: s }) => {
    const { run } = await api("POST", "/api/episodes/start", { markdown: readSpec(spec_path), episodeId: episode_id, mode, settings: s ?? {} });
    // Triggered from the Windows PC: make sure its audio worker is up (it starts ComfyUI itself when a job arrives).
    return { ...run, audioWorker: remoteHost() ? ensureWorker() : "not on this machine" };
  }),
);

server.registerTool(
  "episode_status",
  { description: "Status, recent log lines, warnings and output of an episode run.", inputSchema: z.object({ episode_id: episodeId }) },
  guard(async ({ episode_id }) => {
    const { run } = await api("GET", `/api/episodes/${episode_id}`);
    return { ...run, log: run.log?.slice(-15) };
  }),
);

server.registerTool(
  "episode_wait",
  { description: "Wait up to timeout_seconds (max 240) for an episode run to stop running, then return its status. Call again while it is still running.", inputSchema: z.object({ episode_id: episodeId, timeout_seconds: z.number().int().min(10).max(240).default(240) }) },
  guard(async ({ episode_id, timeout_seconds }) => {
    const { run } = await api("GET", `/api/episodes/${episode_id}/wait?timeout=${timeout_seconds}`);
    return { status: run.status, log: run.log?.slice(-8), warnings: run.warnings, output: run.output, error: run.error };
  }),
);

server.registerTool(
  "episode_stop",
  { description: "Stop an episode run (an auto run stops after the shot that is rendering; an agent stops now).", inputSchema: z.object({ episode_id: episodeId }) },
  guard(async ({ episode_id }) => api("POST", `/api/episodes/${episode_id}/stop`, {})),
);

server.registerTool(
  "episodes_list",
  { description: "All episode runs on the server with their status and output.", inputSchema: z.object({}) },
  guard(async () => (await api("GET", "/api/episodes")).runs.map((r) => ({ id: r.id, mode: r.mode, status: r.status, startedAt: r.startedAt, finishedAt: r.finishedAt, output: r.output, error: r.error }))),
);

server.registerTool(
  "assets_list",
  { description: "Files on GaiaNAS production_assets: audio, images (keyframes, covers), videos (shots) and final (episodes).", inputSchema: z.object({ kind: z.enum(["audio", "images", "videos", "final"]).optional() }) },
  guard(async ({ kind }) => {
    const { assets } = await api("GET", "/api/assets");
    const pick = kind ? { [kind]: assets[kind] } : assets;
    return Object.fromEntries(Object.entries(pick).map(([k, v]) => [k, v.slice(0, 80).map((f) => `${f.name} (${(f.size / 1e6).toFixed(1)} MB)`)]));
  }),
);

server.registerTool(
  "assets_upload",
  {
    description: "Upload local keyframes/cover (kind 'images': name them frame-01.png, frame-02.png …, cover.png) or audio (kind 'audio': vo_id.wav, bgm.flac) to production_assets/<kind>/<episode>/ on the NAS.",
    inputSchema: z.object({ episode_id: episodeId, kind: z.enum(["images", "audio"]), files: z.array(z.string()).min(1).max(30) }),
  },
  guard(async ({ episode_id, kind, files }) => {
    const local = files.map((f) => path.resolve(f));
    for (const f of local) if (!fs.statSync(f).isFile()) throw new Error(`Not a file: ${f}`);
    return { uploaded: await upload(local, `${ASSETS}/${kind}/${episode_id}`) };
  }),
);

await server.connect(new StdioServerTransport());

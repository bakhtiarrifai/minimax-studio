import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { OUTPUT_DIR, FINAL_DIR, ASSETS_ROOT, ASSET_DIRS, COMFYUI_OUTPUT_DIR } from "./config.js";
import { getGpuStatus } from "./gpu_sync.js";
import { TECHNIQUES } from "./techniques.js";
import { generateVideo, uploadImageToComfy } from "./comfy_client.js";
import { concatenateClips, mixAudio } from "./cut.js";
import { authorized, pathGuard, safeName } from "./security.js";
import * as pipeline from "./pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_DIR = path.resolve(__dirname, "../studio");
const MAX_BODY = 1024 * 1024;

const VIDEO_EXT = [".mp4"];
const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp"];
const AUDIO_EXT = [".wav", ".mp3", ".m4a", ".flac", ".ogg"];
const MIME = {
  ".mp4": "video/mp4", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".flac": "audio/flac", ".ogg": "audio/ogg",
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
};

// In-memory jobs store
const jobs = new Map();

// `auth`: from loadAuth() in studio.js: Cloudflare Access, a Basic login, or null for a loopback-only studio.
export function createStudioServer({ auth = null } = {}) {
  // The only folders the file endpoints may read or write.
  const allowed = pathGuard([OUTPUT_DIR, FINAL_DIR, ASSETS_ROOT, COMFYUI_OUTPUT_DIR]);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://studio");
    const pathname = url.pathname;

    const json = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    // No CORS: the UI is served from this same origin, and other sites must not drive the GPU.
    if (!(await authorized(req, auth))) {
      if (auth.type === "access") {
        res.writeHead(403, { "Content-Type": "text/plain" });
        return res.end("Open the studio through its Cloudflare Access address and log in there.");
      }
      res.writeHead(401, { "WWW-Authenticate": 'Basic realm="MiniMax Studio", charset="UTF-8"', "Content-Type": "text/plain" });
      return res.end("Login required");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    try {
      // 1. API: System, GPU and storage status
      if (pathname === "/api/status" && req.method === "GET") {
        const gpu = await getGpuStatus();
        return json(200, {
          server: "MiniMax H3 Local Studio",
          status: "online",
          gpu,
          activeJobs: Array.from(jobs.values()).filter((j) => j.status === "running").length,
          storage: { assetsRoot: ASSETS_ROOT, outputDir: OUTPUT_DIR, finalDir: FINAL_DIR },
        });
      }

      // 2. API: Techniques catalogue
      if (pathname === "/api/techniques" && req.method === "GET") {
        return json(200, { techniques: TECHNIQUES });
      }

      // 3. API: Queue video generation
      if (pathname === "/api/generate" && req.method === "POST") {
        const body = await parseJsonBody(req);
        if (typeof body.prompt !== "string" || !body.prompt.trim()) return json(400, { error: "A prompt is required" });
        const params = { ...body, projectName: safeName(body.projectName) };
        // Keyframes picked from the shared images folder are uploaded to ComfyUI first.
        for (const [key, target] of [["firstFramePath", "firstFrameImage"], ["lastFramePath", "lastFrameImage"]]) {
          delete params[key];
          if (!body[key]) continue;
          const file = allowed(body[key], { exts: IMAGE_EXT });
          if (!file) return json(403, { error: `${key} must be an image inside the production folders` });
          params[target] = await uploadImageToComfy(await fsp.readFile(file), path.basename(file));
        }
        const jobId = crypto.randomUUID();
        const job = {
          id: jobId,
          status: "running",
          progress: 0,
          stage: "queued",
          message: "Job queued",
          params,
          createdAt: new Date().toISOString(),
          result: null,
          error: null,
        };
        jobs.set(jobId, job);

        // Run generation asynchronously
        (async () => {
          try {
            const result = await generateVideo({
              ...params,
              onProgress: (prog) => {
                job.progress = prog.percent ?? job.progress;
                job.stage = prog.stage ?? job.stage;
                job.message = prog.message ?? job.message;
              },
            });
            job.status = "completed";
            job.progress = 100;
            job.result = result;
          } catch (err) {
            job.status = "failed";
            job.error = err.message || String(err);
          }
        })();

        return json(202, { success: true, jobId, message: "Generation started." });
      }

      // 4. API: Get all jobs
      if (pathname === "/api/jobs" && req.method === "GET") {
        return json(200, { jobs: Array.from(jobs.values()) });
      }

      // 5. API: Get single job status
      if (pathname.startsWith("/api/jobs/") && req.method === "GET") {
        const id = pathname.slice("/api/jobs/".length);
        const job = jobs.get(id);
        if (!job) return json(404, { error: "Job not found" });
        return json(200, { job });
      }

      // 6. API: Concat / Cut clips into the final folder
      if (pathname === "/api/cut" && req.method === "POST") {
        const body = await parseJsonBody(req);
        const { clips, outputPath, musicPath } = body;
        if (!Array.isArray(clips) || !clips.length) {
          return json(400, { error: "No clips provided" });
        }
        const files = clips.map((c) => allowed(c, { exts: VIDEO_EXT }));
        if (files.some((f) => !f)) return json(403, { error: "Every clip must be an .mp4 inside the production folders" });
        const music = musicPath ? allowed(musicPath, { exts: AUDIO_EXT }) : null;
        if (musicPath && !music) return json(403, { error: "musicPath must be an audio file inside the production folders" });
        const finalGuard = pathGuard([FINAL_DIR]);
        const out = outputPath ? finalGuard(outputPath, { exts: VIDEO_EXT, mustExist: false }) : path.join(FINAL_DIR, `film_${Date.now()}.mp4`);
        if (!out) return json(403, { error: `outputPath must be an .mp4 inside ${FINAL_DIR}` });
        await fsp.mkdir(path.dirname(out), { recursive: true });

        let finalPath = await concatenateClips(files, out);
        if (music) {
          const mixedPath = out.replace(/\.mp4$/, "_mixed.mp4");
          finalPath = await mixAudio(finalPath, music, mixedPath);
        }
        return json(200, { success: true, outputPath: finalPath });
      }

      // 7. API: Stream a video, image or audio file from the production folders
      if ((pathname === "/api/video" || pathname === "/api/thumbnail" || pathname === "/api/asset") && req.method === "GET") {
        const exts = { "/api/video": VIDEO_EXT, "/api/thumbnail": IMAGE_EXT, "/api/asset": [...IMAGE_EXT, ...AUDIO_EXT, ...VIDEO_EXT] }[pathname];
        const filePath = allowed(url.searchParams.get("path"), { exts });
        if (!filePath) return json(404, { error: "File not found" });
        return streamFile(req, res, filePath);
      }

      // 7.1 API: List generated scenes & videos
      if (pathname === "/api/scenes" && req.method === "GET") {
        const scenes = [];
        const seen = new Set();
        for (const dir of [OUTPUT_DIR, FINAL_DIR]) {
          for (const full of await listFiles(dir, VIDEO_EXT, true)) {
            if (seen.has(full)) continue;
            seen.add(full);
            const stat = fs.statSync(full);
            const thumbPath = full.replace(/\.mp4$/, "_thumbnail.png");
            const hasThumbnail = fs.existsSync(thumbPath);
            scenes.push({ filename: path.basename(full), path: full, size: stat.size, mtime: stat.mtime, hasThumbnail, thumbnailPath: hasThumbnail ? thumbPath : null });
          }
        }
        scenes.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
        return json(200, { scenes });
      }

      // 7.3 API: Shared production assets (audio from the Windows node, keyframes, final episodes)
      if (pathname === "/api/assets" && req.method === "GET") {
        if (!ASSET_DIRS) return json(200, { configured: false, assets: {} });
        const kinds = { audio: AUDIO_EXT, images: IMAGE_EXT, videos: VIDEO_EXT, final: VIDEO_EXT };
        const assets = {};
        for (const [kind, exts] of Object.entries(kinds)) {
          const files = await listFiles(ASSET_DIRS[kind], exts, true);
          assets[kind] = files
            .map((full) => {
              const stat = fs.statSync(full);
              return { name: path.relative(ASSET_DIRS[kind], full).split(path.sep).join("/"), path: full, size: stat.size, mtime: stat.mtime };
            })
            .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
        }
        return json(200, { configured: true, root: ASSETS_ROOT, assets });
      }

      // 7.4 API: Episode from an uploaded spec .md (preview, start auto/agent, status, wait, stop)
      if (pathname === "/api/episodes/parse" && req.method === "POST") {
        const body = await parseJsonBody(req, 600 * 1024);
        return json(200, { episodes: pipeline.parseUpload(body.markdown ?? "", body.settings) });
      }
      if (pathname === "/api/episodes/start" && req.method === "POST") {
        return json(202, { run: await pipeline.start(await parseJsonBody(req, 600 * 1024)) });
      }
      if (pathname === "/api/episodes" && req.method === "GET") {
        return json(200, { runs: await pipeline.list() });
      }
      const ep = /^\/api\/episodes\/([A-Za-z0-9._-]+)(\/wait|\/stop)?$/.exec(pathname);
      if (ep) {
        if (!ep[2] && req.method === "GET") {
          const run = await pipeline.get(ep[1]);
          return run ? json(200, { run }) : json(404, { error: "No run for " + ep[1] });
        }
        if (ep[2] === "/wait" && req.method === "GET") return json(200, { run: await pipeline.wait(ep[1], url.searchParams.get("timeout")) });
        if (ep[2] === "/stop" && req.method === "POST") return json(200, pipeline.stop(ep[1]));
      }

      // 8. Serve static Web Studio UI
      const relPath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
      const fullPath = path.resolve(STUDIO_DIR, relPath);
      if (fullPath.startsWith(STUDIO_DIR + path.sep) && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        res.writeHead(200, { "Content-Type": MIME[path.extname(fullPath).toLowerCase()] || "application/octet-stream" });
        fs.createReadStream(fullPath).pipe(res);
        return;
      }

      json(404, { error: "Not found" });
    } catch (err) {
      json(err.status || 500, { error: err.message || "Internal server error" });
    }
  });

  return server;
}

function streamFile(req, res, filePath) {
  const stat = fs.statSync(filePath);
  const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
    let end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Content-Type": type });
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { "Content-Length": stat.size, "Content-Type": type, "Accept-Ranges": "bytes" });
  fs.createReadStream(filePath).pipe(res);
}

async function listFiles(dir, exts, recursive) {
  const out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  for (const ent of await fsp.readdir(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory() && recursive) out.push(...(await listFiles(full, exts, true)));
    else if (ent.isFile() && exts.includes(path.extname(ent.name).toLowerCase())) out.push(full);
  }
  return out;
}

function parseJsonBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > limit) {
        reject(Object.assign(new Error("Request body too large"), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(Object.assign(new Error("Invalid JSON body"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

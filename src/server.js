import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { PORT, OUTPUT_DIR } from "./config.js";
import { getGpuStatus } from "./gpu_sync.js";
import { TECHNIQUES } from "./techniques.js";
import { generateVideo, uploadImageToComfy } from "./comfy_client.js";
import { concatenateClips, mixAudio } from "./cut.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_DIR = path.resolve(__dirname, "../studio");

// In-memory jobs store
const jobs = new Map();

export function createStudioServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = url.pathname;

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Helper for JSON responses
    const json = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    try {
      // 1. API: System & GPU status
      if (pathname === "/api/status" && req.method === "GET") {
        const gpu = await getGpuStatus();
        return json(200, {
          server: "MiniMax H3 Local Studio",
          status: "online",
          gpu,
          activeJobs: Array.from(jobs.values()).filter((j) => j.status === "running").length,
        });
      }

      // 2. API: Techniques catalogue
      if (pathname === "/api/techniques" && req.method === "GET") {
        return json(200, { techniques: TECHNIQUES });
      }

      // 3. API: Queue video generation
      if (pathname === "/api/generate" && req.method === "POST") {
        const body = await parseJsonBody(req);
        const jobId = crypto.randomUUID();
        const job = {
          id: jobId,
          status: "running",
          progress: 0,
          stage: "queued",
          message: "Job queued",
          params: body,
          createdAt: new Date().toISOString(),
          result: null,
          error: null,
        };
        jobs.set(jobId, job);

        // Run generation asynchronously
        (async () => {
          try {
            const result = await generateVideo({
              ...body,
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

      // 6. API: Concat / Cut clips
      if (pathname === "/api/cut" && req.method === "POST") {
        const body = await parseJsonBody(req);
        const { clips, outputPath, musicPath } = body;
        if (!clips || !clips.length) {
          return json(400, { error: "No clips provided" });
        }
        const out = outputPath || path.join(OUTPUT_DIR, `film_${Date.now()}.mp4`);
        await fsp.mkdir(path.dirname(out), { recursive: true });

        let finalPath = await concatenateClips(clips, out);
        if (musicPath) {
          const mixedPath = out.replace(/\.mp4$/, "_mixed.mp4");
          finalPath = await mixAudio(finalPath, musicPath, mixedPath);
        }
        return json(200, { success: true, outputPath: finalPath });
      }

      // 7. API: Stream local video file
      if (pathname === "/api/video" && req.method === "GET") {
        const filePath = url.searchParams.get("path");
        if (!filePath || !fs.existsSync(filePath)) {
          return json(404, { error: "File not found" });
        }
        const stat = fs.statSync(filePath);
        const range = req.headers.range;

        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
          const chunksize = end - start + 1;
          const file = fs.createReadStream(filePath, { start, end });
          res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${stat.size}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunksize,
            "Content-Type": "video/mp4",
          });
          file.pipe(res);
        } else {
          res.writeHead(200, {
            "Content-Length": stat.size,
            "Content-Type": "video/mp4",
          });
          fs.createReadStream(filePath).pipe(res);
        }
        return;
      }

      // 8. Serve static Web Studio UI
      let relPath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
      const fullPath = path.resolve(STUDIO_DIR, relPath);

      if (fullPath.startsWith(STUDIO_DIR) && fs.existsSync(fullPath)) {
        const ext = path.extname(fullPath).toLowerCase();
        const mimeTypes = {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".png": "image/png",
          ".svg": "image/svg+xml",
        };
        res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
        fs.createReadStream(fullPath).pipe(res);
        return;
      }

      json(404, { error: "Not found" });
    } catch (err) {
      json(500, { error: err.message || "Internal server error" });
    }
  });

  return server;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

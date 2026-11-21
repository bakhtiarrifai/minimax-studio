#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import crypto from "node:crypto";
import path from "node:path";
import { getGpuStatus, prepareGpuForGeneration, releaseGpuVram } from "./gpu_sync.js";
import { generateVideo } from "./comfy_client.js";
import { TECHNIQUES } from "./techniques.js";
import { concatenateClips, mixAudio } from "./cut.js";
import { OUTPUT_DIR, DEFAULT_SETTINGS } from "./config.js";

const server = new McpServer({
  name: "minimax-studio",
  version: "0.1.0",
});

// Active in-memory jobs tracker
const activeJobs = new Map();

// Tool 1: h3_status
server.registerTool(
  "h3_status",
  {
    description: "Check GPU VRAM, running services (Ollama, ComfyUI), and MiniMax H3 model status. Call this to verify system readiness before generating.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const gpu = await getGpuStatus();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                service: "MiniMax H3 Local Studio",
                gpu,
                defaultSettings: DEFAULT_SETTINGS,
                activeJobs: Array.from(activeJobs.values()).map((j) => ({
                  id: j.id,
                  status: j.status,
                  progress: j.progress,
                  stage: j.stage,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: err.message }] };
    }
  }
);

// Tool 2: h3_generate
server.registerTool(
  "h3_generate",
  {
    description: "Queue a local MiniMax H3 Omni-Modal video and audio generation. Generates video with native synchronized sound. Returns a jobId; collect results with h3_wait.",
    inputSchema: z.object({
      prompt: z.string().describe("Text prompt describing the visual scene and accompanying audio"),
      techniques: z.array(z.string()).optional().describe("Optional technique keys from h3_techniques (e.g. ['dolly_in', 'golden_hour', 'audio_cinematic_orchestral'])"),
      width: z.number().optional().default(DEFAULT_SETTINGS.width).describe("Video width (e.g. 1344 or 1024)"),
      height: z.number().optional().default(DEFAULT_SETTINGS.height).describe("Video height (e.g. 768 or 576)"),
      frames: z.number().optional().default(DEFAULT_SETTINGS.frames).describe("Frame count at 24fps: 49 (~2s), 73 (~3s), 97 (~4s), 124 (~5s)"),
      steps: z.number().optional().default(DEFAULT_SETTINGS.steps).describe("Sampling steps (default 25)"),
      seed: z.number().optional().describe("Optional fixed seed for reproducibility"),
      first_frame_path: z.string().optional().describe("Optional path to first frame image (for Image-to-Video / FL2V)"),
      last_frame_path: z.string().optional().describe("Optional path to last frame image"),
      project_name: z.string().optional().default("default").describe("Project folder name in ~/minimax-studio-out/"),
    }),
  },
  async (args) => {
    try {
      const jobId = crypto.randomUUID();
      const job = {
        id: jobId,
        status: "running",
        progress: 0,
        stage: "queued",
        message: "Job queued",
        params: args,
        createdAt: new Date().toISOString(),
        result: null,
        error: null,
      };
      activeJobs.set(jobId, job);

      // Start generation asynchronously
      (async () => {
        try {
          const result = await generateVideo({
            prompt: args.prompt,
            techniques: args.techniques,
            width: args.width,
            height: args.height,
            frames: args.frames,
            steps: args.steps,
            seed: args.seed,
            projectName: args.project_name,
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

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                jobId,
                status: "running",
                message: "Generation started in local ComfyUI. Use h3_wait to monitor progress and receive the output video.",
                frames: args.frames,
                estimatedDuration: `${Math.round(((args.frames || 49) / 24) * 10) / 10}s`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: err.message }] };
    }
  }
);

// Tool 3: h3_wait
server.registerTool(
  "h3_wait",
  {
    description: "Wait for a running MiniMax H3 generation job to complete or report progress. Returns video file path when finished.",
    inputSchema: z.object({
      jobId: z.string().describe("The job ID returned by h3_generate"),
      timeout_seconds: z.number().optional().default(60).describe("Seconds to wait before returning current status (default 60)"),
    }),
  },
  async ({ jobId, timeout_seconds = 60 }) => {
    const job = activeJobs.get(jobId);
    if (!job) {
      return { isError: true, content: [{ type: "text", text: `Job ${jobId} not found.` }] };
    }

    const startTime = Date.now();
    const deadline = startTime + timeout_seconds * 1000;

    while (Date.now() < deadline) {
      if (job.status === "completed") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  finished: true,
                  status: "completed",
                  videoPath: job.result.videoPath,
                  prompt: job.result.prompt,
                  seed: job.result.seed,
                  duration: job.result.duration,
                  message: "Video and audio generated successfully!",
                },
                null,
                2
              ),
            },
          ],
        };
      }
      if (job.status === "failed") {
        return {
          isError: true,
          content: [{ type: "text", text: `Job failed: ${job.error}` }],
        };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              finished: false,
              status: job.status,
              progress: job.progress,
              stage: job.stage,
              message: job.message,
              note: "Job still running. Call h3_wait again to continue waiting.",
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 4: h3_cut
server.registerTool(
  "h3_cut",
  {
    description: "Join multiple video clips into a single finished MP4 movie using local FFmpeg, with optional background music / audio mix.",
    inputSchema: z.object({
      clip_paths: z.array(z.string()).describe("Array of video file paths to stitch in order"),
      output_filename: z.string().optional().describe("Optional output filename in output directory"),
      music_path: z.string().optional().describe("Optional background audio file to mix with scene audio"),
    }),
  },
  async ({ clip_paths, output_filename, music_path }) => {
    try {
      const outName = output_filename || `stitched_${Date.now()}.mp4`;
      const outPath = path.join(OUTPUT_DIR, outName);
      let finalPath = await concatenateClips(clip_paths, outPath);

      if (music_path) {
        const mixedPath = outPath.replace(/\.mp4$/, "_mixed.mp4");
        finalPath = await mixAudio(finalPath, music_path, mixedPath);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                outputPath: finalPath,
                clipCount: clip_paths.length,
                message: "Movie stitched successfully!",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: err.message }] };
    }
  }
);

// Tool 5: h3_techniques
server.registerTool(
  "h3_techniques",
  {
    description: "List all built-in cinematic techniques, camera motions, and audio styles optimized for MiniMax H3.",
    inputSchema: z.object({}),
  },
  async () => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(TECHNIQUES, null, 2),
        },
      ],
    };
  }
);

// Tool 6: h3_gpu_vacate
server.registerTool(
  "h3_gpu_vacate",
  {
    description: "Manually vacate Ollama or release ComfyUI VRAM to prevent memory conflicts.",
    inputSchema: z.object({
      target: z.enum(["ollama", "comfyui", "both"]).default("both").describe("Which service VRAM to vacate"),
    }),
  },
  async ({ target }) => {
    try {
      const actions = [];
      if (target === "ollama" || target === "both") {
        await prepareGpuForGeneration();
        actions.push("Vacated Ollama models from VRAM");
      }
      if (target === "comfyui" || target === "both") {
        await releaseGpuVram();
        actions.push("Released ComfyUI VRAM allocations");
      }
      const gpu = await getGpuStatus();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, actions, currentGpuStatus: gpu }, null, 2),
          },
        ],
      };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: err.message }] };
    }
  }
);

await server.connect(new StdioServerTransport());

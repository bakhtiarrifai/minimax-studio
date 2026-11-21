import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { COMFYUI_URL, COMFYUI_WS_URL, MODELS, DEFAULT_SETTINGS, OUTPUT_DIR } from "./config.js";
import { prepareGpuForGeneration, releaseGpuVram } from "./gpu_sync.js";
import { applyTechniques } from "./techniques.js";

/**
 * Builds the native ComfyUI MiniMax H3 execution graph.
 */
export function buildMiniMaxWorkflow({
  prompt,
  techniques = [],
  width = DEFAULT_SETTINGS.width,
  height = DEFAULT_SETTINGS.height,
  frames = DEFAULT_SETTINGS.frames,
  steps = DEFAULT_SETTINGS.steps,
  fps = DEFAULT_SETTINGS.fps,
  seed = null,
  firstFrameImage = null,
  lastFrameImage = null,
}) {
  const finalPrompt = applyTechniques(prompt, techniques);
  const actualSeed = seed !== null ? seed : Math.floor(Math.random() * 100000000000000);

  const workflow = {
    // 1. Diffusion Transformer (FP8 Scaled)
    "1": {
      inputs: {
        unet_name: MODELS.diffusion,
        weight_dtype: "default",
      },
      class_type: "UNETLoader",
      _meta: { title: "Load MiniMax H3 DiT" },
    },
    // 2. Text Encoder (Qwen3-VL 32B NVFP4, loaded on CPU to preserve 100% VRAM for DiT)
    "2": {
      inputs: {
        clip_name: MODELS.text_encoder,
        type: "minimax",
        device: "cpu",
      },
      class_type: "CLIPLoader",
      _meta: { title: "Load MiniMax Text Encoder (CPU)" },
    },
    // 3. Video VAE (FP16)
    "3": {
      inputs: {
        vae_name: MODELS.video_vae,
      },
      class_type: "VAELoader",
      _meta: { title: "Load Video VAE" },
    },
    // 4. Audio VAE (FP32)
    "4": {
      inputs: {
        vae_name: MODELS.audio_vae,
      },
      class_type: "VAELoader",
      _meta: { title: "Load Audio VAE" },
    },
    // 5. Conditioning & Latent initialization (Video + Audio)
    "5": {
      inputs: {
        clip: ["2", 0],
        vae: ["3", 0],
        prompt: finalPrompt,
        width: Number(width),
        height: Number(height),
        length: Number(frames),
      },
      class_type: "MiniMaxH3ImageToVideo",
      _meta: { title: "MiniMax H3 Text/Image to Video" },
    },
    // 6. Guider
    "6": {
      inputs: {
        model: ["1", 0],
        conditioning: ["5", 0],
      },
      class_type: "BasicGuider",
      _meta: { title: "Basic Guider" },
    },
    // 7. Sampler
    "7": {
      inputs: {
        sampler_name: "euler",
      },
      class_type: "KSamplerSelect",
      _meta: { title: "Select Euler Sampler" },
    },
    // 8. Scheduler
    "8": {
      inputs: {
        model: ["1", 0],
        scheduler: "normal",
        steps: Number(steps),
        denoise: 1.0,
      },
      class_type: "BasicScheduler",
      _meta: { title: "Scheduler" },
    },
    // 9. Noise generator
    "9": {
      inputs: {
        noise_seed: actualSeed,
      },
      class_type: "RandomNoise",
      _meta: { title: "Random Noise" },
    },
    // 10. Advanced Custom Sampler
    "10": {
      inputs: {
        noise: ["9", 0],
        guider: ["6", 0],
        sampler: ["7", 0],
        sigmas: ["8", 0],
        latent_image: ["5", 1],
      },
      class_type: "SamplerCustomAdvanced",
      _meta: { title: "MiniMax Sampling" },
    },
    // 11. Memory Guard: Unload DiT before VAE decode to protect 16 GB VRAM on ROCm
    "11": {
      inputs: {
        samples: ["10", 0],
        model: ["1", 0],
      },
      class_type: "ComfyUnloadModelForVAE",
      _meta: { title: "Unload DiT (Pre-VAE Memory Guard)" },
    },
    // 12. Video VAE Decode
    "12": {
      inputs: {
        samples: ["11", 0],
        vae: ["3", 0],
      },
      class_type: "VAEDecode",
      _meta: { title: "Decode Video Latents" },
    },
    // 13. Audio VAE Decode (Native Omni-Modal Audio!)
    "13": {
      inputs: {
        samples: ["11", 0],
        vae: ["4", 0],
      },
      class_type: "VAEDecodeAudio",
      _meta: { title: "Decode Audio Latents" },
    },
    // 14. Create Synchronized Video + Audio container
    "14": {
      inputs: {
        images: ["12", 0],
        audio: ["13", 0],
        fps: Number(fps),
      },
      class_type: "CreateVideo",
      _meta: { title: "Create Synchronized AV Stream" },
    },
    // 15. Export MP4 Video
    "15": {
      inputs: {
        video: ["14", 0],
        filename_prefix: "minimax_h3/shot",
        format: "auto",
      },
      class_type: "SaveVideo",
      _meta: { title: "Save MP4 Video" },
    },
  };

  // Optional first/last frame connections for I2V
  let nextNodeId = 16;
  if (firstFrameImage) {
    const id = String(nextNodeId++);
    workflow[id] = {
      inputs: { image: firstFrameImage, upload: "image" },
      class_type: "LoadImage",
      _meta: { title: "Load First Frame" },
    };
    workflow["5"].inputs.first_frame = [id, 0];
  }

  if (lastFrameImage) {
    const id = String(nextNodeId++);
    workflow[id] = {
      inputs: { image: lastFrameImage, upload: "image" },
      class_type: "LoadImage",
      _meta: { title: "Load Last Frame" },
    };
    workflow["5"].inputs.last_frame = [id, 0];
  }

  return { workflow, finalPrompt, seed: actualSeed };
}

/**
 * Uploads an image to ComfyUI for Image-to-Video generation.
 */
export async function uploadImageToComfy(imageBuffer, filename) {
  const formData = new FormData();
  formData.append("image", new Blob([imageBuffer]), filename);
  formData.append("overwrite", "true");

  const res = await fetch(`${COMFYUI_URL}/upload/image`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Failed to upload image to ComfyUI: ${res.statusText}`);
  }
  const data = await res.json();
  return data.name || filename;
}

/**
 * Executes a MiniMax H3 generation with live progress reporting over WebSocket.
 */
export async function generateVideo({
  prompt,
  techniques = [],
  width,
  height,
  frames,
  steps,
  fps,
  seed,
  firstFrameImage,
  lastFrameImage,
  projectName = "default",
  onProgress = () => {},
}) {
  // 1. Prepare GPU: Vacate Ollama models and clear VRAM
  onProgress({ stage: "preparing_gpu", percent: 0, message: "Coordinating GPU memory..." });
  await prepareGpuForGeneration();

  const clientId = crypto.randomUUID();
  const { workflow, finalPrompt, seed: actualSeed } = buildMiniMaxWorkflow({
    prompt,
    techniques,
    width,
    height,
    frames,
    steps,
    fps,
    seed,
    firstFrameImage,
    lastFrameImage,
  });

  // 2. Open WebSocket to ComfyUI for real-time progress
  const wsUrl = `${COMFYUI_WS_URL}?clientId=${clientId}`;
  const ws = new WebSocket(wsUrl);

  const resultPromise = new Promise((resolve, reject) => {
    let targetPromptId = null;
    let savedVideoFilename = null;
    let totalSteps = steps || DEFAULT_SETTINGS.steps;

    ws.onmessage = (event) => {
      try {
        if (typeof event.data !== "string") return;
        const msg = JSON.parse(event.data);

        if (msg.type === "progress") {
          const { value, max } = msg.data;
          totalSteps = max;
          const pct = Math.round((value / max) * 100);
          onProgress({
            stage: "sampling",
            percent: pct,
            step: value,
            maxSteps: max,
            message: `Sampling frame latents (${value}/${max})...`,
          });
        } else if (msg.type === "executing") {
          const node = msg.data.node;
          if (node === "5") {
            onProgress({ stage: "encoding", percent: 5, message: "Encoding prompt with Qwen3-VL 32B..." });
          } else if (node === "10") {
            onProgress({ stage: "sampling_start", percent: 10, message: "Starting diffusion transformer inference..." });
          } else if (node === "11") {
            onProgress({ stage: "unloading_dit", percent: 80, message: "Unloading DiT to protect 16 GB VRAM..." });
          } else if (node === "12") {
            onProgress({ stage: "decoding_video", percent: 85, message: "Decoding Video VAE..." });
          } else if (node === "13") {
            onProgress({ stage: "decoding_audio", percent: 92, message: "Decoding Omni-Modal Audio VAE..." });
          } else if (node === "14" || node === "15") {
            onProgress({ stage: "saving", percent: 96, message: "Saving synchronized MP4..." });
          } else if (node === null && targetPromptId && msg.data.prompt_id === targetPromptId) {
            // Execution complete
            resolve(savedVideoFilename);
          }
        } else if (msg.type === "executed") {
          if (msg.data.node === "15") {
            const item = msg.data.output?.videos?.[0] || msg.data.output?.images?.[0] || msg.data.output?.video?.[0];
            if (item) {
              const subfolder = item.subfolder || "";
              const fname = item.filename;
              savedVideoFilename = subfolder ? path.join(subfolder, fname) : fname;
            }
          }
        } else if (msg.type === "execution_error") {
          reject(new Error(`ComfyUI execution error: ${JSON.stringify(msg.data)}`));
        }
      } catch (err) {
        // Non-JSON message
      }
    };

    ws.onerror = (err) => reject(new Error(`WebSocket error: ${err.message}`));

    ws.onopen = async () => {
      try {
        onProgress({ stage: "submitting", percent: 1, message: "Submitting prompt to ComfyUI..." });
        const res = await fetch(`${COMFYUI_URL}/prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: workflow, client_id: clientId }),
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Failed to submit prompt: ${errText}`);
        }
        const data = await res.json();
        targetPromptId = data.prompt_id;
      } catch (err) {
        reject(err);
      }
    };
  });

  try {
    const videoFilename = await resultPromise;
    ws.close();

    // 3. Post-run: release ComfyUI VRAM
    await releaseGpuVram();

    // 4. Save video to user output project directory
    const projectDir = path.join(OUTPUT_DIR, projectName);
    await fs.mkdir(projectDir, { recursive: true });

    let finalFilePath = videoFilename;
    if (videoFilename) {
      const destPath = path.join(projectDir, path.basename(videoFilename));
      let fetched = false;

      // Method 1: Fetch directly from ComfyUI /view API (cross-platform, works on Windows, Linux, WSL, remote)
      try {
        const subfolder = path.dirname(videoFilename) === "." ? "" : path.dirname(videoFilename);
        const filename = path.basename(videoFilename);
        const viewUrl = `${COMFYUI_URL}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=output`;
        const res = await fetch(viewUrl, { signal: AbortSignal.timeout(30000) });
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          await fs.writeFile(destPath, buffer);
          finalFilePath = destPath;
          fetched = true;
        }
      } catch (err) {
        // Fallback to local file access
      }

      // Method 2: Fallback to filesystem copy if running on same machine
      if (!fetched) {
        const possibleDirs = [
          process.env.COMFYUI_OUTPUT_DIR,
          path.join(os.homedir(), "ComfyUI", "output"),
          "C:\\ComfyUI_windows_portable\\ComfyUI\\output",
          "D:\\ComfyUI_windows_portable\\ComfyUI\\output",
          "C:\\ComfyUI\\output",
          "/home/bakhtiarrifai/ComfyUI/output",
        ].filter(Boolean);

        for (const dir of possibleDirs) {
          const sourcePath = path.join(dir, videoFilename);
          try {
            await fs.copyFile(sourcePath, destPath);
            finalFilePath = destPath;
            fetched = true;
            break;
          } catch {}
        }
      }
    }

    onProgress({ stage: "completed", percent: 100, message: "Generation complete!" });

    return {
      success: true,
      videoPath: finalFilePath,
      prompt: finalPrompt,
      seed: actualSeed,
      frames,
      fps: fps || DEFAULT_SETTINGS.fps,
      duration: Math.round(((frames || DEFAULT_SETTINGS.frames) / (fps || DEFAULT_SETTINGS.fps)) * 10) / 10,
    };
  } catch (err) {
    ws.close();
    await releaseGpuVram();
    throw err;
  }
}

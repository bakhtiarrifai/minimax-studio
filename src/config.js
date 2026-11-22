import os from "node:os";
import path from "node:path";

export const PORT = Number(process.env.MINIMAX_STUDIO_PORT || 8795);
export const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";
export const COMFYUI_WS_URL = process.env.COMFYUI_WS_URL || "ws://127.0.0.1:8188/ws";
export const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";

// Shared production storage (GaiaNAS). On the Ubuntu server it is the local disk /mnt/gaia/production_assets; on the
// Windows PC the same share is mapped as Z:. Without it, everything stays in ~/minimax-studio-out as before.
export const ASSETS_ROOT = process.env.MINIMAX_ASSETS_ROOT ? path.resolve(process.env.MINIMAX_ASSETS_ROOT) : null;
export const ASSET_DIRS = ASSETS_ROOT
  ? {
      audio: path.join(ASSETS_ROOT, "audio"), // TTS, music, SFX from the Windows node
      images: path.join(ASSETS_ROOT, "images"), // keyframes and character references
      videos: path.join(ASSETS_ROOT, "videos"), // raw MiniMax H3 shots from the Ubuntu node
      final: path.join(ASSETS_ROOT, "final"), // finished episodes
    }
  : null;

export const OUTPUT_DIR = process.env.MINIMAX_STUDIO_OUT
  ? path.resolve(process.env.MINIMAX_STUDIO_OUT)
  : ASSET_DIRS?.videos ?? path.join(os.homedir(), "minimax-studio-out");
export const FINAL_DIR = process.env.MINIMAX_FINAL_DIR
  ? path.resolve(process.env.MINIMAX_FINAL_DIR)
  : ASSET_DIRS?.final ?? OUTPUT_DIR;
export const COMFYUI_OUTPUT_DIR = process.env.COMFYUI_OUTPUT_DIR ? path.resolve(process.env.COMFYUI_OUTPUT_DIR) : null;

export const MODELS = {
  diffusion: "minimax_h3_fl2va_pruned_fp8_scaled.safetensors",
  text_encoder: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
  video_vae: "minimax_h3_video_vae_fp16.safetensors",
  audio_vae: "minimax_h3_audio_vae_fp32.safetensors",
};

export const DEFAULT_SETTINGS = {
  width: 1344,
  height: 768,
  frames: 49, // 2 seconds at 24fps
  steps: 25,
  cfg: 5.0,
  shift: 5.0,
  fps: 24,
};

import os from "node:os";
import path from "node:path";

export const PORT = Number(process.env.MINIMAX_STUDIO_PORT || 8792);
export const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";
export const COMFYUI_WS_URL = process.env.COMFYUI_WS_URL || "ws://127.0.0.1:8188/ws";
export const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";

export const OUTPUT_DIR = process.env.MINIMAX_STUDIO_OUT || path.join(os.homedir(), "minimax-studio-out");

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

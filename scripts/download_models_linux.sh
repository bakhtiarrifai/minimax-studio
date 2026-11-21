#!/usr/bin/env bash
# MiniMax H3 Model Downloader for Linux / AMD ROCm
# Downloads the 4 quantized models from Comfy-Org/MiniMax-H3 using huggingface-cli

set -euo pipefail

COMFY_DIR="${1:-/home/bakhtiarrifai/ComfyUI}"
MODELS_DIR="$COMFY_DIR/models"
REPO="Comfy-Org/MiniMax-H3"

HF_BIN="hf"
if [ -x "$COMFY_DIR/comfyui-venv/bin/hf" ]; then
  HF_BIN="$COMFY_DIR/comfyui-venv/bin/hf"
fi

echo "========================================================"
echo "🎬 MiniMax H3 Downloader for Linux (AMD ROCm / Server)"
echo "Target Models Directory: $MODELS_DIR"
echo "========================================================"

mkdir -p "$MODELS_DIR/diffusion_models" "$MODELS_DIR/text_encoders" "$MODELS_DIR/vae"

echo "[1/4] Verifying Audio VAE (~0.6 GB)..."
$HF_BIN download "$REPO" vae/minimax_h3_audio_vae_fp32.safetensors --local-dir "$MODELS_DIR"

echo "[2/4] Downloading Video VAE (~4.9 GB)..."
$HF_BIN download "$REPO" vae/minimax_h3_video_vae_fp16.safetensors --local-dir "$MODELS_DIR"

echo "[3/4] Downloading Text Encoder (~15 GB)..."
$HF_BIN download "$REPO" text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors --local-dir "$MODELS_DIR"

echo "[4/4] Downloading DiT Model (~20 GB)..."
$HF_BIN download "$REPO" diffusion_models/minimax_h3_fl2va_pruned_fp8_scaled.safetensors --local-dir "$MODELS_DIR"

echo "========================================================"
echo "🎉 All MiniMax H3 models successfully downloaded!"
echo "========================================================"

#!/usr/bin/env python3
"""
MiniMax H3 Models Downloader
Downloads the quantized MiniMax H3 models from Hugging Face Hub (Comfy-Org/MiniMax-H3)
directly into your ComfyUI models directories on Windows or Linux.
"""

import os
import sys
import argparse
from pathlib import Path

REPO_ID = "Comfy-Org/MiniMax-H3"

MODELS = [
    {
        "filename": "diffusion_models/minimax_h3_fl2va_pruned_fp8_scaled.safetensors",
        "desc": "MiniMax H3 DiT Model (FP8 Scaled, ~20 GB)",
    },
    {
        "filename": "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        "desc": "Qwen3-VL 32B Text Encoder (NVFP4 AWQ, ~15 GB)",
    },
    {
        "filename": "vae/minimax_h3_video_vae_fp16.safetensors",
        "desc": "MiniMax H3 Video VAE (FP16, ~4.9 GB)",
    },
    {
        "filename": "vae/minimax_h3_audio_vae_fp32.safetensors",
        "desc": "MiniMax H3 Audio VAE (FP32, ~578 MB)",
    },
]

def find_comfy_dir():
    candidates = [
        os.environ.get("COMFYUI_DIR"),
        str(Path.home() / "ComfyUI"),
        "C:\\ComfyUI_windows_portable\\ComfyUI",
        "D:\\ComfyUI_windows_portable\\ComfyUI",
        "E:\\ComfyUI_windows_portable\\ComfyUI",
        "C:\\ComfyUI",
        "D:\\ComfyUI",
        str(Path(__file__).resolve().parent.parent.parent / "ComfyUI"),
    ]
    for c in candidates:
        if c and os.path.exists(c) and os.path.isdir(os.path.join(c, "models")):
            return Path(c)
    return None

def main():
    parser = argparse.ArgumentParser(description="Download MiniMax H3 models for ComfyUI")
    parser.add_argument(
        "--comfy-dir",
        type=str,
        default=None,
        help="Path to ComfyUI base directory (containing models/ folder)",
    )
    args = parser.parse_args()

    comfy_dir = Path(args.comfy_dir) if args.comfy_dir else find_comfy_dir()
    if not comfy_dir or not (comfy_dir / "models").exists():
        print("❌ Error: Could not automatically locate ComfyUI directory.")
        print("Please specify with: python scripts/download_models.py --comfy-dir /path/to/ComfyUI")
        sys.exit(1)

    models_dir = comfy_dir / "models"
    print("=" * 65)
    print("🎬 MiniMax H3 Model Downloader")
    print(f"Target ComfyUI models directory: {models_dir}")
    print("=" * 65)

    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        print("Installing huggingface_hub...")
        os.system(f'"{sys.executable}" -m pip install --upgrade huggingface_hub --break-system-packages 2>nul || "{sys.executable}" -m pip install huggingface_hub')
        from huggingface_hub import hf_hub_download

    for item in MODELS:
        filename = item["filename"]
        desc = item["desc"]
        target_path = models_dir / filename

        print(f"\n📦 Checking: {desc}")
        print(f"   Target: {target_path}")

        if target_path.exists() and target_path.stat().st_size > 100 * 1024 * 1024:
            size_gb = target_path.stat().st_size / (1024 ** 3)
            print(f"   ✅ Already downloaded ({size_gb:.2f} GB). Skipping.")
            continue

        target_path.parent.mkdir(parents=True, exist_ok=True)
        print("   ⏳ Downloading from HuggingFace (resume supported)...")

        hf_hub_download(
            repo_id=REPO_ID,
            filename=filename,
            local_dir=str(models_dir),
            local_dir_use_symlinks=False,
        )
        print("   ✅ Download complete!")

    print("\n" + "=" * 65)
    print("🎉 All 4 MiniMax H3 models are ready in your ComfyUI models folder!")
    print("=" * 65)

if __name__ == "__main__":
    main()

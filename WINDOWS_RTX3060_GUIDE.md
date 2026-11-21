# Panduan Menjalankan MiniMax H3 di Windows + NVIDIA GeForce RTX 3060 (12 GB VRAM)

Dokumen ini adalah panduan lengkap untuk menjalankan **MiniMax H3** (Omni-Modal Video + Audio) dan **MiniMax Studio Web UI** secara lokal di sistem operasi **Windows 10/11** menggunakan kartu grafis **NVIDIA GeForce RTX 3060 (12 GB VRAM)**.

---

## 🎯 Mengapa RTX 3060 12 GB Bisa Menjalankan MiniMax H3?

Model DiT MiniMax H3 berukuran **~20 GB (FP8)** dan Text Encoder Qwen3-VL 32B berukuran **~15 GB (NVFP4)**. Total model utuh melebihi 12 GB VRAM. Namun, dengan arsitektur optimasi yang kami buat di repo ini, RTX 3060 dapat menjalankannya dengan sangat stabil:

1. **Text Encoder di CPU (`device: "cpu"`):**
   Qwen3-VL 32B (15 GB) dioperasikan di System RAM (CPU) selama ~35-45 detik saat proses encoding prompt. Hal ini menghemat 15 GB VRAM sehingga **100% dari 12 GB VRAM GPU dialokasikan penuh untuk proses generasi video (DiT)**.
2. **Layer Streaming ComfyUI (`--lowvram`):**
   Dengan flag `--lowvram`, engine ComfyUI memuat bobot DiT secara bergantian (*layer-by-layer*) antara RAM dan VRAM tanpa melebihi batas 12 GB VRAM.
3. **Auto-Unload Model Sebelum VAE Decode (`ComfyUnloadModelForVAE`):**
   Node pengaman memori otomatis melepaskan DiT dari VRAM tepat sebelum Video VAE Decode bekerja. Ini memberikan ruang 12 GB penuh bagi VAE untuk mendekode piksel video dan gelombang audio.
4. **Multi-Service GPU Synchronization (`comfy_gpu_sync`):**
   Otomatis melepaskan model Ollama / ComfyUI saat idle agar tidak terjadi tabrakan VRAM.

---

## 📋 Spesifikasi Sistem yang Dibutuhkan

| Komponen | Spesifikasi Minimum | Spesifikasi Rekomendasi |
|---|---|---|
| **OS** | Windows 10/11 64-bit | Windows 11 64-bit |
| **GPU** | NVIDIA RTX 3060 12 GB (Driver 550+) | RTX 3060 12 GB / RTX 4070+ |
| **System RAM** | 32 GB RAM + 32 GB Virtual Memory (Pagefile) | 48 GB – 64 GB RAM DDR4/DDR5 |
| **Penyimpanan** | SSD dengan sisa kapasitas minimal 60 GB | NVMe SSD M.2 |
| **Software** | Node.js 18+ & Python 3.10-3.12 (atau ComfyUI Portable) | Node.js 20+ & ComfyUI Portable |

> [!IMPORTANT]
> **Krusial untuk RAM Sistem:** Karena Text Encoder 32B dimuat di RAM sistem (~15 GB), jika RAM fisik Anda 32 GB, **sangat disarankan mengaktifkan Windows Virtual Memory (Pagefile) minimal 32 GB di SSD** agar proses Windows tidak terkena OOM.

---

## 🚀 Langkah Instalasi Cepat (One-Click Setup)

### Langkah 1: Clone atau Download Repository
Buka PowerShell atau Command Prompt:
```cmd
git clone https://github.com/bakhtiarrifai/minimax-studio.git
cd minimax-studio
```

### Langkah 2: Jalankan Script Setup Windows
Klik dua kali file:
```cmd
setup_windows.bat
```
Script ini akan:
- Memeriksa instalasi Node.js & FFmpeg.
- Menjalankan `npm install`.
- Otomatis menyalin ekstensi penyeimbang GPU `custom_nodes/comfy_gpu_sync` ke folder ComfyUI Anda.

---

### Langkah 3: Download Model MiniMax H3 (~42 GB)
Jalankan script downloader otomatis dengan klik dua kali:
```cmd
download_models_windows.bat
```
Atau via terminal:
```cmd
python scripts\download_models.py --comfy-dir "C:\ComfyUI_windows_portable\ComfyUI"
```
Script ini akan mendownload 4 file yang diperlukan langsung ke folder model yang tepat:
1. `models/diffusion_models/minimax_h3_fl2va_pruned_fp8_scaled.safetensors` (~20 GB)
2. `models/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` (~15 GB)
3. `models/vae/minimax_h3_video_vae_fp16.safetensors` (~4.9 GB)
4. `models/vae/minimax_h3_audio_vae_fp32.safetensors` (~578 MB)

*(Download mendukung fitur resume jika koneksi terputus).*

---

### Langkah 4: Jalankan ComfyUI dengan Mode Low VRAM

Untuk RTX 3060 12 GB, jalankan ComfyUI dengan parameter `--lowvram`:

**Jika menggunakan ComfyUI Windows Portable:**
Buka folder `ComfyUI_windows_portable`, edit file `.bat` startup atau jalankan:
```cmd
.\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --lowvram --port 8188
```
*(Atau Anda bisa menggunakan file helper yang kami sediakan: `start_comfyui_rtx3060.bat`).*

---

### Langkah 5: Jalankan MiniMax Studio Web UI
Klik dua kali file:
```cmd
start_studio.bat
```
Browser Chrome Anda akan otomatis terbuka ke alamat:
👉 **http://127.0.0.1:8795**

---

## ⚙️ Pengaturan Rekomendasi di Studio Web UI (RTX 3060)

| Parameter | Rekomendasi Kualitas Tinggi | Rekomendasi Cepat (Fast Preview) |
|---|---|---|
| **Resolusi** | `768x1344` (9:16 Vertical / Shorts) | `576x1024` (9:16 Fast) |
| **Panjang Frame** | 49 frames (~2 detik @ 24fps) | 33 frames (~1.4 detik @ 24fps) |
| **Sampling Steps** | 20 steps | 15–18 steps |
| **Sampler** | Euler | Euler |
| **Scheduler** | Normal | Normal |

---

## ⏱️ Estimasi Waktu Generasi (Benchmark RTX 3060)

- **Tahap 1: Text Encoding (CPU):** ~35 – 45 detik (hanya berjalan sekali per prompt).
- **Tahap 2: Diffusion Sampling (GPU RTX 3060 12GB):** ~12 – 14 detik per step (~4 menit untuk 20 step).
- **Tahap 3: Video & Audio VAE Decode:** ~35 – 50 detik.
- **Total Waktu per Adegan:** ~5 menit per klip video (lengkap dengan suara audio bawaan).

---

## 🛠️ Pemecahan Masalah (Troubleshooting)

### 1. `CUDA out of memory` saat baru memulai
- **Penyebab:** Text encoder tidak berjalan di CPU, atau ada aplikasi lain (Ollama, game, browser hardware acceleration) yang memakan VRAM.
- **Solusi:** 
  1. Di Web Studio, klik tombol **"Vacate VRAM"** di pojok kanan atas untuk membersihkan Ollama/model lain.
  2. Pastikan ComfyUI dijalankan dengan parameter `--lowvram`.

### 2. Komputer freeze atau ComfyUI tertutup sendiri saat Encoding
- **Penyebab:** RAM sistem habis saat memuat Qwen3-VL 32B.
- **Solusi:** Perbesar **Windows Pagefile (Virtual Memory)**:
  - Buka *Settings* Windows -> *About* -> *Advanced system settings*.
  - Tab *Advanced* -> klik *Settings* di bawah Performance -> tab *Advanced* -> *Virtual Memory*.
  - Hilangkan centang "Automatically manage paging file size", pilih SSD tercepat Anda (misal drive `C:`), pilih *Custom size*, isi **Initial: 32768 MB**, **Maximum: 49152 MB**, lalu klik *Set* dan restart PC.

### 3. `FFmpeg failed` saat menyambung video
- **Solusi:** Install FFmpeg via Windows Package Manager:
  ```cmd
  winget install Gyan.FFmpeg
  ```
  Atau set path manual di environment variable: `set FFMPEG_PATH=C:\path\to\ffmpeg.exe`.

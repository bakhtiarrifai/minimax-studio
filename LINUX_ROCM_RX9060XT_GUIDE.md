# Panduan Setup MiniMax H3 di Linux Server (AMD Radeon RX 9060 XT 16GB VRAM & ROCm 7.2)

Dokumen ini mendokumentasikan konfigurasi lengkap hardware, environment ROCm, ComfyUI, dan optimasi memori untuk menjalankan **MiniMax H3** (Omni-Modal Video + Audio) di server lokal dengan kartu grafis **AMD Radeon RX 9060 XT (16 GB VRAM)**.

---

## 1. Spesifikasi Hardware & Environment Server

| Komponen | Spesifikasi | Keterangan |
| :--- | :--- | :--- |
| **GPU** | **AMD Radeon RX 9060 XT (16 GB VRAM)** | Arsitektur RDNA 4 (`gfx1200`), akselerasi native FP8 & INT8 |
| **Driver & Framework** | **ROCm 7.2 + PyTorch 2.14.0.dev20260618** | Terpasang di `/home/bakhtiarrifai/ComfyUI/comfyui-venv` |
| **CPU & RAM** | **Intel Core i5-14400F (16 threads) + 64 GB RAM** | Wajib untuk offload dinamis Qwen3-VL 32B & DiT buffer |
| **Penyimpanan** | **NVMe SSD (~330 GB Free)** | Kebutuhan 4 model MiniMax H3: ~42.4 GB |
| **ComfyUI Service** | `/home/bakhtiarrifai/ComfyUI` | Dikelola via systemd service `comfyui.service` |

---

## 2. Arsitektur Optimasi untuk 16 GB VRAM (AMD ROCm)

Pada kartu grafis 16 GB, memuat seluruh model (DiT 20 GB + Text Encoder 15 GB + VAE 5.5 GB) sekaligus akan langsung menyebabkan `hipErrorOutOfMemory` atau `hipErrorInvalidValue`.

Solusi teruji yang kami terapkan di server ini:

### A. Text Encoder di CPU (`device: "cpu"`)
- Bobot Qwen3-VL 32B NVFP4 berukuran 15 GB.
- Di dalam `CLIPLoader`, parameter diset ke `device: "cpu"`.
- Text encoding prompt diproses oleh CPU Core i5 (16 thread) dalam ~35–45 detik memakai ~15 GB RAM sistem.
- **Hasil:** 100% dari 16 GB VRAM GPU tetap bebas untuk model DiT 33.1B.

### B. Pre-VAE Memory Guard (`ComfyUnloadModelForVAE`)
- Masalah khas ROCm: Saat sampling selesai dan `VAEDecode` mulai mengalokasikan memori untuk decoding video (memerlukan ~4–5 GB), jika model DiT masih ada di VRAM, driver AMD akan melempar `hipErrorInvalidValue`.
- Node `ComfyUnloadModelForVAE` disisipkan di antara `SamplerCustomAdvanced` dan `VAEDecode`.
- Node ini secara otomatis memaksa model DiT keluar dari VRAM sebelum alokasi VAE dimulai, memastikan proses decode berjalan lancar.

### C. Multi-Service GPU Synchronization (`comfy_gpu_sync`)
- Ekstensi ComfyUI yang kami pasang di `custom_nodes/comfy_gpu_sync`.
- Otomatis memeriksa model Ollama yang aktif saat prompt ComfyUI masuk, lalu memanggil `POST /api/generate` dengan `keep_alive: 0` untuk mengosongkan VRAM.
- Setelah ComfyUI idle selama 60 detik, model ComfyUI otomatis di-unload kembali agar aplikasi lain (Telegram bot, Open WebUI) mendapatkan VRAM maksimal secara instan.

---

## 3. Model Quantized yang Digunakan (Comfy-Org/MiniMax-H3)

Keempat model tersimpan di direktori ComfyUI server:

1. **Diffusion Transformer (DiT):**  
   `/home/bakhtiarrifai/ComfyUI/models/diffusion_models/minimax_h3_fl2va_pruned_fp8_scaled.safetensors` (19.52 GB)
2. **Text Encoder (Qwen3-VL 32B):**  
   `/home/bakhtiarrifai/ComfyUI/models/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` (14.61 GB)
3. **Video VAE (FP16):**  
   `/home/bakhtiarrifai/ComfyUI/models/vae/minimax_h3_video_vae_fp16.safetensors` (4.85 GB)
4. **Audio VAE (FP32):**  
   `/home/bakhtiarrifai/ComfyUI/models/vae/minimax_h3_audio_vae_fp32.safetensors` (578 MB)

---

## 4. Cara Menjalankan di Server

### Menjalankan MiniMax Web Studio (Port 8795):
```bash
cd /home/bakhtiarrifai/projects/minimax-studio
npm run studio
```
Web Studio dapat diakses di:
- Lokal server: `http://127.0.0.1:8795`
- Akses LAN / Wi-Fi lokal: `http://192.168.50.195:8795`

### Menjalankan Produksi Episode Otomatis (Episode 13 Sahl bin Sa'd):
```bash
cd /home/bakhtiarrifai/projects/minimax-studio
node scripts/generate_full_episode_13.js
```
Script ini akan:
1. Menghasilkan Scene 1 s/d Scene 4 secara sekuensial (masing-masing 768x1344 @ 24fps 9:16).
2. Melakukan pembersihan memori dan jeda 5 detik antar-adegan untuk menghindari kernel RAM OOM.
3. Menggabungkan keempat adegan dengan FFmpeg menjadi `episode_13_sahl_bin_sa_d_full.mp4`.

---

## 5. Monitoring GPU di Terminal
Untuk memantau penggunaan VRAM, daya, dan komputasi GPU AMD Radeon RX 9060 XT secara real time:
```bash
watch -n 1 rocm-smi
```
Saat diffusion sampling berlangsung:
- Daya GPU: ~135W – 140W
- GPU Compute: 100%
- VRAM terpakai: ~95% – 98%
- Suhu: ~55°C – 67°C (sangat stabil)

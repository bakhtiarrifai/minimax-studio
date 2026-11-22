# Multi-Node ComfyUI Audio & Video Production Pipeline Specification

## 1. System Architecture & Hardware Topology

Pipeline ini membagi beban kerja produksi video berbasis **ComfyUI** ke dua PC berbeda melalui jaringan lokal (LAN) untuk mengoptimalkan kapasitas VRAM, kapasitas RAM fisik, dan kompatibilitas driver (CUDA vs. ROCm).

| Role | Node A: Audio & Keyframe Factory | Node B: Video & Native Audio Engine |
| :--- | :--- | :--- |
| **OS** | Windows 11 | Ubuntu 26.04 LTS |
| **CPU** | AMD Ryzen 5 7500F | Intel Core i5-14400F |
| **RAM** | 32 GB DDR5 (+ 32–48 GB NVMe Pagefile) | 64 GB DDR4 |
| **GPU** | NVIDIA RTX 3060 (12 GB VRAM / CUDA) | AMD Radeon RX 9060 XT (16 GB VRAM / ROCm) |
| **Primary Workload** | Bilingual TTS (ID/EN), Voice Cloning, BGM/SFX, Keyframe Reference | MiniMax H3 (`Ref2VA`), Lip-Sync, Video Rendering, Native Stereo SFX/BGM |

---

## 2. Node A Specification (Windows 11 — RTX 3060 12GB)

### 2.1 System Prerequisites (Environment PATH)
Sebelum instalasi *custom node* ComfyUI, agen/skrip wajib memastikan dependensi sistem berikut terpasang dan terdaftar di Windows `PATH`:
1. **eSpeak NG** (`.msi` installer) — *Wajib sebagai phonemizer untuk Kokoro-82M dan Piper TTS.*
2. **FFmpeg** (Windows build) — *Wajib untuk encoding/decoding `.wav` melalui node audio/VHS.*
3. **Virtual Memory (Pagefile)** — *Set minimal `32768 MB` – `49152 MB` pada SSD NVMe sebagai cadangan memori saat offloading model besar.*

### 2.2 ComfyUI Custom Nodes & Audio Models
Gunakan **ComfyUI Manager** untuk menginstal paket utama berikut:
* **Paket Utama:** `ComfyUI-TTS-Audio-Suite` (menggabungkan multi-engine TTS dalam satu ekosistem tanpa konflik dependensi).
* **Node Pendukung:** `ComfyUI-VideoHelperSuite` (VHS) dan `ComfyUI-KJNodes` (`Unload All Models`).

#### Model Voice & Narasi (Bilingual: Bahasa Indonesia & English)
| Engine / Model | Target Bahasa | Kegunaan Utama | Estimasi VRAM |
| :--- | :--- | :--- | :--- |
| **Fish Speech v1.5** | Multilingual (ID / EN) | Voice cloning karakter dari sampel audio bersih 5–10 detik; intonasi emosional & akting suara. | ~4 – 5 GB |
| **XTTS-v2 (Coqui)** | Multilingual (ID / EN) | Alternatif voice cloning stabil untuk menjaga konsistensi warna vokal satu karakter lintas episode. | ~3 – 4 GB |
| **Piper TTS (`id_ID`)** | Bahasa Indonesia | Narasi Bahasa Indonesia dengan artikulasi suku kata tajam agar `AudioVAE` MiniMax H3 akurat saat lip-sync. | < 1 GB |
| **Kokoro-82M (`en_US`/`en_GB`)** | English | Narasi atau dialog Bahasa Inggris kualitas studio dengan beban VRAM sangat rendah. | ~1.5 GB |

#### Model Backsound & SFX (Opsional / Standalone BGM)
* **Stable Audio Open 1.0 (FP16):** Menggunakan node bawaan ComfyUI (`EmptyLatentAudio` + `ConditioningStableAudio`) untuk BGM instrumental stereo 44.1kHz hingga 47 detik (~4.5 GB VRAM).
* **AudioLDM 2:** Opsional untuk SFX spesifik berdurasi pendek (5–10 detik, ~3.5 GB VRAM).

### 2.3 Output Standard (Node A)
* Format audio: **`.wav` (PCM 16-bit/24-bit, 32kHz atau 44.1kHz)**.
* Direktori output: `ComfyUI\output\audio\`
* Standar file referensi suara karakter: Simpan sampel `.wav` bersih berdurasi 6–10 detik tanpa *background noise* di `ComfyUI\input\voice_refs\`.

---

## 3. Node B Specification (Ubuntu 26.04 — RX 9060 XT 16GB)

### 3.1 Runtime & Launch Configuration
* **Backend:** PyTorch dengan dukungan ROCm (`gfx1200`).
* **Launch Command:**
  ```bash
  HSA_OVERRIDE_GFX_VERSION=12.0.0 python main.py --normalvram
# MiniMax Studio: Multi-Node Production & External Control Architecture

Dokumen ini menjelaskan arsitektur produksi konten terdistribusi yang menggabungkan PC Windows lokal, Server Ubuntu (ROCm), NAS (GaiaNAS) sebagai *shared storage*, serta mengekspos kontrol produksi ke internet secara aman melalui domain `minimax.upgradingu.com`.

## 1. Arsitektur Topologi Jaringan

```mermaid
graph TD
    subgraph "External (Internet)"
        A[Laptop/HP User] -->|HTTPS| B(minimax.upgradingu.com)
    end

    subgraph "Cloudflare / Gateway"
        B -->|Tunnels / Proxy| C[Nginx Proxy Manager / Cloudflare Tunnel]
    end

    subgraph "Local Network (Tailscale / LAN)"
        C -->|Port 8795| D[Ubuntu Server - Node B]
        
        subgraph "Storage Bridge"
            F[(GaiaNAS)]
        end
        
        D[Ubuntu Server (RX 9060 XT)] <-->|SMB/NFS (Mount)| F
        E[Windows PC (RTX 3060)] <-->|SMB (Drive Z:)| F
    end

    classDef server fill:#f9f,stroke:#333,stroke-width:2px;
    classDef storage fill:#ff9,stroke:#333,stroke-width:2px;
    class D,E server;
    class F storage;
```

## 2. Peran Masing-Masing Node

### A. GaiaNAS (The Central Bridge)
NAS bertindak sebagai jembatan penyimpanan dan *single source of truth*. Tidak ada file aset yang tersimpan eksklusif di satu PC.
*   **Share Path:** `\\IP_GAIANAS\production_assets` (SMB/NFS)
*   **Struktur Direktori:**
    *   `/production_assets/audio/` (TTS, BGM, SFX hasil dari Windows)
    *   `/production_assets/images/` (Keyframe, Referensi Karakter)
    *   `/production_assets/videos/` (Video mentah hasil MiniMax H3 dari Ubuntu)
    *   `/production_assets/final/` (Episode final yang sudah digabung)

### B. Node A: Windows 11 PC (Audio & Keyframe Factory)
*   **Akses Storage:** Mem-*mount* GaiaNAS sebagai Network Drive (misal: `Z:\`).
*   **Workload:** Menjalankan model TTS (Piper, Kokoro, Fish Speech) dan Stable Audio via ComfyUI CUDA.
*   **Output:** Secara default, *Custom Nodes* (Save Audio/Image) diarahkan untuk menyimpan hasilnya langsung ke Drive `Z:\audio\` dan `Z:\images\`.

### C. Node B: Ubuntu Server (Video Engine & Web Studio)
*   **Akses Storage:** Mem-*mount* GaiaNAS via NFS/SMB ke direktori `/mnt/gaianas/production_assets`.
*   **Workload:** Menjalankan **MiniMax H3** via ROCm dan menjalankan server **MiniMax Studio Web UI** (`npm run studio`).
*   **Output:** Menyimpan hasil generasi video `.mp4` langsung ke `/mnt/gaianas/production_assets/videos/`.

---

## 3. Konfigurasi Kontrol Eksternal (`minimax.upgradingu.com`)

Agar Anda dapat mengontrol produksi, memberikan *prompt*, dan melihat hasilnya dari mana saja (HP, laptop lain), Web UI MiniMax Studio di Ubuntu Server akan diekspos menggunakan Reverse Proxy dan domain.

### Langkah 1: Mount GaiaNAS di Ubuntu Server
Sebelum Web Studio berjalan, Ubuntu harus bisa mengakses NAS.
```bash
# Instal utilitas NFS/SMB
sudo apt install nfs-common cifs-utils -y

# Buat direktori mount
sudo mkdir -p /mnt/gaianas

# Mount GaiaNAS (Contoh SMB)
sudo mount -t cifs -o username=user_nas,password=pass_nas //IP_GAIANAS/production_assets /mnt/gaianas
```
*(Tambahkan ke `/etc/fstab` agar otomatis mount saat server restart).*

### Langkah 2: Menyesuaikan Path di MiniMax Studio
Di Ubuntu Server, edit file konfigurasi MiniMax Studio (misal `src/config.js` atau `.env`) agar path input dan output menunjuk ke NAS:
*   `AUDIO_INPUT_DIR = "/mnt/gaianas/audio"`
*   `VIDEO_OUTPUT_DIR = "/mnt/gaianas/videos"`
*   `FINAL_EPISODE_DIR = "/mnt/gaianas/final"`

### Langkah 3: Ekspos dengan Cloudflare Tunnels (Rekomendasi Paling Aman)
Karena ini panel kontrol VRAM dan GPU, keamanan sangat penting. Gunakan Cloudflare Zero Trust (Tunnels) tanpa harus membuka port router (Port Forwarding).

1. Buka [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2. Masuk ke **Networks -> Tunnels**, buat Tunnel baru (misal: `minimax-tunnel`).
3. Install agen *cloudflared* di Ubuntu Server sesuai perintah yang diberikan Cloudflare.
4. Pada tab **Public Hostname**, tambahkan:
   * **Subdomain:** `minimax`
   * **Domain:** `upgradingu.com`
   * **Service Type:** `HTTP`
   * **URL:** `localhost:8795` (Port default Web Studio)
5. **Keamanan (Penting):** Di menu **Access -> Applications**, buat aplikasi untuk `minimax.upgradingu.com` yang mewajibkan login dengan email Anda atau PIN (One-Time Password) agar orang lain di internet tidak bisa men-generate video di server Anda.

### Langkah 4 (Alternatif): Nginx Proxy Manager & CosmosHub Router
Jika Anda menggunakan Nginx Proxy Manager di jaringan CosmosHub router Anda:
1. Arahkan DNS `minimax.upgradingu.com` ke IP Publik Router Anda (via A Record atau DDNS).
2. Di Nginx Proxy Manager, buat Proxy Host baru:
   * **Domain:** `minimax.upgradingu.com`
   * **Forward Hostname / IP:** `IP_TAILSCALE_UBUNTU` atau `IP_LAN_UBUNTU`
   * **Forward Port:** `8795`
   * **Block Common Exploits:** Aktif
   * **SSL:** Request Let's Encrypt certificate (Aktifkan Force SSL).
   * **Custom Locations / Access List:** Sangat disarankan mengaktifkan Basic Auth (Username & Password) agar UI terlindungi.

---

## 3.5 Pembagian Peran (ditetapkan 23 November 2026)

| Peran | Mesin | Jalannya |
|---|---|---|
| **Video**: MiniMax H3 | bakhtiar-server (RX 9060 XT) | Web Studio `minimax-studio.service` + ComfyUI di server |
| **Audio**: narasi Leda + backsound Stable Audio Open | PC Windows (RTX 3060) | `start_comfyui_local.bat` + `start_audio_worker.bat` |
| **Penyimpanan** | GaiaNAS (`/mnt/gaia/production_assets`) | `audio/`, `images/`, `videos/`, `final/` |
| **Pemicu** | Browser, atau Claude Code di server / PC Windows / laptop Fedora | `minimax.upgradingu.com`, atau MCP `minimax-remote` |

Alur satu episode: pemicu → server menulis `final/<ep>/audio_request.json` dan langsung merender shot → audio worker
di PC mengambil permintaan itu lewat SSH, membuat `vo_id.wav` + `bgm.flac`, mengunggah ke `audio/<ep>/`, lalu menulis
`audio_done.json` → server merakit draf 33 detik (backsound ±30 % di bawah narasi, dengan ducking). **Server menunggu
PC**: kalau PC mati atau worker tidak jalan, run tertahan di "waiting for the PC audio worker" sampai PC menyala.
Env server: `MINIMAX_AUDIO_FROM=worker`.

### Memicu dari Claude Code

MCP `minimax-remote` (`src/remote_mcp.js`): `studio_status`, `episode_preview`, `episode_start` (mode `auto` / `agent`),
`episode_status`, `episode_wait`, `episode_stop`, `episodes_list`, `assets_list`, `assets_upload`. Di luar server
MCP ini bekerja lewat SSH ke alamat loopback studio, jadi kunci SSH adalah satu-satunya kredensial.

| Di mana | Pendaftaran (sekali) |
|---|---|
| Server | sudah terdaftar: `claude mcp add --scope user minimax-remote -- node ~/projects/minimax-studio/src/remote_mcp.js` |
| PC Windows | sudah terdaftar, dengan `-e MINIMAX_REMOTE_HOST=bakhtiar-server-ts` |
| Laptop Fedora | `git clone https://github.com/bakhtiarrifai/minimax-studio && cd minimax-studio && npm ci`, lalu `claude mcp add --scope user minimax-remote -e MINIMAX_REMOTE_HOST=<nama SSH server di laptop> -- node $PWD/src/remote_mcp.js` |

Contoh permintaan ke Claude: *"Pakai minimax-remote: preview spec ~/specs/ep15.md, unggah keyframe di ~/specs/ep15/
sebagai images, lalu mulai ep15_mahmud mode agent."*

### Audio worker di PC Windows (on-demand)

- **Worker** (`start_audio_worker.bat`, ringan: satu proses Node yang mengecek antrean server tiap 30 detik lewat
  SSH) harus menyala supaya PC bisa menerima pekerjaan. Kalau produksi dipicu dari **Claude Code di PC ini**
  (`episode_start` di `minimax-remote`), worker dinyalakan otomatis. Kalau dipicu dari **server, laptop Fedora,
  atau browser**, worker harus sudah jalan, karena server tidak bisa masuk ke PC ini. Nyalakan sekali saat mulai kerja,
  atau pasang di Task Scheduler saat login.
- **ComfyUI** (berat: GPU + RAM) **tidak perlu dinyalakan manual**: worker menjalankan `start_comfyui_local.bat`
  (atau `MINIMAX_COMFY_LAUNCHER`) saat ada pekerjaan audio, lalu mematikannya lagi setelah menganggur
  `MINIMAX_COMFY_IDLE_MIN` menit (bawaan 10). ComfyUI yang Anda nyalakan sendiri tidak ikut dimatikan.
- Narasi memakai key Google di `~/.flow-studio/gemini-key`. Model backsound: `checkpoints/stable-audio-open-1.0.safetensors`
  dan `text_encoders/t5_base.safetensors`. Backsound tersendiri: `node scripts/generate_bgm.mjs --out bgm.flac`.

**TTS lokal lain (bukan untuk seri berbahasa Indonesia):** Kokoro-82M (ONNX) di Python ComfyUI, berjalan di CPU
(±2,6 detik untuk 7 detik suara). Tidak ada suara bahasa Indonesia; tersedia Inggris (Amerika dan British), Jepang,
Mandarin, Spanyol, Prancis, Hindi, Italia, Portugis. Model di `ComfyUI/models/tts/kokoro/`; eSpeak NG 1.52 terpasang
di sistem. Contoh: `python -I scripts/kokoro_tts.py --voice af_heart --text "..." --out narasi_en.wav`
(`--list-voices` untuk daftar suara). Seri "Kisah Sahabat Cilik" tetap memakai Google TTS Leda.

**TTS bahasa Indonesia lokal (dipasang 23 Nov 2026 dari `pipeline_comfyui_multi_node_audio_video.md`, untuk dicoba;
seri tetap Leda):**

| Mesin | Cara pakai | Lisensi |
|---|---|---|
| Chatterbox-TTS-Indonesian (grandhigh), clone suara dari `ComfyUI/input/voice_refs/` | `node scripts/chatterbox_id.mjs --ref voice_refs/leda_ref.wav --text "..." --out x.wav` (lewat ComfyUI, node TTS-Audio-Suite `local:Indonesian`) | Apache-2.0; dataset FLEURS CC-BY-4.0 (atribusi) |
| Piper `id_ID-news_tts-medium` | `python -I scripts/tts_compare_id.py --engines piper --out <folder>` | Kode MIT, lisensi dataset suara tidak jelas |
| Meta MMS `mms-tts-ind` | `python -I scripts/tts_compare_id.py --engines mms --out <folder>` | CC-BY-NC-4.0: **bukan untuk konten yang dimonetisasi** |

Custom node ComfyUI yang ikut terpasang: TTS-Audio-Suite, VideoHelperSuite, KJNodes. Semua paket Python hanya
ditambah, tidak ada yang diubah (daftar sebelum: `C:\Projects\ComfyUI\pip-freeze-before-audio-nodes-20261123.txt`).

Lisensi Stable Audio Open (Stability AI Community License): gratis di bawah US$1 juta pendapatan per tahun. Penggunaan
komersial wajib mendaftar gratis di https://stability.ai/community-license dan mencantumkan "Powered by Stability AI"
(sudah ditulis otomatis di `PRODUCTION.md`).

---

## 4. Alur Kerja Produksi Jarak Jauh (Remote Workflow)

### 4.1 Satu episode dari file spec (.md)

Cara utama: upload **spec episode**, bukan dokumen ini. Spec episode berisi naskah, narasi, subtitle, judul cover, dan
storyboard JSON per scene. Contohnya `production/shorts/kisah_sahabat_cilik_spec_ep_9_12.md` (empat episode dalam
satu file) atau spec satu episode dari brief Gemini (`production/shorts/gemini_brief_sirah_next_episodes.md`).

1. Buka `https://minimax.upgradingu.com`, lalu login sekali lewat Cloudflare.
2. (Opsional) Kirim keyframe ke `images/<episode>/frame-01.png` … dan cover ke `images/<episode>/cover.png`
   (`scripts\sync_to_nas.ps1` dari Windows). Scene tanpa keyframe dirender dari teks saja.
3. Di panel **Episode dari Spec (.md)**: pilih file, pilih episode, atur resolusi / frame per shot / shot per scene,
   lalu periksa pratinjau (jumlah shot, keyframe, narasi, subtitle, perkiraan waktu GPU).
4. Pilih salah satu:
   - **▶ Mulai otomatis**: narasi Google TTS Leda → shot MiniMax H3 berurutan → cover + judul seri + subtitle →
     draf 33 detik `final/<episode>/<episode>_1080p_draft.mp4`, thumbnail, dan `PRODUCTION.md` berisi checklist.
     Cek fakta tetap dilakukan Anda.
   - **🤖 Mulai dengan agen Claude**: Claude Code di server mengecek fakta hadits dulu (`factcheck.md`), menulis
     `spec.reviewed.md`, lalu menjalankan mode otomatis dan menambahkan reviewnya ke `PRODUCTION.md`. Memakai kuota
     langganan Claude. Tidak memakai layanan berbayar lain.
5. Pantau log di panel yang sama, lalu putar draf dari browser. Satu run GPU berjalan pada satu waktu. Tombol Stop
   menghentikan run setelah shot yang sedang dirender. Run yang dijalankan ulang memakai lagi shot yang sudah ada.
6. Sebelum posting: jalankan checklist di `PRODUCTION.md` (`CONTENT_PRODUCTION_SPEC.md` bagian 6), terutama
   mendengarkan audionya.

### 4.2 Shot satuan

Untuk mencoba atau memperbaiki satu adegan: tulis prompt di **Scene Composer**, pilih gambar dari *Shared Assets*
sebagai frame pertama, render, lalu gabungkan dengan **Export Film**. Soundtrack bisa dipilih dari `audio/`. Semua
hasil tersimpan di NAS (`videos/` dan `final/`).

---

## 5. Status Implementasi (23 November 2026)

Kondisi nyata ternyata lebih sederhana dari rancangan di atas: **GaiaNAS adalah disk Ubuntu Server itu sendiri**
(`/dev/sda1` di `/mnt/gaia`, dibagikan lewat Samba sebagai `Gaia-NAS-All`). Jadi di Node B tidak perlu mount NFS/SMB
(Langkah 1 dilewati), dan `production_assets` ada di `/mnt/gaia/production_assets`.

| Bagian | Status | Detail |
|---|---|---|
| Folder produksi di NAS | ✅ | `/mnt/gaia/production_assets/{audio,images,videos,final}` |
| Web Studio di Node B | ✅ | Service `systemctl --user minimax-studio`, `127.0.0.1:8795`, env di `~/.config/minimax-studio/env` |
| Path studio → NAS (Langkah 2) | ✅ | `MINIMAX_ASSETS_ROOT=/mnt/gaia/production_assets`: shot ke `videos/`, export ke `final/`, panel "Shared Assets" membaca `audio/` dan `images/` |
| Keamanan studio | ✅ | Satu login saja: Cloudflare Access, seperti situs `*.upgradingu.com` lainnya. Studio tetap memeriksa token Access yang ditandatangani di setiap request; request lokal di server (`127.0.0.1`) tidak perlu token. Endpoint file dikunci ke folder produksi, tanpa CORS. Sebelumnya `/api/video` bisa membaca file apa pun di disk |
| MiniMax H3 di Node B (ROCm, RX 9060 XT) | ✅ | `comfyui.service` di `127.0.0.1:8188`, model lengkap, 4 shot sudah dirender 21 Nov (±9 menit per shot) |
| Node A → NAS | ✅ lewat SSH | Jalur yang dipilih: `scripts\sync_to_nas.ps1 -Episode <ep>` menyalin audio dan keyframe ke `audio/<ep>/` dan `images/<ep>/` (diuji dengan narasi + cover Ep13). Drive `Z:` opsional dan belum dipasang: Windows 11 mewajibkan SMB signing, sedangkan share hanya mengizinkan tamu |
| `minimax.upgradingu.com` (Langkah 3) | ✅ | Ingress di tunnel `screener` → `http://127.0.0.1:8795`, CNAME dibuat 23 Nov. Backup config: `~/.cloudflared/screener.yml.bak-20261123-minimax` |
| Cloudflare Access (Langkah 3.5) | ✅ | Subdomain langsung tercakup aplikasi Access `upgradingu` yang sama dengan `screener`/`godeye`/`gaianas` (login Google). Pastikan kebijakannya hanya mengizinkan email pribadi Anda |
| Nginx Proxy Manager (Langkah 4) | ✖ tidak dipakai | Cloudflare Tunnel sudah ada dan tidak perlu membuka port router |

### Verifikasi dan keputusan (23 November 2026)

- **Login**: diuji pemilik. `https://minimax.upgradingu.com` terbuka normal setelah satu kali login Cloudflare dengan
  email pribadi. Studio menolak (403) request tanpa token Access yang sah; request lokal di server tidak perlu token.
- **Render lewat studio di Node B**: 49 frame 576×1024 dengan audio selesai dalam 7,2 menit, tersimpan otomatis di
  `videos/pipeline_test_20261123/`.
- **Node A**: pemilik memilih sinkronisasi SSH (`scripts\sync_to_nas.ps1`). Drive `Z:` tidak dipakai. Kalau suatu saat
  diperlukan: sekali di server `sudo smbpasswd -a bakhtiarrifai`, lalu di Windows `scripts\map_nas_drive.bat`.
- **Git**: dikirim sebagai branch `feat/multi-node-production`. `main` sengaja belum diubah, atas keputusan pemilik.

### Spec produksi konten

Aturan konten (format seri, adab visual, cek fakta hadits, parameter H3, checklist) ada di `CONTENT_PRODUCTION_SPEC.md`,
disalin dari kit Shorts Flow Studio terbaru (`production/shorts/`).

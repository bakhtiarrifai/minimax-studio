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

## 4. Alur Kerja Produksi Jarak Jauh (Remote Workflow)

Setelah semuanya terhubung, alur kerja Anda dari luar rumah adalah sebagai berikut:

1. **Akses Studio:** Anda membuka `https://minimax.upgradingu.com` dari HP/Laptop.
2. **Audio Check:** Anda mengecek apakah file audio dari Node A (Windows) sudah ada. Karena Anda sudah mem-_mount_ NAS ke Web Studio, Web Studio akan menampilkan daftar audio di direktori `/mnt/gaianas/audio`.
3. **Mulai Render:** Anda memasukkan *prompt* teks dan memilih file referensi audio.
4. **Eksekusi:** Ubuntu Server akan membaca aset dari NAS, memproses video menggunakan GPU AMD, dan menyimpan video hasilnya kembali ke NAS (`/mnt/gaianas/videos`).
5. **Review Akhir:** Anda dapat memutar hasilnya langsung di *browser* (melalui Web Studio) atau memicu fungsi `h3_cut` untuk merender episode final. Hasil final bisa diakses atau diunduh dari NAS Anda kapan saja.
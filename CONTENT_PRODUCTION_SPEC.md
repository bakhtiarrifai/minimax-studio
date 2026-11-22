# Spesifikasi Produksi Konten: "Kisah Sahabat Cilik" di MiniMax Studio

Spec ini memakai aturan terakhir dari kit Shorts Flow Studio (`flow-studio` commit `e898f1e`, disalin ke
`production/shorts/`), ditambah pelajaran dari produksi Ep07, Ep10, Ep11, Ep13 dan Ep14 (November 2026), dan
disesuaikan untuk pipeline multi-node di `PRODUCTION_ARCHITECTURE.md`.

| Dokumen | Isi |
|---|---|
| `production/shorts/README.md` | Kit Shorts asli: urutan kerja, build, pelajaran Ep01–08 |
| `production/shorts/gemini_brief_sirah_next_episodes.md` | Brief untuk menulis spec episode baru |
| `production/shorts/kisah_sahabat_cilik_spec_ep_9_12.md` | Spec Ep09–12 yang sudah dikoreksi terhadap teks hadits |
| `.claude/skills/sirah-shorts-production/SKILL.md` | Urutan kerja untuk asisten (versi MiniMax) |

---

## 1. Format seri (tetap)

| Item | Nilai |
|---|---|
| Durasi | **33 detik**, 9:16, 1080×1920, 30 fps |
| Detik 0–1 | Cover dengan zoom pelan + judul Inggris (Comfortaa **700**, putih, baris terakhir kuning `#FFD64A`, outline cokelat tua). Masuk ke dalam 33 detik, tidak menambah waktu |
| Narasi | **Bahasa Indonesia**, Google TTS suara **Leda**, kecepatan asli. Kalau perlu dipercepat lebih dari **1,15x**, pendekkan naskah atau rekam ulang |
| Subtitle | **Bahasa Inggris**, dibakar ke video, **maksimal 2 baris** per cue, tulis "(PBUH)" bukan "ﷺ" |
| Thumbnail | Cover yang sama dengan judul. **Judul tidak boleh menutupi mata/wajah** (blok judul ≤ 21 % tinggi) |
| Caption | YouTube, IG/FB, TikTok, WhatsApp, Bahasa Indonesia + Inggris, sumber hadits, label "ilustrasi AI" |
| YouTube | Made for Kids: **jangan** ajak komentar atau tag di deskripsi YouTube (komentar mati otomatis) |

## 2. Aturan wajib: adab visual

- **Rasulullah ﷺ, para nabi, keluarga beliau dan sahabat senior tidak pernah digambarkan.** Kehadiran beliau = cahaya
  hangat dari luar frame, atau reaksi wajah si anak.
- Orang dewasa lain, **termasuk ayah si tokoh** (dia juga sahabat), hanya dari **belakang**: tidak ada wajah, profil,
  hidung, atau janggut. Ep10 masih menampilkan wajah sang ayah di detik 1–9; jangan diulang.
- **Tidak ada senjata atau kekerasan** (Ep07 versi lama memperlihatkan pedang).
- **Tidak ada tulisan Arab palsu** yang tampak seperti Al-Qur'an. Sembunyikan permukaan tulisan di prompt (Ep14
  sempat menampilkan buku dan papan berjalan, bukan papan kayu).
- **Latar sesuai zaman**: Madinah abad ke-7, rumah bata lumpur, pohon kurma, tikar anyaman. Hindari air mancur, lengkungan
  berukir, kisi jendela, dan lentera Ottoman (muncul di penutup Ep07 dan Ep13).
- Yang tampil penuh hanya tokoh anak (dan saudaranya kalau ceritanya tentang dua anak). Kostum konsisten antar shot.

## 3. Aturan wajib: fakta

1. **Siapa tokohnya, siapa periwayatnya.** Periwayat hadits belum tentu tokoh ceritanya. Ep13 v1 salah fatal: Sahl bin
   Sa'd adalah perawi, sedangkan anak penerima gelas tidak disebut namanya. Narasi orang pertama ("Namaku …") hanya
   boleh kalau tokoh itu sendiri yang meriwayatkan kisahnya.
2. **Cek setiap nomor hadits** terhadap teksnya. Contoh salah kutip: Ep13 menulis Bukhari 2453 (soal merampas tanah),
   yang benar 2451; Ep14 menulis 4996, yang benar 4995; Ep07 menyebut Mu'awwidz di Bukhari 3141, padahal 3141 menyebut
   dua Mu'adz.
3. **Jangan menambah detail di luar riwayat**: warna (Ep10: hitam bercorak hijau atau kuning, bukan garis merah),
   reaksi orang (Ep11: Umar *berharap* anaknya menjawab, bukan "bangga"), senyuman, tempat, atau "di depan semua orang"
   (Ep12). Ucapan Nabi ﷺ harus sesuai hadits, boleh diparafrasekan sederhana.
4. **Usia** hampir tidak pernah disebut di hadits: tulis sebagai ilustrasi ("±9 tahun, ilustrasi"), jangan sebagai fakta.
5. Tulis sumber dengan nomor, dan tandai bagian yang berasal dari syarah, bukan dari teks hadits.
6. sunnah.com menolak akses otomatis; untuk pengecekan pakai sumber lain (mis. tohed.com) dan minta tinjauan ustadz
   sebelum posting.

## 4. Pipeline MiniMax (multi-node)

Penyimpanan bersama: **GaiaNAS** `production_assets/` (di server: `/mnt/gaia/production_assets`, di Windows: `Z:\`).

| Tahap | Node | Alat | Output di NAS |
|---|---|---|---|
| 1. Naskah + sumber | — | brief Gemini → spec seperti `kisah_sahabat_cilik_spec_ep_9_12.md` | `final/<ep>/episode_<ep>.md` |
| 2. Keyframe + cover | A (Windows) atau Flow (still gratis) | 1 portrait karakter, 1 still per shot dengan portrait sebagai referensi | `images/<ep>/frame-0N.png`, `cover.png` |
| 3. Narasi | A (Windows) | `flow_narrate` Google TTS Leda (gratis) | `audio/<ep>/vo_id.wav` |
| 4. Shot video | B (Ubuntu, RX 9060 XT) atau A (RTX 3060) | MiniMax H3 lewat Web Studio / `h3_generate`, keyframe dari `images/` sebagai first frame | `videos/<ep>/shot-0N.mp4` |
| 5. Finishing | B atau A | `h3_cut` / ffmpeg: urutan shot, narasi, subtitle, cover + judul | `final/<ep>/<ep>_1080p.mp4` |
| 6. QA + rilis | — | checklist bagian 6 | `final/<ep>/PRODUCTION.md`, caption, thumbnail |

Parameter H3 yang sudah terbukti (Ep14, RTX 3060): **576×1024**, **18 langkah**, seed tetap per episode,
49 frame (~2 detik) ≈ 12 menit, 124 frame (~5,2 detik) ≈ 45–55 menit. Butuh 7–8 shot untuk 33 detik. Di server
(16 GB VRAM) 768×1344 bisa dicoba, tapi **uji satu shot dulu** dan catat waktunya sebelum mengantre sisanya.

Prompt: tulis "the animated character", bukan "the boy/girl", ulangi deskripsi kostum lengkap di setiap shot, dan
selalu pakai keyframe sebagai first frame. Prompt teks saja membuat karakter berubah antar shot.

## 5. Finishing

- Kit di `production/shorts/` membutuhkan `python3` (PIL) dan font Comfortaa. Di Windows pakai Python ComfyUI
  (`C:\Projects\ComfyUI\python_embeded\python.exe -I`) dan `title_bold.py` supaya judul tebal.
- `build_ep.sh` sekarang berhenti kalau narasi perlu dipercepat lebih dari 1,15x.
- Backsound: kit `backsound.py`, atau audio adegan H3 di ~30 % di bawah narasi (Ep14).
- Subtitle ffmpeg di Windows: Segoe UI, ukuran ~13, margin kiri/kanan kecil, cek tidak ada cue lebih dari 2 baris.
- Simpan setiap revisi dengan nama baru (`_v2`, `_v3`). Jangan menimpa hasil lama.

## 6. Checklist sebelum posting

- [ ] Tokoh, periwayat, nomor hadits, dan setiap detail cocok dengan teks hadits (bagian 3).
- [ ] Setiap shot dicek di ukuran yang terbaca: tidak ada wajah Nabi/sahabat senior/ayah, senjata, tulisan Arab palsu,
      atau latar yang salah zaman.
- [ ] Urutan shot sesuai kalimat narasi (Ep07 v1 menukar adegan 1 dan 2).
- [ ] `ffprobe`: 1080×1920, 30 fps, 33,0 detik, ada audio. `freezedetect` tanpa bagian macet.
- [ ] Subtitle maksimal 2 baris, judul tidak menutupi mata.
- [ ] **Audio didengarkan manusia**: pelafalan nama, shalawat, dan sinkron subtitle. Pengecekan otomatis tidak cukup.
- [ ] `PRODUCTION.md` mencatat file final, sumber, waktu render, dan keterbatasan yang tersisa.

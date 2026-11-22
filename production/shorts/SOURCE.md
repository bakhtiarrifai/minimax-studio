# Asal file di folder ini

Disalin dari `bakhtiarrifai/flow-studio`, commit `e898f1e` (2026-11-23, "Shorts kit: correct the Ep09-12 spec against
the hadith texts"), yaitu versi terakhir kit Shorts Flow Studio.

| File | Asal | Diubah di sini? |
|---|---|---|
| `README.md` | `kits/shorts/README.md` | Tidak |
| `gemini_brief_sirah_next_episodes.md` | `kits/shorts/` | Tidak |
| `kisah_sahabat_cilik_spec_ep_9_12.md` | `kits/shorts/` (sudah dikoreksi terhadap teks hadits) | Tidak |
| `title_overlay.py` | `kits/shorts/` | Tidak |
| `backsound.py` | `kits/shorts/` | Tidak |
| `build_ep.sh` | `kits/shorts/` | Ya: berhenti kalau narasi perlu dipercepat lebih dari 1,15x (`MAX_TEMPO`) |
| `flow-studio-SKILL.md` | `.claude/skills/sirah-shorts-production/SKILL.md` | Tidak (versi MiniMax ada di `.claude/skills/` repo ini) |
| `title_bold.py` | Baru, dari produksi Ep13 v2 | Membungkus `title_overlay.py` supaya Comfortaa tampil tebal (700) di Windows |

Aturan produksi versi MiniMax ada di `CONTENT_PRODUCTION_SPEC.md` di root repo. Kalau kit di flow-studio berubah, salin
ulang file yang tidak diubah dan catat commit-nya di sini.

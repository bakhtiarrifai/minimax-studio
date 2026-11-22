---
name: sirah-shorts-production
description: Plan and produce "Kisah Sahabat Cilik" (Sirah) or other character-consistent 9:16 Shorts with MiniMax Studio (local MiniMax H3 on ComfyUI) and the shared GaiaNAS production folders, using keyframe-anchored shots, Indonesian Leda narration, English burned-in subtitles and verified final media. Use when creating or revising an episode from a storyboard or production specification.
---

# Character-consistent Shorts production (MiniMax Studio)

Read `CONTENT_PRODUCTION_SPEC.md` and the episode's spec first, then call `h3_status`. Local H3 costs no credits but
holds the GPU for a long time (about 12 min for 49 frames and 45-55 min for 124 frames on the RTX 3060), so agree the
shot list and render time with the user before queueing a batch. Any Flow generation still needs explicit approval of
its credit cost.

## Before any render

1. Check the facts in the spec against the hadith texts: who the protagonist is (not the narrator of the hadith), every
   hadith number, and every detail (colours, reactions, places, ages). Fix the spec before recording or rendering.
2. Keep the visual rules: the Prophet, his family and senior companions (including the child's father) are never shown,
   adults only from behind, no weapons, no fake Arabic script, period-accurate 7th-century Medina settings.

## Production sequence

1. Save keyframes and the cover to `<assets>/images/<episode>/`, the narration to `<assets>/audio/<episode>/vo_id.wav`.
2. Create one portrait per recurring character and use it as the reference for every keyframe. Inspect each keyframe.
3. Generate each shot with its keyframe as the first frame (Web Studio "First frame", or `h3_generate` with an uploaded
   image). Say "the animated character" and restate the full costume in every prompt.
4. Render the first shot alone with a new resolution or frame count and check its duration and render time before
   queueing the rest. Wait with repeated `h3_wait` calls, not a shell loop.
5. Shots land in `<assets>/videos/<episode>/`; finished episodes go to `<assets>/final/<episode>/`.

## Narration and editing

- Narration at its natural speed. If it needs more than 1.15x to fit 33 s, shorten the script or re-record.
- Order shots to match the narration line by line. Keep ambience about 30 % under the narration.
- 1 s cover with the title inside the 33 s; title block within ~21 % of the height and never over the eyes.
- English subtitles, at most two lines per cue, "(PBUH)" instead of the ligature.
- Avoid cloned-frame holds; a zoom on a still is not animation. Save every revision under a new name.

## Verification before delivery

- Inspect every shot at readable size and a frame strip of the final video, including the ending.
- `ffprobe`: 1080x1920, 30 fps, 33.0 s, audio present. `ffmpeg -vf freezedetect=n=0.001:d=0.5 -an -f null -`.
- Automated checks do not replace listening: ask the user to listen for pronunciation and subtitle sync.
- Write `PRODUCTION.md` (final file, sources, render time, known limitations) and the captions next to the final video.

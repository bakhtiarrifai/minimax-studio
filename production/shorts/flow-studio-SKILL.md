---
name: sirah-shorts-production
description: Plan and produce Sirah or other character-consistent vertical Shorts in Flow Studio with pre-approved credits, keyframe-anchored video, per-scene narration, no frozen endings, and verified final media. Use when creating or revising episodes from a storyboard or production specification.
---

# Character-consistent Shorts production

Read the user's specification, then call `flow_status`. Do not generate paid media until the current quote, total estimate, model, and scope have explicit user approval.

## Production sequence

1. Save a storyboard per episode with script, aspect ratio, cast, scene prompts, frames, model, resolution, duration, and credit caps.
2. Create one clear portrait per recurring character and inspect it before proceeding.
3. Generate and inspect every keyframe with the chosen image model before paying for video.
4. When a keyframe exists, pass it as the video's `first_frame`. Reference images alone do not anchor a video's appearance. State character position and relative proportions explicitly.
5. For an unfamiliar model setting, generate only the first approved clip and verify its actual duration/resolution before queueing the rest.
6. If a generated clip fails to download, use `flow_download` by its title. Never regenerate solely to recover a download.

## Narration and editing

- Record and measure narration separately per scene. Start each track when its scene begins; do not overlap narration.
- Keep ambience low beneath narration, or duck/mute it while narration is active.
- Fit the edit to speech without truncating the final sentence. Use actual tempo filters when retiming audio; do not claim an unapplied adjustment.
- Avoid cloned-frame holds for storytelling. Retime original motion with `setpts`/`atempo`, or use enough footage. A digital zoom on a still is not continued character animation.
- Save each revision under a new name. Preserve paid source clips and the previous edit.

## Verification before delivery

- Inspect every keyframe and a final frame strip, including the ending and character proportions.
- Run `ffprobe` for audio/video streams, duration, dimensions, and frame rate.
- Run `ffmpeg -vf freezedetect=n=0.001:d=0.5 -an -f null -` on the final video and inspect all reported timestamps.
- Check narration boundaries for overlap or truncation. Automated duration checks do not replace listening to the final result.
- Record final file, actual credits, timing, inputs, and known limitations in the episode's `PRODUCTION.md`.

## Token-efficient execution

- Use the storyboard and tool results as the source of truth; do not reread entire source files to repeat routine operations.
- Wait with `flow_wait` and job IDs, inspect only newly completed frames, and batch scene edits when independent.
- Do not invoke a broad code review or additional agents for a routine production run.

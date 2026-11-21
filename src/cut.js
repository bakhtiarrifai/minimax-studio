import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import fssync from "node:fs";

/**
 * Finds the ffmpeg executable across Linux and Windows.
 */
function getFfmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;

  if (process.platform === "win32") {
    const candidates = [
      "ffmpeg",
      "C:\\ComfyUI_windows_portable\\python_embeded\\Scripts\\ffmpeg.exe",
      "D:\\ComfyUI_windows_portable\\python_embeded\\Scripts\\ffmpeg.exe",
      "C:\\ffmpeg\\bin\\ffmpeg.exe",
      "D:\\ffmpeg\\bin\\ffmpeg.exe",
    ];
    for (const c of candidates) {
      if (c === "ffmpeg" || fssync.existsSync(c)) return c;
    }
  }

  return "ffmpeg";
}

const FFMPEG_BIN = getFfmpegPath();

/**
 * Executes an FFmpeg command with promise wrapping.
 */
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG_BIN, args, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`FFmpeg failed (${FFMPEG_BIN}): ${stderr || err.message}`));
      }
      resolve({ stdout, stderr });
    });
  });
}

/**
 * Concatenates a list of video files seamlessly into one final MP4 movie.
 * Handles audio and video re-encoding or stream copying when parameters match.
 */
export async function concatenateClips(videoPaths, outputPath) {
  if (!videoPaths || videoPaths.length === 0) {
    throw new Error("No video clips provided for concatenation.");
  }
  if (videoPaths.length === 1) {
    await fs.copyFile(videoPaths[0], outputPath);
    return outputPath;
  }

  // Create temporary concat demuxer file
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "minimax-cut-"));
  const listFile = path.join(tmpDir, "concat.txt");
  
  // Format paths with forward slashes for FFmpeg concat demuxer (vital for Windows)
  const content = videoPaths
    .map((p) => `file '${path.resolve(p).replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
  await fs.writeFile(listFile, content, "utf-8");

  try {
    // Attempt fast copy concat first
    await runFfmpeg([
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-c", "copy",
      outputPath,
    ]);
  } catch (err) {
    // If streams differ in codec/timestamps, fallback to re-encoding concat filter
    const inputs = [];
    let filterStr = "";
    for (let i = 0; i < videoPaths.length; i++) {
      inputs.push("-i", videoPaths[i]);
      filterStr += `[${i}:v:0][${i}:a:0]`;
    }
    filterStr += `concat=n=${videoPaths.length}:v=1:a=1[outv][outa]`;

    await runFfmpeg([
      "-y",
      ...inputs,
      "-filter_complex", filterStr,
      "-map", "[outv]",
      "-map", "[outa]",
      "-c:v", "libx264",
      "-crf", "18",
      "-preset", "fast",
      "-c:a", "aac",
      "-b:a", "192k",
      outputPath,
    ]);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  return outputPath;
}

/**
 * Trims a video file between start and end seconds.
 */
export async function trimClip(inputPath, outputPath, startSec = 0, durationSec = null) {
  const args = ["-y", "-ss", String(startSec), "-i", inputPath];
  if (durationSec !== null) {
    args.push("-t", String(durationSec));
  }
  args.push("-c", "copy", outputPath);
  await runFfmpeg(args);
  return outputPath;
}

/**
 * Extracts a still frame / thumbnail from a video at a given timestamp.
 */
export async function extractFrame(videoPath, outputPath, atSecond = 0) {
  await runFfmpeg([
    "-y",
    "-ss", String(atSecond),
    "-i", videoPath,
    "-vframes", "1",
    "-q:v", "2",
    outputPath,
  ]);
  return outputPath;
}

/**
 * Adds or mixes an external audio track (music or voiceover) with video.
 */
export async function mixAudio(videoPath, audioPath, outputPath, { volumeVideo = 0.8, volumeAudio = 1.0 } = {}) {
  await runFfmpeg([
    "-y",
    "-i", videoPath,
    "-i", audioPath,
    "-filter_complex",
    `[0:a]volume=${volumeVideo}[a0];[1:a]volume=${volumeAudio}[a1];[a0][a1]amix=inputs=2:duration=first[aout]`,
    "-map", "0:v",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    outputPath,
  ]);
  return outputPath;
}

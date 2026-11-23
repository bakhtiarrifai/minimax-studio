// Episode from a spec .md: parse the production spec (storyboard JSON, narration, subtitles, cover title), then produce
// a 33 s draft on this node: narration (Google TTS) -> MiniMax H3 shots -> cover, title, subtitles -> final/<episode>/.
// Every step is resumable: files that already exist are reused, so a restarted run continues where it stopped.
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ASSET_DIRS, OUTPUT_DIR, FINAL_DIR } from "./config.js";
import { runFfmpeg } from "./cut.js";
import { safeName } from "./security.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILM = 33; // seconds, cover included
const COVER = 1;
const MAX_TEMPO = 1.15; // above this the narration sounds rushed (Ep13 v1 went out at 1.31x)
const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp"];

export const DEFAULTS = { width: 576, height: 1024, frames: 97, steps: 18, seed: null, shotsPerScene: 2, voice: "Leda", allowTextOnly: false };

// ------------------------------------------------------------------ parsing

const field = (text, label) => text.match(new RegExp(`\\*\\*${label}[^*]*\\*\\*\\s*(.+)`, "i"))?.[1].trim();
const codeBlocks = (text) => [...text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
const sectionAfter = (text, heading) => {
  const i = text.search(new RegExp(`^#{2,5}[^\\n]*${heading}`, "im"));
  if (i < 0) return "";
  const rest = text.slice(i);
  const body = rest.indexOf("\n") + 1;
  const next = body > 0 ? rest.slice(body).search(/^#{2,5} /m) : -1;
  return next < 0 ? rest : rest.slice(0, body + next);
};

// One spec file may hold several episodes ("### Episode 09: ..."), or be a single-episode file.
export function parseSpec(markdown) {
  const md = String(markdown).replace(/\r\n/g, "\n");
  const starts = [...md.matchAll(/^#{1,3} +Episode\s+\d+[^\n]*$/gim)].map((m) => m.index);
  const parts = starts.length ? starts.map((s, i) => md.slice(s, starts[i + 1] ?? md.length)) : [md];
  const episodes = [];
  for (const part of parts) {
    const board = codeBlocks(part)
      .map((b) => {
        try {
          return JSON.parse(b);
        } catch {
          return null;
        }
      })
      .find((j) => j && Array.isArray(j.scenes));
    if (!board) continue;
    const id = safeName(field(part, "Episode ID")?.replace(/`/g, "") || board.title || "episode");
    const narrationBlock = sectionAfter(part, "Narasi");
    const narration =
      narrationBlock.match(/^>\s*"([\s\S]*?)"\s*$/m)?.[1] ??
      narrationBlock.match(/^>\s*(.+)$/m)?.[1] ??
      board.script ??
      "";
    const srt = codeBlocks(sectionAfter(part, "Subtitle")).find((b) => /-->/.test(b)) ?? null;
    episodes.push({
      id,
      heading: part.match(/^#{1,3} +([^\n]+)/)?.[1]?.trim() ?? board.title ?? id,
      coverTitle: field(part, "Judul cover")?.replace(/`/g, "") ?? board.title ?? id,
      sources: field(part, "Sumber") ?? null,
      narration: narration.trim(),
      narrateStyle: part.match(/narrate_style`?:\s*"([^"]+)"/)?.[1] ?? null,
      srt,
      style: board.style ?? null,
      cast: board.cast ?? [],
      scenes: [...board.scenes]
        .sort((a, b) => a.number - b.number)
        .map((s) => ({ number: s.number, framePrompt: s.frame_prompt ?? s.visual ?? "", motion: s.prompt ?? s.motion ?? "" })),
    });
  }
  return episodes;
}

// ------------------------------------------------------------------ paths and preview

export function episodeDirs(id) {
  const ep = safeName(id);
  const root = ASSET_DIRS;
  return {
    audio: path.join(root?.audio ?? OUTPUT_DIR, ep),
    images: path.join(root?.images ?? OUTPUT_DIR, ep),
    videos: path.join(OUTPUT_DIR, ep),
    final: path.join(FINAL_DIR, ep),
  };
}

const firstExisting = (dir, stems) => {
  for (const stem of stems) for (const ext of IMAGE_EXT) {
    const p = path.join(dir, stem + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
};
const pad = (n) => String(n).padStart(2, "0");
export const keyframeFor = (dirs, n) => firstExisting(dirs.images, [`frame-${pad(n)}`, `frame-${n}`, `scene-${pad(n)}`]);
export const shotName = (scene, k) => `shot-${pad(scene)}-${k}.mp4`;

// What a run would do, shown before anything is started.
export function preview(ep, settings = {}) {
  const s = { ...DEFAULTS, ...settings };
  const dirs = episodeDirs(ep.id);
  const shots = [];
  for (const sc of ep.scenes) {
    for (let k = 1; k <= s.shotsPerScene; k++) {
      shots.push({
        scene: sc.number,
        part: k,
        file: shotName(sc.number, k),
        done: fs.existsSync(path.join(dirs.videos, shotName(sc.number, k))),
        firstFrame: k === 1 ? (keyframeFor(dirs, sc.number) ? "keyframe" : "text only") : "previous shot's last frame",
      });
    }
  }
  const seconds = Math.round(((s.frames / 24) * shots.length) * 10) / 10;
  return {
    id: ep.id,
    heading: ep.heading,
    coverTitle: ep.coverTitle,
    sources: ep.sources,
    narration: { words: ep.narration.split(/\s+/).filter(Boolean).length, existing: fs.existsSync(path.join(dirs.audio, "vo_id.wav")) },
    subtitles: Boolean(ep.srt),
    cover: firstExisting(dirs.images, ["cover"]) ? "cover image" : "frame from the first shot",
    keyframes: ep.scenes.filter((sc) => keyframeFor(dirs, sc.number)).length,
    scenes: ep.scenes.length,
    shots,
    settings: s,
    footageSeconds: seconds,
    estimate: `${shots.filter((x) => !x.done).length} shots of ${s.frames} frames at ${s.width}x${s.height}`,
    dirs,
  };
}

// ------------------------------------------------------------------ narration (Google AI Studio TTS, free key)

function geminiKey() {
  const fromFile = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim() : "");
  const key = process.env.GEMINI_API_KEY || fromFile(path.join(os.homedir(), ".config", "minimax-studio", "gemini-key")) || fromFile(path.join(os.homedir(), ".flow-studio", "gemini-key"));
  return /^AIza[0-9A-Za-z_-]{30,}$/.test(key) ? key : null;
}

export async function speak(text, target, { voice = "Leda", style, fetchImpl = fetch } = {}) {
  const key = geminiKey();
  if (!key) throw new Error("No Google AI Studio key: set GEMINI_API_KEY or save it to ~/.config/minimax-studio/gemini-key");
  const model = process.env.MINIMAX_TTS_MODEL || "gemini-2.5-flash-preview-tts";
  const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: style ? `Say ${style}: ${text}` : text }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google TTS refused (${res.status}): ${body.error?.message ?? "no detail"}`);
  const audio = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!audio) throw new Error("Google TTS returned no audio");
  const rate = Number(audio.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000);
  const pcm = `${target}.pcm`;
  await fsp.writeFile(pcm, Buffer.from(audio.data, "base64"));
  try {
    await runFfmpeg(["-v", "error", "-y", "-f", "s16le", "-ar", String(rate), "-ac", "1", "-i", pcm, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", target]);
  } finally {
    await fsp.rm(pcm, { force: true });
  }
  return target;
}

// ------------------------------------------------------------------ media helpers

const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";
export function duration(file) {
  return new Promise((ok, fail) =>
    execFile(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], (err, out) => (err ? fail(err) : ok(Number(String(out).trim())))),
  );
}

const PYTHON = process.env.MINIMAX_PYTHON || (process.platform === "win32" ? "python" : "python3");
function titleFont() {
  if (process.env.MINIMAX_TITLE_FONT && fs.existsSync(process.env.MINIMAX_TITLE_FONT)) return process.env.MINIMAX_TITLE_FONT;
  const dirs = [path.join(os.homedir(), ".local", "share", "fonts"), "/usr/share/fonts", "C:\\Windows\\Fonts", path.join(os.homedir(), "AppData", "Local", "Microsoft", "Windows", "Fonts")];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    const hit = fs.readdirSync(d, { recursive: true }).map(String).find((f) => /comfortaa.*\.(ttf|otf)$/i.test(f));
    if (hit) return path.join(d, hit);
  }
  return null;
}

// Title card in the series style (production/shorts/title_overlay.py, Comfortaa 700). Returns null if it cannot be drawn.
async function titleCard(title, out, base = "1080,1920") {
  const font = titleFont();
  const kit = path.join(REPO, "production", "shorts");
  const args = font
    ? [path.join(kit, "title_bold.py"), path.join(kit, "title_overlay.py"), font, title, base, out]
    : [path.join(kit, "title_overlay.py"), title, base, out];
  return new Promise((ok) => execFile(PYTHON, args, { timeout: 60_000 }, (err) => ok(err || !fs.existsSync(out) ? null : out)));
}

function lastFrame(video, out) {
  return runFfmpeg(["-v", "error", "-y", "-sseof", "-0.1", "-i", video, "-frames:v", "1", "-update", "1", out]).then(() => out);
}

// ------------------------------------------------------------------ the run

// `deps` lets tests replace the GPU and the TTS: { generate, upload, speak }.
export async function runEpisode(ep, settings, { onLog = () => {}, shouldStop = () => false, deps = {} } = {}) {
  const s = { ...DEFAULTS, ...settings };
  const dirs = episodeDirs(ep.id);
  for (const d of Object.values(dirs)) await fsp.mkdir(d, { recursive: true });
  const warnings = [];
  const log = (m) => onLog(`${new Date().toISOString().slice(11, 19)} ${m}`);
  const seed = s.seed ?? (parseInt(ep.id.replace(/\D/g, "") || "1", 10) * 101 + 7);

  // 1. Subtitles from the spec.
  const srtPath = path.join(dirs.final, "subs", "en.srt");
  if (ep.srt) {
    await fsp.mkdir(path.dirname(srtPath), { recursive: true });
    await fsp.writeFile(srtPath, ep.srt.trim() + "\n");
    // About 44 characters fit on a line at the draft's subtitle size; the series allows two lines per cue.
    const long = ep.srt.trim().split(/\n\s*\n/).filter((cue) => cue.split("\n").slice(2).reduce((n, l) => n + Math.ceil(l.length / 44), 0) > 2);
    if (long.length) warnings.push(`${long.length} subtitle cue(s) will wrap to more than two lines; shorten them in the spec.`);
  } else warnings.push("The spec has no subtitles: the draft has none.");

  // 2. Narration.
  const vo = path.join(dirs.audio, "vo_id.wav");
  if (fs.existsSync(vo)) log("narration: using the existing audio/" + ep.id + "/vo_id.wav");
  else if (ep.narration) {
    log("narration: recording with Google TTS " + s.voice);
    try {
      await (deps.speak ?? speak)(ep.narration, vo, { voice: s.voice, style: ep.narrateStyle });
    } catch (err) {
      warnings.push(`Narration not recorded: ${err.message}`);
      log("narration failed: " + err.message);
    }
  }
  let tempo = 1;
  if (fs.existsSync(vo)) {
    const d = await duration(vo);
    tempo = Math.max(1, d / (FILM - COVER - 0.4));
    log(`narration: ${d.toFixed(1)} s${tempo > 1 ? `, needs x${tempo.toFixed(2)}` : ""}`);
    if (tempo > MAX_TEMPO) {
      warnings.push(`Narration is ${d.toFixed(1)} s and would need x${tempo.toFixed(2)}; capped at x${MAX_TEMPO}, so the end is cut. Shorten the script or re-record.`);
      tempo = MAX_TEMPO;
    }
  }

  // 3. Shots on the GPU, in order. Part 1 of a scene starts from its keyframe; later parts continue from the last frame.
  // Text-only shots drift (costume, even the child's gender) and break the visual rules (adults' faces), so a scene
  // without a keyframe is refused unless the run explicitly allows it.
  const missing = ep.scenes.filter((sc) => !keyframeFor(dirs, sc.number)).map((sc) => sc.number);
  if (missing.length && !s.allowTextOnly) {
    throw new Error(`No keyframe for scene ${missing.join(", ")} in images/${ep.id}/ (frame-01.png …). Add them, or allow text-only shots.`);
  }
  if (missing.length) warnings.push(`Scene ${missing.join(", ")} rendered from text only: check costume consistency and adults' faces closely.`);
  const { generateVideo, uploadImageToComfy } = deps.generate ? {} : await import("./comfy_client.js");
  const generate = deps.generate ?? generateVideo;
  const upload = deps.upload ?? uploadImageToComfy;
  const shots = [];
  const look = ep.cast?.[0]?.look ? ` Character: ${ep.cast[0].look}.` : "";
  for (const sc of ep.scenes) {
    for (let k = 1; k <= s.shotsPerScene; k++) {
      const file = path.join(dirs.videos, shotName(sc.number, k));
      shots.push(file);
      if (fs.existsSync(file)) {
        log(`shot ${path.basename(file)}: already rendered`);
        continue;
      }
      if (shouldStop()) throw Object.assign(new Error("Stopped before " + path.basename(file)), { stopped: true });
      let first = null;
      const still = k === 1 ? keyframeFor(dirs, sc.number) : await lastFrame(shots[shots.length - 2], path.join(dirs.videos, `.last-${sc.number}-${k}.png`));
      if (still) first = await upload(await fsp.readFile(still), `${ep.id}-${path.basename(still)}`);
      const prompt = [k === 1 ? sc.framePrompt : "", sc.motion, look, ep.style ? `Style: ${ep.style}` : ""].filter(Boolean).join(" ").replace(/\bthe (boy|girl)\b/gi, "the animated character");
      const started = Date.now();
      log(`shot ${path.basename(file)}: rendering (${s.frames} frames, ${s.width}x${s.height}, ${first ? "from " + (k === 1 ? "keyframe" : "previous shot") : "text only"})`);
      const result = await generate({ prompt, width: s.width, height: s.height, frames: s.frames, steps: s.steps, seed: seed + sc.number * 10 + k, firstFrameImage: first, projectName: ep.id, onProgress: () => {} });
      if (!result?.videoPath || !fs.existsSync(result.videoPath)) throw new Error(`Shot ${path.basename(file)} produced no file`);
      await fsp.rename(result.videoPath, file);
      log(`shot ${path.basename(file)}: done in ${Math.round((Date.now() - started) / 60000)} min`);
    }
  }
  if (shouldStop()) throw Object.assign(new Error("Stopped before assembly"), { stopped: true });

  // 4. Cover, title, assembly.
  log("assembling the 33 s draft");
  const work = path.join(dirs.final, ".work");
  await fsp.mkdir(work, { recursive: true });
  const cover = firstExisting(dirs.images, ["cover"]);
  const coverHd = path.join(work, "cover_hd.png");
  if (cover) {
    // A prepared cover keeps its own layout (empty top for the title).
    await runFfmpeg(["-v", "error", "-y", "-i", cover, "-vf", "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920", "-frames:v", "1", "-update", "1", coverHd]);
  } else {
    // A frame from the first shot has the face where the title goes: move the picture down 24 % over a blurred copy,
    // so the title sits over the blur and never over the eyes.
    warnings.push(`No images/${ep.id}/cover.png: the cover is a frame of the first shot moved down under the title. A prepared cover with an empty top looks better.`);
    const frame = path.join(work, "frame.png");
    await runFfmpeg(["-v", "error", "-y", "-ss", "0.5", "-i", shots[0], "-frames:v", "1", "-update", "1", frame]);
    await runFfmpeg(["-v", "error", "-y", "-i", frame, "-filter_complex",
      "[0:v]scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,split[a][b];[a]gblur=sigma=40,eq=brightness=-0.08[bg];[b]scale=1080:-2[fg];[bg][fg]overlay=0:460",
      "-frames:v", "1", "-update", "1", coverHd]);
  }
  const card = await (deps.titleCard ?? titleCard)(ep.coverTitle, path.join(work, "title.png"));
  if (!card) warnings.push("Title card could not be drawn (Python with Pillow and the Comfortaa font are needed); the cover has no title.");
  const thumb = path.join(dirs.final, `${ep.id}_thumbnail.png`);
  if (card) await runFfmpeg(["-v", "error", "-y", "-i", coverHd, "-i", card, "-filter_complex", "overlay=0:0", "-frames:v", "1", "-update", "1", thumb]);
  else await fsp.copyFile(coverHd, thumb);

  const footage = (await Promise.all(shots.map(duration))).reduce((a, b) => a + b, 0);
  const story = FILM - COVER;
  // Retime the footage to fill the story time; past 1.5x it looks like slow motion, so the last frame holds instead.
  const stretch = Math.min(1.5, Math.max(0.75, story / footage));
  if (story / footage > 1.5) warnings.push(`Only ${footage.toFixed(1)} s of footage for ${story} s: slowed 1.5x and the last frame is held. Render more or longer shots.`);
  const out = path.join(dirs.final, `${ep.id}_1080p_draft.mp4`);
  const inputs = ["-framerate", "30", "-loop", "1", "-t", String(COVER), "-i", thumb];
  shots.forEach((f) => inputs.push("-i", f));
  const hasVo = fs.existsSync(vo);
  if (hasVo) inputs.push("-i", vo);
  const n = shots.length;
  const V = "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,fps=30,setsar=1,format=yuv420p";
  let fc = `[0:v]scale=2160:3840,zoompan=z='min(1+0.0026*on,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,setsar=1,format=yuv420p[c];`;
  shots.forEach((_, i) => (fc += `[${i + 1}:v]setpts=(PTS-STARTPTS)*${stretch.toFixed(4)},${V}[s${i}];`));
  fc += `${shots.map((_, i) => `[s${i}]`).join("")}concat=n=${n}:v=1:a=0,tpad=stop_mode=clone:stop_duration=${story},trim=duration=${story},setpts=PTS-STARTPTS[st];`;
  fc += `[c][st]concat=n=2:v=1:a=0[v0];`;
  const srtArg = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
  fc += fs.existsSync(srtPath)
    ? `[v0]subtitles='${srtArg}':force_style='FontName=DejaVu Sans,FontSize=10,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.6,Alignment=2,MarginV=32,MarginL=6,MarginR=6'[v]`
    : `[v0]null[v]`;
  if (hasVo) fc += `;[${n + 1}:a]atempo=${tempo.toFixed(3)},adelay=500|500,apad,atrim=0:${FILM},afade=t=out:st=${FILM - 0.6}:d=0.6[a]`;
  else fc += `;anullsrc=r=48000:cl=stereo,atrim=0:${FILM}[a]`;
  if (!hasVo) warnings.push("No narration: the draft is silent.");
  await runFfmpeg(["-v", "error", "-y", ...inputs, "-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-t", String(FILM), "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
  await fsp.rm(work, { recursive: true, force: true });

  // 5. Production notes, with what still needs a person.
  const notes = [
    `# ${ep.heading}: draft production notes`,
    "",
    `- Draft: \`${path.basename(out)}\` (1080x1920, 30 fps, ${FILM} s). Thumbnail: \`${path.basename(thumb)}\`.`,
    `- Shots: ${shots.length} x ${s.frames} frames at ${s.width}x${s.height}, ${s.steps} steps, seed from ${seed}; footage ${footage.toFixed(1)} s, retimed x${stretch.toFixed(2)}.`,
    `- Narration: ${hasVo ? `audio/${ep.id}/vo_id.wav, tempo x${tempo.toFixed(2)}` : "none"}. Subtitles: ${fs.existsSync(srtPath) ? "subs/en.srt from the spec" : "none"}.`,
    `- Sources in the spec: ${ep.sources ?? "none given"}.`,
    "",
    "## Warnings",
    ...(warnings.length ? warnings.map((w) => `- ${w}`) : ["- none"]),
    "",
    "## Before posting (CONTENT_PRODUCTION_SPEC.md, section 6)",
    "- [ ] Protagonist, narrator of the hadith, hadith numbers and every detail checked against the texts.",
    "- [ ] Every shot checked at readable size: no faces of the Prophet, senior companions or the father, no weapons, no fake Arabic, period-accurate setting.",
    "- [ ] Shot order matches the narration; subtitles at most two lines; title not over the eyes.",
    "- [ ] Audio listened to by a person: pronunciation, salawat, subtitle sync.",
  ].join("\n");
  await fsp.writeFile(path.join(dirs.final, "PRODUCTION.md"), notes + "\n");
  log("done: " + out);
  return { output: out, thumbnail: thumb, warnings, shots };
}

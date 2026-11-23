// Spec parsing and a full draft run, with the GPU and TTS replaced by small synthetic clips (needs ffmpeg/ffprobe).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = mkdtempSync(join(tmpdir(), "minimax-episode-"));
process.env.MINIMAX_ASSETS_ROOT = join(root, "production_assets");
delete process.env.MINIMAX_STUDIO_OUT;
delete process.env.MINIMAX_FINAL_DIR;
const SPEC = readFileSync(new URL("../production/shorts/kisah_sahabat_cilik_spec_ep_9_12.md", import.meta.url), "utf8");
let ep, pipeline;
before(async () => {
  ep = await import("../src/episode.js");
  pipeline = await import("../src/pipeline.js");
});
after(() => rmSync(root, { recursive: true, force: true }));

const ffmpeg = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
const probe = (f) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", f]).toString());

test("the Ep09-12 spec yields four episodes with scenes, narration, subtitles and titles", () => {
  const eps = ep.parseSpec(SPEC);
  assert.deepEqual(eps.map((e) => e.id), ["ep09_umar_salamah", "ep10_ummu_khalid", "ep11_ibn_umar", "ep12_zaid_arqam"]);
  for (const e of eps) {
    assert.equal(e.scenes.length, 4);
    assert.ok(e.scenes.every((s) => s.framePrompt && s.motion));
    assert.match(e.srt, /00:00:00,000 --> /);
    assert.ok(e.narration.split(/\s+/).length > 50, e.id);
    assert.ok(e.narrateStyle);
  }
  assert.equal(eps[1].coverTitle, "The Pretty Little Black Dress");
  assert.match(eps[2].narration, /lebih ia sukai/);
});

test("a single-episode file without an 'Episode NN' heading still parses", () => {
  const md = "# Kisah\n- **Episode ID:** `ep99_test`\n- **Judul cover (EN):** A Test\n\n#### Narasi\n\n> \"Satu dua tiga.\"\n\n```json\n" +
    JSON.stringify({ title: "t", scenes: [{ number: 2, frame_prompt: "b", prompt: "y" }, { number: 1, frame_prompt: "a", prompt: "x" }] }) + "\n```\n";
  const [e] = ep.parseSpec(md);
  assert.equal(e.id, "ep99_test");
  assert.equal(e.coverTitle, "A Test");
  assert.equal(e.narration, "Satu dua tiga.");
  assert.deepEqual(e.scenes.map((s) => s.number), [1, 2]);
  assert.throws(() => pipeline.parseUpload("no storyboard here"), /No storyboard/);
});

test("preview lists every shot and where its first frame comes from", () => {
  const e = ep.parseSpec(SPEC)[0];
  const dirs = ep.episodeDirs(e.id);
  mkdirSync(dirs.images, { recursive: true });
  ffmpeg(["-f", "lavfi", "-i", "color=c=orange:s=576x1024", "-frames:v", "1", join(dirs.images, "frame-01.png")]);
  const p = ep.preview(e, { shotsPerScene: 2 });
  assert.equal(p.shots.length, 8);
  assert.equal(p.shots[0].firstFrame, "keyframe");
  assert.equal(p.shots[1].firstFrame, "previous shot's last frame");
  assert.equal(p.shots[2].firstFrame, "text only");
  assert.equal(p.keyframes, 1);
});

test("a full run produces a 33 s 1080x1920 draft with narration, thumbnail and notes, and resumes", async () => {
  const e = { ...ep.parseSpec(SPEC)[0], id: "ep09_dryrun" };
  const dirs = ep.episodeDirs(e.id);
  let renders = 0;
  const generate = async ({ projectName, frames, width, height, firstFrameImage }) => {
    renders += 1;
    const dir = join(process.env.MINIMAX_ASSETS_ROOT, "videos", projectName);
    mkdirSync(dir, { recursive: true });
    const out = join(dir, `shot_${String(renders).padStart(5, "0")}_.mp4`);
    ffmpeg(["-f", "lavfi", "-i", `testsrc2=s=${width}x${height}:r=24`, "-f", "lavfi", "-i", "sine=f=330", "-frames:v", String(frames), "-shortest", "-pix_fmt", "yuv420p", out]);
    return { videoPath: out, firstFrameImage };
  };
  const uploads = [];
  const deps = {
    generate,
    upload: async (_buf, name) => (uploads.push(name), name),
    speak: async (_text, target) => (ffmpeg(["-f", "lavfi", "-i", "sine=f=220:d=30", "-ar", "48000", target]), target),
    titleCard: async (title, out) => (ffmpeg(["-f", "lavfi", "-i", "color=c=black@0.0:s=1080x1920,format=rgba", "-frames:v", "1", out]), out),
  };
  const lines = [];
  const settings = { frames: 49, shotsPerScene: 2, width: 288, height: 512, allowTextOnly: true };
  const r = await ep.runEpisode(e, settings, { onLog: (l) => lines.push(l), deps });
  assert.equal(renders, 8);
  assert.equal(uploads.length, 4, "one keyframe-less first shot per scene uses no upload, later parts chain from the previous shot");
  const info = probe(r.output);
  assert.equal(Math.round(Number(info.format.duration)), 33);
  assert.deepEqual(info.streams.find((s) => s.codec_type === "video") && [info.streams.find((s) => s.codec_type === "video").width, info.streams.find((s) => s.codec_type === "video").height], [1080, 1920]);
  assert.ok(info.streams.some((s) => s.codec_type === "audio"));
  assert.ok(existsSync(r.thumbnail));
  assert.ok(existsSync(join(dirs.final, "subs", "en.srt")));
  const notes = readFileSync(join(dirs.final, "PRODUCTION.md"), "utf8");
  assert.match(notes, /Audio listened to by a person/);
  assert.match(notes, /retimed x/);

  // A second run reuses every rendered shot and the narration.
  const again = await ep.runEpisode(e, settings, { onLog: () => {}, deps });
  assert.equal(renders, 8);
  assert.ok(existsSync(again.output));
});

test("agent prompt points at the fact check, the reviewed spec and the loopback API", () => {
  const e = ep.parseSpec(SPEC)[3];
  const prompt = pipeline.agentPrompt(e, { frames: 97 });
  assert.match(prompt, /factcheck\.md/);
  assert.match(prompt, /spec\.reviewed\.md/);
  assert.match(prompt, /http:\/\/127\.0\.0\.1:\d+\/api\/episodes\/start/);
  assert.match(prompt, /Never spend money/);
  assert.deepEqual(pipeline.summarize('{"type":"assistant","message":{"content":[{"type":"text","text":"Checking Bukhari 4900"},{"type":"tool_use","name":"WebFetch","input":{"url":"https://en.tohed.com/hadith/bukhari/4900"}}]}}'),
    ["agent: Checking Bukhari 4900", "agent → WebFetch: https://en.tohed.com/hadith/bukhari/4900"]);
  assert.deepEqual(pipeline.summarize("not json"), []);
});

test("starting without keyframes for every scene is refused unless text-only is allowed", async () => {
  const one = SPEC.slice(SPEC.indexOf("### Episode 12"));
  await assert.rejects(pipeline.start({ markdown: one, mode: "auto", settings: {} }), (e) => e.status === 400 && /keyframe/.test(e.message));
  await assert.rejects(pipeline.start({ markdown: one, mode: "agent", settings: {} }), (e) => e.status === 400);
});

test("worker audio: the run requests audio, renders meanwhile, waits, then mixes narration and backsound", async () => {
  const e = { ...ep.parseSpec(SPEC)[2], id: "ep11_worker" };
  const dirs = ep.episodeDirs(e.id);
  let renders = 0;
  const deliver = () => {
    mkdirSync(dirs.audio, { recursive: true });
    ffmpeg(["-f", "lavfi", "-i", "sine=f=220:d=28", "-ar", "48000", join(dirs.audio, "vo_id.wav")]);
    ffmpeg(["-f", "lavfi", "-i", "sine=f=110:d=36", "-ac", "2", "-ar", "44100", join(dirs.audio, "bgm.flac")]);
    writeFileSync(join(dirs.audio, "audio_done.json"), JSON.stringify({ id: e.id, files: ["vo_id.wav", "bgm.flac"], warnings: [] }));
  };
  const deps = {
    pollMs: 50,
    generate: async ({ projectName, frames, width, height }) => {
      renders += 1;
      const dir = join(process.env.MINIMAX_ASSETS_ROOT, "videos", projectName);
      mkdirSync(dir, { recursive: true });
      const out = join(dir, `w_${renders}.mp4`);
      ffmpeg(["-f", "lavfi", "-i", `testsrc2=s=${width}x${height}:r=24`, "-frames:v", String(frames), "-pix_fmt", "yuv420p", out]);
      return { videoPath: out };
    },
    upload: async (_b, name) => name,
    speak: async () => assert.fail("the server must not record narration in worker mode"),
    titleCard: async () => null,
  };
  const pending = await (async () => {
    // The request is visible to the PC as soon as the run starts; deliver the audio a little later.
    const run = ep.runEpisode(e, { frames: 49, shotsPerScene: 1, width: 288, height: 512, allowTextOnly: true, audioFrom: "worker" }, { onLog: () => {}, deps });
    for (let i = 0; i < 100 && !(await pipeline.audioJobs()).some((j) => j.id === e.id); i++) await new Promise((r) => setTimeout(r, 50));
    const jobs = await pipeline.audioJobs();
    const job = jobs.find((j) => j.id === e.id);
    assert.ok(job, "audio request listed for the worker");
    assert.match(job.narration, /lebih ia sukai/);
    assert.equal(job.voice, "Leda");
    deliver();
    return run;
  })();
  const r = await pending;
  assert.equal(renders, 4);
  assert.equal((await pipeline.audioJobs()).some((j) => j.id === e.id), false, "delivered requests leave the queue");
  const info = probe(r.output);
  assert.equal(Math.round(Number(info.format.duration)), 33);
  const notes = readFileSync(join(dirs.final, "PRODUCTION.md"), "utf8");
  assert.match(notes, /Powered by Stability AI/);
  assert.ok(r.warnings.some((w) => /Title card/.test(w)));
});

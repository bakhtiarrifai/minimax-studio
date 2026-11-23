#!/usr/bin/env node
// Indonesian narration with Chatterbox-TTS-Indonesian (grandhigh, Apache-2.0) through ComfyUI's TTS-Audio-Suite.
// Model files in ComfyUI/models/TTS/chatterbox/Indonesian/ (t3_cfg, s3gen, ve, tokenizer.json + conds.pt from
// ResembleAI/chatterbox); the node lists it as "local:Indonesian". The voice is cloned from a clean 5-10 s reference
// clip in ComfyUI/input/voice_refs/.
//
//   node scripts/chatterbox_id.mjs --ref voice_refs/leda_ref.wav --out narasi.wav --text "..."
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: a } = parseArgs({
  options: {
    text: { type: "string" },
    file: { type: "string" },
    ref: { type: "string", default: "voice_refs/chatterbox_id_example1.wav" },
    out: { type: "string", default: "chatterbox_id.wav" },
    exaggeration: { type: "string", default: "0.5" },
    temperature: { type: "string", default: "0.8" },
    cfg: { type: "string", default: "0.5" },
    seed: { type: "string", default: "1" },
    comfy: { type: "string", default: process.env.COMFYUI_URL || "http://127.0.0.1:8188" },
  },
});
const text = a.file ? fs.readFileSync(a.file, "utf8") : a.text;
if (!text) throw new Error("give --text or --file");

const workflow = {
  1: { class_type: "ChatterBoxEngineNode", inputs: { language: "local:Indonesian", device: "auto", exaggeration: Number(a.exaggeration), temperature: Number(a.temperature), cfg_weight: Number(a.cfg) } },
  2: { class_type: "LoadAudio", inputs: { audio: a.ref } },
  3: { class_type: "UnifiedTTSTextNode", inputs: { TTS_engine: ["1", 0], text, narrator_voice: "none", seed: Number(a.seed), opt_narrator: ["2", 0], enable_chunking: true, max_chars_per_chunk: 400, chunk_combination_method: "auto", silence_between_chunks_ms: 100, enable_audio_cache: false } },
  4: { class_type: "SaveAudio", inputs: { audio: ["3", 0], filename_prefix: "audio/chatterbox_id" } },
};

const started = Date.now();
const res = await fetch(`${a.comfy}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: workflow }) });
const sent = await res.json();
if (!res.ok || !sent.prompt_id) throw new Error(`ComfyUI refused: ${JSON.stringify(sent.node_errors ?? sent.error ?? sent).slice(0, 800)}`);
for (;;) {
  await new Promise((r) => setTimeout(r, 3000));
  const run = (await (await fetch(`${a.comfy}/history/${sent.prompt_id}`)).json())[sent.prompt_id];
  if (!run) continue;
  if (run.status?.status_str === "error") throw new Error("ComfyUI failed: " + JSON.stringify(run.status.messages?.slice(-1)).slice(0, 1200));
  const item = Object.values(run.outputs ?? {}).flatMap((x) => x.audio ?? [])[0];
  if (!item) continue;
  const view = `${a.comfy}/view?filename=${encodeURIComponent(item.filename)}&subfolder=${encodeURIComponent(item.subfolder ?? "")}&type=${item.type ?? "output"}`;
  const out = path.resolve(a.out.replace(/\.\w+$/, path.extname(item.filename)));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await (await fetch(view)).arrayBuffer()));
  console.log(`saved ${out} in ${Math.round((Date.now() - started) / 1000)} s`);
  break;
}

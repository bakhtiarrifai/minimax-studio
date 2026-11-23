// Indonesian narration with Chatterbox-TTS-Indonesian (grandhigh, Apache-2.0) on the local ComfyUI (TTS-Audio-Suite),
// cloning a reference voice from ComfyUI/input/voice_refs/ (default: leda_ref.wav, 8.5 s of the series' Leda voice).
// Used by the audio worker when a run asks for narration "chatterbox".
import fs from "node:fs";
import fsp from "node:fs/promises";
import { runFfmpeg } from "./cut.js";

export const CHATTERBOX_REF = process.env.MINIMAX_CHATTERBOX_REF || "voice_refs/leda_ref.wav";
export const CHATTERBOX_CREDIT = "Narration: Chatterbox-TTS-Indonesian (grandhigh, Apache-2.0; data incl. FLEURS CC-BY-4.0), voice cloned from Leda";

export function chatterboxWorkflow({ text, ref = CHATTERBOX_REF, exaggeration = 0.5, temperature = 0.8, cfg = 0.5, seed = 1, prefix = "audio/chatterbox_id" }) {
  return {
    1: { class_type: "ChatterBoxEngineNode", inputs: { language: "local:Indonesian", device: "auto", exaggeration, temperature, cfg_weight: cfg } },
    2: { class_type: "LoadAudio", inputs: { audio: ref } },
    3: {
      class_type: "UnifiedTTSTextNode",
      inputs: { TTS_engine: ["1", 0], text, narrator_voice: "none", seed, opt_narrator: ["2", 0], enable_chunking: true, max_chars_per_chunk: 400, chunk_combination_method: "auto", silence_between_chunks_ms: 100, enable_audio_cache: false },
    },
    4: { class_type: "SaveAudio", inputs: { audio: ["3", 0], filename_prefix: prefix } },
  };
}

// Renders `text` and writes a cleaned 48 kHz WAV to `target` (trailing low tail trimmed, loudness like the Leda takes).
export async function chatterboxSpeak(text, target, opts = {}, { comfy = process.env.COMFYUI_URL || "http://127.0.0.1:8188", timeoutMs = 20 * 60_000 } = {}) {
  const res = await fetch(`${comfy}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: chatterboxWorkflow({ text, ...opts }) }) }).catch((e) => {
    throw new Error(`ComfyUI is not reachable at ${comfy} (${e.message})`);
  });
  const sent = await res.json();
  if (!res.ok || !sent.prompt_id) throw new Error(`ComfyUI refused the Chatterbox workflow: ${JSON.stringify(sent.node_errors ?? sent.error ?? sent).slice(0, 600)}`);
  const until = Date.now() + timeoutMs;
  let item;
  while (!item) {
    if (Date.now() > until) throw new Error("Timed out waiting for Chatterbox");
    await new Promise((r) => setTimeout(r, 3000));
    const run = (await (await fetch(`${comfy}/history/${sent.prompt_id}`)).json())[sent.prompt_id];
    if (!run) continue;
    if (run.status?.status_str === "error") throw new Error("Chatterbox failed: " + JSON.stringify(run.status.messages?.slice(-1)).slice(0, 600));
    item = Object.values(run.outputs ?? {}).flatMap((x) => x.audio ?? [])[0];
  }
  const raw = `${target}.raw${item.filename.match(/\.\w+$/)?.[0] ?? ".flac"}`;
  await fsp.writeFile(raw, Buffer.from(await (await fetch(`${comfy}/view?filename=${encodeURIComponent(item.filename)}&subfolder=${encodeURIComponent(item.subfolder ?? "")}&type=${item.type ?? "output"}`)).arrayBuffer()));
  try {
    await runFfmpeg(["-v", "error", "-y", "-i", raw, "-af",
      "areverse,silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.15,areverse,loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "1", target]);
  } finally {
    await fsp.rm(raw, { force: true });
  }
  const size = fs.statSync(target).size;
  // A broken engine has produced a second of silence before (missing dependencies): refuse it instead of shipping it.
  if (size < 48000 * 2 * 2) throw new Error("Chatterbox returned almost no audio (check the TTS-Audio-Suite startup report)");
  return target;
}

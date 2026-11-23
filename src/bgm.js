// Background music with Stable Audio Open 1.0 on ComfyUI (native nodes, no custom node).
// Models: models/checkpoints/stable-audio-open-1.0.safetensors (Comfy-Org/stable-audio-open-1.0)
//         models/text_encoders/t5_base.safetensors (google-t5/t5-base model.safetensors, renamed)
// License: Stability AI Community License. Free below US$1M yearly revenue; commercial use needs the free registration
// at https://stability.ai/community-license and the credit "Powered by Stability AI".

export const BGM_CREDIT = "Backsound: Stable Audio Open 1.0, Powered by Stability AI";
export const BGM_DEFAULTS = {
  prompt: "gentle warm Middle Eastern ambient background for a children's story, soft oud melody, light frame drum, calm and hopeful, 70 BPM, no vocals",
  negative: "vocals, singing, speech, harsh, distorted, loud drums, electric guitar, noise",
  seconds: 36,
  steps: 50,
  cfg: 5,
};

export function bgmWorkflow({ prompt, negative, seconds, seed, steps, cfg, prefix }) {
  return {
    1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "stable-audio-open-1.0.safetensors" } },
    2: { class_type: "CLIPLoader", inputs: { clip_name: "t5_base.safetensors", type: "stable_audio" } },
    3: { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["2", 0] } },
    4: { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["2", 0] } },
    5: { class_type: "ConditioningStableAudio", inputs: { positive: ["3", 0], negative: ["4", 0], seconds_start: 0, seconds_total: seconds } },
    6: { class_type: "EmptyLatentAudio", inputs: { seconds, batch_size: 1 } },
    7: {
      class_type: "KSampler",
      inputs: { model: ["1", 0], positive: ["5", 0], negative: ["5", 1], latent_image: ["6", 0], seed, steps, cfg, sampler_name: "dpmpp_3m_sde_gpu", scheduler: "exponential", denoise: 1 },
    },
    8: { class_type: "VAEDecodeAudio", inputs: { samples: ["7", 0], vae: ["1", 2] } },
    9: { class_type: "SaveAudio", inputs: { audio: ["8", 0], filename_prefix: prefix } },
  };
}

// Returns { audio: Buffer, ext: ".flac" }. Throws if ComfyUI is not reachable or the run fails.
export async function generateBgm(opts = {}, { comfy = process.env.COMFYUI_URL || "http://127.0.0.1:8188", fetchImpl = fetch, timeoutMs = 15 * 60_000 } = {}) {
  const o = { ...BGM_DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined && v !== null)) };
  const seconds = Math.min(47, Math.max(1, Number(o.seconds)));
  const seed = Number.isFinite(Number(o.seed)) ? Number(o.seed) : Math.floor(Math.random() * 1e9);
  const workflow = bgmWorkflow({ prompt: o.prompt, negative: o.negative, seconds, seed, steps: Number(o.steps), cfg: Number(o.cfg), prefix: `audio/bgm/${o.name ?? "bgm"}` });
  const res = await fetchImpl(`${comfy}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: workflow }) }).catch((e) => {
    throw new Error(`ComfyUI is not reachable at ${comfy} (${e.message})`);
  });
  const sent = await res.json();
  if (!res.ok || !sent.prompt_id) throw new Error(`ComfyUI refused the workflow: ${JSON.stringify(sent.node_errors ?? sent.error ?? sent).slice(0, 600)}`);
  const until = Date.now() + timeoutMs;
  for (;;) {
    if (Date.now() > until) throw new Error("Timed out waiting for ComfyUI");
    await new Promise((r) => setTimeout(r, 3000));
    const run = (await (await fetchImpl(`${comfy}/history/${sent.prompt_id}`)).json())[sent.prompt_id];
    if (!run) continue;
    if (run.status?.status_str === "error") throw new Error("ComfyUI failed: " + JSON.stringify(run.status.messages?.slice(-1)).slice(0, 600));
    const item = Object.values(run.outputs ?? {}).flatMap((x) => x.audio ?? [])[0];
    if (!item) continue;
    const view = `${comfy}/view?filename=${encodeURIComponent(item.filename)}&subfolder=${encodeURIComponent(item.subfolder ?? "")}&type=${item.type ?? "output"}`;
    const audio = Buffer.from(await (await fetchImpl(view)).arrayBuffer());
    return { audio, ext: item.filename.match(/\.\w+$/)?.[0] ?? ".flac", seed, seconds };
  }
}

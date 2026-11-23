#!/usr/bin/env node
// Background music with Stable Audio Open 1.0 on the local ComfyUI (see src/bgm.js for models and license).
//   node scripts/generate_bgm.mjs --out bgm.flac [--seconds 36] [--seed 7] [--steps 50] [--prompt "..."]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { BGM_DEFAULTS, generateBgm } from "../src/bgm.js";

const { values: a } = parseArgs({
  options: {
    prompt: { type: "string", default: BGM_DEFAULTS.prompt },
    negative: { type: "string", default: BGM_DEFAULTS.negative },
    seconds: { type: "string", default: String(BGM_DEFAULTS.seconds) },
    seed: { type: "string" },
    steps: { type: "string", default: String(BGM_DEFAULTS.steps) },
    cfg: { type: "string", default: String(BGM_DEFAULTS.cfg) },
    out: { type: "string" },
  },
});
const started = Date.now();
const r = await generateBgm({ ...a, seconds: Number(a.seconds), steps: Number(a.steps), cfg: Number(a.cfg), seed: a.seed });
const out = path.resolve((a.out ?? path.join(os.homedir(), "minimax-studio-out", "audio", "bgm", `bgm_${Date.now()}.flac`)).replace(/\.\w+$/, r.ext));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, r.audio);
console.log(`saved ${out} (${r.seconds} s, seed ${r.seed}, ${(r.audio.length / 1e6).toFixed(1)} MB) in ${Math.round((Date.now() - started) / 1000)} s`);

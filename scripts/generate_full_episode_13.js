import { generateVideo } from "../src/comfy_client.js";
import { concatenateClips } from "../src/cut.js";
import { getGpuStatus } from "../src/gpu_sync.js";
import path from "node:path";
import { OUTPUT_DIR } from "../src/config.js";

const EPISODE_NAME = "ep13_sahl_sad";

const SCENES = [
  {
    number: 1,
    title: "Di Majelis Madinah",
    prompt: `3D animated 10-year-old Arab boy named Sahl with neat dark hair, bright curious dark eyes, wearing a warm sand-beige linen tunic with a simple brown leather belt and light-olive head cloth, sitting cross-legged on a woven mat in a sunlit 7th-century Medina courtyard gathering with blurred silhouettes of elders' backs nearby, Pixar 3D animation style, 9:16 vertical ratio. The animated character sits attentively on the woven mat, looking toward warm golden light coming from off-frame with wide, interested eyes. Ambient sound of warm breeze rustling palm leaves, gentle peaceful courtyard foley, soft distant murmurs, spatial authentic audio.`,
    frames: 49,
    steps: 20,
  },
  {
    number: 2,
    title: "Menjawab dengan Sopan",
    prompt: `3D animated 10-year-old Arab boy named Sahl in a sand-beige linen tunic and light-olive head cloth looking politely toward warm golden light from off-frame while speaking gently with one hand over his chest, respectful and earnest expression, Pixar 3D animation style, 9:16 vertical ratio. The animated character speaks politely with a gentle, respectful nod and a sincere smile while keeping one hand over his chest. Warm soft breeze, gentle cloth movement, calm soothing background ambiance.`,
    frames: 49,
    steps: 20,
  },
  {
    number: 3,
    title: "Menerima Mangkuk Minuman",
    prompt: `3D animated 10-year-old Arab boy named Sahl in a sand-beige linen tunic and light-olive head cloth holding a simple clay drinking bowl with both hands, beaming with pure gratitude in radiant warm golden sunlight, Pixar 3D animation style, 9:16 vertical ratio. The animated character holds the clay bowl carefully with both hands and smiles joyfully as warm golden sunlight glows around. Foley sound of clay bowl handling, peaceful courtyard birds, uplifting subtle musical chime.`,
    frames: 49,
    steps: 20,
  },
  {
    number: 4,
    title: "Pesan Moral & Senyum Hangat",
    prompt: `3D animated 10-year-old Arab boy named Sahl wearing a sand-beige linen tunic with a brown leather belt and light-olive head cloth in a sunny Medina courtyard, smiling warmly directly at the camera, Pixar 3D animation style, 9:16 vertical ratio. The animated character smiles brightly at the camera and gives a friendly, confident nod in the warm sunlight. Cheerful uplifting ambient music, gentle warm wind foley.`,
    frames: 49,
    steps: 20,
  },
];

export async function generateFullEpisode() {
  console.log("==============================================================");
  console.log("MiniMax H3 — Episode 13: Sahl bin Sa'd Full Episode Production");
  console.log("Total Scenes: 4 | Format: 9:16 Vertical Video (768x1344)");
  console.log("==============================================================");

  const status = await getGpuStatus();
  console.log(`Current VRAM: ${status.vramFreeGb} GB free | GPU Ready: ${status.readyForH3}\n`);

  const renderedClips = [];

  for (const scene of SCENES) {
    console.log(`\n--------------------------------------------------------------`);
    console.log(`🎬 Rendering Scene ${scene.number}/4: "${scene.title}"...`);
    console.log(`--------------------------------------------------------------`);

    const result = await generateVideo({
      prompt: scene.prompt,
      width: 768,
      height: 1344,
      frames: scene.frames,
      steps: scene.steps,
      fps: 24,
      projectName: EPISODE_NAME,
      onProgress: (prog) => {
        const pct = prog.percent !== undefined ? `[${prog.percent}%]` : "";
        console.log(`[Scene ${scene.number}] -> ${prog.stage || "progress"}: ${prog.message || ""} ${pct}`);
      },
    });

    console.log(`[Scene ${scene.number}] Saved to: ${result.videoPath}`);
    renderedClips.push(result.videoPath);
  }

  console.log("\n==============================================================");
  console.log("🎬 Stitching all 4 scenes into final episode movie with FFmpeg...");
  const finalMoviePath = path.join(OUTPUT_DIR, EPISODE_NAME, "episode_13_sahl_bin_sa_d_full.mp4");
  await concatenateClips(renderedClips, finalMoviePath);

  console.log(`🎉 FULL EPISODE EXPORTED: ${finalMoviePath}`);
  console.log("==============================================================");
  return finalMoviePath;
}

if (process.argv[1] && process.argv[1].endsWith("generate_full_episode_13.js")) {
  generateFullEpisode().catch(console.error);
}

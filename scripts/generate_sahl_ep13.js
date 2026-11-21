import { generateVideo } from "../src/comfy_client.js";
import { getGpuStatus } from "../src/gpu_sync.js";

console.log("==============================================================");
console.log("MiniMax H3 — Episode 13: Sahl bin Sa'd Generation Test");
console.log("Story: Hak Anak di Sebelah Kanan (The Cup on the Right)");
console.log("==============================================================");

const scene1Prompt = `3D animated 10-year-old Arab boy named Sahl with neat dark hair, bright curious dark eyes, wearing a warm sand-beige linen tunic with a simple brown leather belt and light-olive head cloth, sitting cross-legged on a woven mat in a sunlit 7th-century Medina courtyard gathering with blurred silhouettes of elders' backs nearby, Pixar 3D animation style, 9:16 vertical ratio. The animated character sits attentively on the woven mat, looking toward warm golden light coming from off-frame with wide, interested eyes. Ambient sound of warm breeze rustling palm leaves, gentle peaceful courtyard foley, soft distant murmurs, spatial authentic audio.`;

async function run() {
  const status = await getGpuStatus();
  console.log(`Current VRAM: ${status.vramFreeGb} GB free | GPU Ready: ${status.readyForH3}`);

  console.log("\nStarting Scene 1 Generation (768x1344, 49 frames, 20 steps)...");
  console.log(`Prompt: "${scene1Prompt.slice(0, 100)}..."\n`);

  try {
    const result = await generateVideo({
      prompt: scene1Prompt,
      width: 768,
      height: 1344,
      frames: 49,
      steps: 20,
      fps: 24,
      projectName: "ep13_sahl_sad",
      onProgress: (prog) => {
        const pct = prog.percent !== undefined ? `[${prog.percent}%]` : "";
        console.log(`-> ${prog.stage || "progress"}: ${prog.message || ""} ${pct}`);
      },
    });

    console.log("\n==============================================================");
    console.log("🎉 SCENE 1 GENERATION COMPLETE!");
    console.log(`Output Video Path: ${result.videoPath}`);
    console.log(`Duration: ${result.duration}s | Frames: ${result.frames} | FPS: ${result.fps}`);
    console.log("==============================================================");
  } catch (err) {
    console.error("\n[ERROR] Generation failed:", err);
  }
}

run();

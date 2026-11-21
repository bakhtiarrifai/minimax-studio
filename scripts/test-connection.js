import { getGpuStatus, prepareGpuForGeneration, releaseGpuVram } from "../src/gpu_sync.js";
import { COMFYUI_URL, OLLAMA_URL } from "../src/config.js";

console.log("==============================================================");
console.log("MiniMax H3 Studio — Connection & GPU Synchronizer Test");
console.log("==============================================================");

console.log(`\n1. Testing ComfyUI Connection (${COMFYUI_URL})...`);
try {
  const res = await fetch(`${COMFYUI_URL}/system_stats`, { signal: AbortSignal.timeout(3000) });
  if (res.ok) {
    const stats = await res.json();
    console.log(`   [OK] ComfyUI Version: ${stats.system?.comfyui_version || "connected"}`);
    console.log(`   [OK] PyTorch Device: ${stats.devices?.[0]?.name || "unknown"}`);
  } else {
    console.log(`   [FAIL] ComfyUI returned status ${res.status}`);
  }
} catch (err) {
  console.log(`   [FAIL] Could not connect to ComfyUI: ${err.message}`);
}

console.log(`\n2. Testing Ollama Connection (${OLLAMA_URL})...`);
try {
  const res = await fetch(`${OLLAMA_URL}/api/ps`, { signal: AbortSignal.timeout(2000) });
  if (res.ok) {
    const ps = await res.json();
    const models = (ps.models || []).map((m) => m.name);
    console.log(`   [OK] Ollama active models: ${models.length ? models.join(", ") : "None (VRAM clear)"}`);
  } else {
    console.log(`   [FAIL] Ollama returned status ${res.status}`);
  }
} catch (err) {
  console.log(`   [NOTE] Ollama not reachable: ${err.message}`);
}

console.log("\n3. Testing GPU Synchronizer Status...");
const status = await getGpuStatus();
console.log(`   VRAM Free: ${status.vramFreeGb} GB`);
console.log(`   ComfyUI Busy: ${status.comfyBusy}`);
console.log(`   Ready for MiniMax H3: ${status.readyForH3}`);

console.log("\n4. Testing GPU Vacate Coordination...");
const prep = await prepareGpuForGeneration();
console.log(`   Vacate Result: ${prep.success ? "SUCCESS" : "FAILED"} (${prep.method})`);

console.log("\n5. Testing ComfyUI VRAM Release...");
const rel = await releaseGpuVram();
console.log(`   Release Result: ${rel.success ? "SUCCESS" : "FAILED"}`);

console.log("\n==============================================================");
console.log("All connection and synchronization checks complete!");
console.log("==============================================================");

import { COMFYUI_URL, OLLAMA_URL } from "./config.js";

/**
 * Checks GPU status, VRAM availability, and running services.
 */
export async function getGpuStatus() {
  let vramFreeGb = null;
  let comfyBusy = false;
  let ollamaModels = [];

  // Check ComfyUI GPU sync status
  try {
    const res = await fetch(`${COMFYUI_URL}/gpu_sync/status`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      vramFreeGb = data.vram_free_gb;
      comfyBusy = (data.tasks_remaining || 0) > 0;
    }
  } catch (err) {
    // Fallback to standard system stats
    try {
      const res = await fetch(`${COMFYUI_URL}/system_stats`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        const dev = data.devices?.[0];
        if (dev) {
          vramFreeGb = Math.round((dev.vram_free / (1024 ** 3)) * 10) / 10;
        }
      }
    } catch {
      // ComfyUI may be down
    }
  }

  // Check Ollama models
  try {
    const res = await fetch(`${OLLAMA_URL}/api/ps`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      ollamaModels = (data.models || []).map((m) => m.name);
    }
  } catch {
    // Ollama not running
  }

  return {
    vramFreeGb,
    comfyBusy,
    ollamaModels,
    readyForH3: vramFreeGb === null || vramFreeGb >= 14.0 || ollamaModels.length > 0,
  };
}

/**
 * Prepares the GPU for MiniMax H3 generation by vacating any conflicting models from VRAM.
 */
export async function prepareGpuForGeneration() {
  // 1. Try ComfyUI GPU Sync endpoint first
  try {
    const res = await fetch(`${COMFYUI_URL}/gpu_sync/vacate_ollama`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      return { success: true, method: "comfy_gpu_sync" };
    }
  } catch {
    // Fall back to direct Ollama unload
  }

  // 2. Direct Ollama API unload
  try {
    const psRes = await fetch(`${OLLAMA_URL}/api/ps`, { signal: AbortSignal.timeout(2000) });
    if (psRes.ok) {
      const psData = await psRes.json();
      const models = psData.models || [];
      for (const m of models) {
        if (!m.name) continue;
        await fetch(`${OLLAMA_URL}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: m.name, keep_alive: 0 }),
          signal: AbortSignal.timeout(5000),
        });
      }
      return { success: true, method: "direct_ollama_unload" };
    }
  } catch {
    // Ollama not running or already clear
  }

  return { success: true, method: "noop" };
}

/**
 * Releases ComfyUI VRAM after generation so other applications can use the GPU.
 */
export async function releaseGpuVram() {
  try {
    const res = await fetch(`${COMFYUI_URL}/gpu_sync/free_comfy`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return await res.json();
  } catch {
    // Fallback to standard ComfyUI free endpoint
    try {
      const res = await fetch(`${COMFYUI_URL}/free`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unload_models: true, free_memory: true }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return { success: true };
    } catch {
      // ComfyUI may not be responding
    }
  }
  return { success: false };
}

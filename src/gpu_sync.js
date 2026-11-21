import { COMFYUI_URL, OLLAMA_URL } from "./config.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Fallback native GPU checker (NVIDIA nvidia-smi or AMD rocm-smi).
 */
async function getNativeGpuStats() {
  // 1. Try NVIDIA SMI (Windows / Linux RTX 3060)
  try {
    const { stdout } = await execAsync("nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits", { timeout: 2000 });
    const parts = stdout.trim().split(",").map((s) => s.trim());
    if (parts.length >= 3) {
      const name = parts[0];
      const totalMb = parseFloat(parts[1]);
      const freeMb = parseFloat(parts[2]);
      return {
        name,
        totalGb: Math.round((totalMb / 1024) * 10) / 10,
        freeGb: Math.round((freeMb / 1024) * 10) / 10,
        vendor: "nvidia",
      };
    }
  } catch {}

  // 2. Try ROCm SMI (AMD Linux)
  try {
    const { stdout } = await execAsync("rocm-smi --showmeminfo vram --json", { timeout: 2000 });
    const data = JSON.parse(stdout);
    const card = Object.values(data)[0];
    if (card && card["VRAM Total Memory (B)"]) {
      const totalB = Number(card["VRAM Total Memory (B)"]);
      const usedB = Number(card["VRAM Total Used Memory (B)"] || 0);
      return {
        name: "AMD ROCm GPU",
        totalGb: Math.round((totalB / (1024 ** 3)) * 10) / 10,
        freeGb: Math.round(((totalB - usedB) / (1024 ** 3)) * 10) / 10,
        vendor: "amd",
      };
    }
  } catch {}

  return null;
}

/**
 * Checks GPU status, VRAM availability, and running services.
 * Compatible with NVIDIA (RTX 3060 12GB) and AMD (RX 9060 XT 16GB) on Windows & Linux.
 */
export async function getGpuStatus() {
  let vramFreeGb = null;
  let vramTotalGb = null;
  let gpuName = null;
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
  } catch (err) {}

  // Check ComfyUI system stats
  try {
    const res = await fetch(`${COMFYUI_URL}/system_stats`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      const dev = data.devices?.[0];
      if (dev) {
        gpuName = dev.name;
        vramTotalGb = Math.round((dev.vram_total / (1024 ** 3)) * 10) / 10;
        if (vramFreeGb === null) {
          vramFreeGb = Math.round((dev.vram_free / (1024 ** 3)) * 10) / 10;
        }
      }
    }
  } catch {}

  // Fallback to native OS tools if ComfyUI is not providing GPU details
  if (vramFreeGb === null || vramTotalGb === null) {
    const native = await getNativeGpuStats();
    if (native) {
      gpuName = gpuName || native.name;
      vramTotalGb = vramTotalGb || native.totalGb;
      vramFreeGb = vramFreeGb ?? native.freeGb;
    }
  }

  // Check Ollama models
  try {
    const res = await fetch(`${OLLAMA_URL}/api/ps`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      ollamaModels = (data.models || []).map((m) => m.name);
    }
  } catch {}

  // Dynamic VRAM readiness threshold:
  // For RTX 3060 (12 GB): requires >= 9.5 GB free
  // For 16 GB+ GPUs: requires >= 13.5 GB free
  const threshold = vramTotalGb && vramTotalGb <= 12.5 ? 9.5 : 13.5;
  const readyForH3 = vramFreeGb === null || vramFreeGb >= threshold || ollamaModels.length > 0;

  return {
    gpuName,
    vramTotalGb,
    vramFreeGb,
    comfyBusy,
    ollamaModels,
    readyForH3,
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

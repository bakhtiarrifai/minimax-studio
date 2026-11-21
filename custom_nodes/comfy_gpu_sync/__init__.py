import logging
import threading
import time
import json
import urllib.request
import torch
import comfy.model_management
from server import PromptServer
from aiohttp import web

logger = logging.getLogger("ComfyGPUSync")

OLLAMA_API_BASE = "http://127.0.0.1:11434"
IDLE_COOLDOWN_SECONDS = 60

def vacate_ollama_models():
    """Unloads any active models in Ollama to free VRAM for ComfyUI."""
    try:
        req = urllib.request.Request(f"{OLLAMA_API_BASE}/api/ps", headers={"User-Agent": "ComfyGPUSync"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        
        models = data.get("models", [])
        if not models:
            return True, "No active Ollama models in VRAM."
        
        unloaded = []
        for m in models:
            name = m.get("name")
            if not name:
                continue
            payload = json.dumps({"model": name, "keep_alive": 0}).encode("utf-8")
            stop_req = urllib.request.Request(
                f"{OLLAMA_API_BASE}/api/generate",
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "ComfyGPUSync"}
            )
            with urllib.request.urlopen(stop_req, timeout=5.0) as stop_resp:
                pass
            unloaded.append(name)
        
        msg = f"Vacated Ollama models from VRAM: {', '.join(unloaded)}"
        logger.info(f"[GPUSync] {msg}")
        return True, msg
    except Exception as e:
        logger.debug(f"[GPUSync] Note: Ollama not reachable or no models to unload: {e}")
        return False, str(e)

def prompt_handler(json_data):
    """Fired whenever any workflow/prompt is submitted to ComfyUI."""
    try:
        # 1. Vacate Ollama models so ComfyUI has maximum VRAM headroom
        vacate_ollama_models()
        
        # 2. Free any orphaned allocations
        comfy.model_management.soft_empty_cache()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
            free_mem = comfy.model_management.get_free_memory() / (1024 ** 3)
            logger.info(f"[GPUSync] Pre-run VRAM check: {free_mem:.2f} GB free.")
    except Exception as e:
        logger.warning(f"[GPUSync] Error in prompt handler: {e}")
    return json_data

# Register with ComfyUI prompt server
try:
    PromptServer.instance.add_on_prompt_handler(prompt_handler)
    logger.info("[GPUSync] Prompt handler successfully registered.")
except Exception as e:
    logger.warning(f"[GPUSync] Failed to register prompt handler: {e}")

# Idle watcher thread
def _idle_worker():
    last_busy_time = time.time()
    has_unloaded = True

    while True:
        time.sleep(5)
        try:
            q = PromptServer.instance.prompt_queue
            tasks_remaining = q.get_tasks_remaining()
            
            if tasks_remaining > 0:
                last_busy_time = time.time()
                has_unloaded = False
            else:
                elapsed = time.time() - last_busy_time
                if elapsed >= IDLE_COOLDOWN_SECONDS and not has_unloaded:
                    logger.info(f"[GPUSync] ComfyUI idle for {int(elapsed)}s. Automatically unloading models to free VRAM for other server tasks...")
                    comfy.model_management.unload_all_models()
                    comfy.model_management.soft_empty_cache()
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                        torch.cuda.ipc_collect()
                    has_unloaded = True
                    logger.info("[GPUSync] ComfyUI VRAM released.")
        except Exception as e:
            pass

watcher_thread = threading.Thread(target=_idle_worker, daemon=True, name="ComfyGPUSyncIdleWatcher")
watcher_thread.start()

# API endpoints
routes = PromptServer.instance.routes

@routes.get("/gpu_sync/status")
async def get_gpu_sync_status(request):
    vram_free = comfy.model_management.get_free_memory() / (1024 ** 3) if torch.cuda.is_available() else 0
    tasks = PromptServer.instance.prompt_queue.get_tasks_remaining()
    return web.json_response({
        "status": "ok",
        "tasks_remaining": tasks,
        "vram_free_gb": round(vram_free, 2)
    })

@routes.post("/gpu_sync/vacate_ollama")
async def post_vacate_ollama(request):
    ok, msg = vacate_ollama_models()
    return web.json_response({"success": ok, "message": msg})

@routes.post("/gpu_sync/free_comfy")
async def post_free_comfy(request):
    comfy.model_management.unload_all_models()
    comfy.model_management.soft_empty_cache()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.ipc_collect()
    vram_free = comfy.model_management.get_free_memory() / (1024 ** 3) if torch.cuda.is_available() else 0
    return web.json_response({
        "success": True,
        "message": "ComfyUI models unloaded and memory freed.",
        "vram_free_gb": round(vram_free, 2)
    })

# Custom Node: Unload Model Before VAE Decode
class ComfyUnloadModelForVAE:
    """
    Forces the large DiT (Diffusion Transformer) model out of VRAM before VAE decoding starts.
    Crucial for AMD ROCm 16 GB VRAM GPUs to prevent out-of-address-space / hipErrorInvalidValue errors.
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "samples": ("LATENT",),
            },
            "optional": {
                "model": ("MODEL",),
            }
        }

    RETURN_TYPES = ("LATENT",)
    RETURN_NAMES = ("samples",)
    FUNCTION = "unload_and_pass"
    CATEGORY = "utils/gpu_sync"

    def unload_and_pass(self, samples, model=None):
        logger.info("[GPUSync] Unloading DiT model from VRAM before VAE decoding...")
        comfy.model_management.unload_all_models()
        comfy.model_management.soft_empty_cache()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
        return (samples,)

NODE_CLASS_MAPPINGS = {
    "ComfyUnloadModelForVAE": ComfyUnloadModelForVAE,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ComfyUnloadModelForVAE": "Unload Model (Pre-VAE Memory Guard)",
}

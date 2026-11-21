@echo off
setlocal

echo ==============================================================
echo       ComfyUI Launcher — RTX 3060 (12 GB VRAM) Optimized
echo ==============================================================
echo.
echo Recommended flags for RTX 3060 12GB:
echo   --lowvram (enables layer-by-layer offloading for 33B DiT model)
echo   --port 8188
echo.

:: Detect ComfyUI Portable if placed in parent or standard folder
if exist "..\python_embeded\python.exe" (
    cd ..
    .\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --lowvram --port 8188
) else if exist "C:\ComfyUI_windows_portable\python_embeded\python.exe" (
    cd /d C:\ComfyUI_windows_portable
    .\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --lowvram --port 8188
) else (
    echo [*] Running system Python...
    python main.py --lowvram --port 8188
)

pause

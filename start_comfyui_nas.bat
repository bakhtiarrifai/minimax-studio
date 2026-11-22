@echo off
setlocal
:: ComfyUI (RTX 3060) writing straight into GaiaNAS: Save Audio with prefix "audio/<episode>/..." lands in Z:\audio,
:: Save Image with prefix "images/<episode>/..." in Z:\images. Without Z: it falls back to ComfyUI's own output folder.
set OUT=
if exist Z:\audio (set OUT=--output-directory Z:\) else (echo [!] Z: is not mapped: run scripts\map_nas_drive.bat, or use scripts\sync_to_nas.ps1 afterwards.)
set ARGS=--windows-standalone-build --lowvram --listen 127.0.0.1 --port 8188 %OUT%
if exist "C:\Projects\ComfyUI\python_embeded\python.exe" (
    cd /d C:\Projects\ComfyUI
    .\python_embeded\python.exe -s ComfyUI\main.py %ARGS%
) else if exist "C:\ComfyUI_windows_portable\python_embeded\python.exe" (
    cd /d C:\ComfyUI_windows_portable
    .\python_embeded\python.exe -s ComfyUI\main.py %ARGS%
) else (
    echo ComfyUI Portable not found in C:\Projects\ComfyUI or C:\ComfyUI_windows_portable.
)
pause

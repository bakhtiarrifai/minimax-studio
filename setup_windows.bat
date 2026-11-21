@echo off
setlocal enabledelayedexpansion

echo ==============================================================
echo       MiniMax H3 Local Studio — Windows Setup (RTX 3060)
echo ==============================================================
echo.

:: 1. Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js is not installed or not in PATH!
    echo     Please download and install Node.js 18+ from: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [*] Node.js found: !NODE_VER!

:: 2. Install NPM dependencies
echo.
echo [*] Installing Studio Node.js dependencies (npm install)...
call npm install
if %errorlevel% neq 0 (
    echo [!] npm install failed!
    pause
    exit /b 1
)

:: 3. Check FFmpeg
echo.
where ffmpeg >nul 2>&1
if %errorlevel% equ 0 (
    echo [*] FFmpeg found in PATH.
) else (
    echo [!] Warning: FFmpeg not found in PATH.
    echo     If using ComfyUI Portable, we will automatically check python_embeded\Scripts\ffmpeg.exe.
    echo     You can also install FFmpeg via winget: winget install Gyan.FFmpeg
)

:: 4. Locate ComfyUI and install comfy_gpu_sync
echo.
echo [*] Looking for ComfyUI installation...
set COMFY_PATH=
if exist "..\ComfyUI\custom_nodes" set COMFY_PATH=..\ComfyUI
if exist "C:\ComfyUI_windows_portable\ComfyUI\custom_nodes" set COMFY_PATH=C:\ComfyUI_windows_portable\ComfyUI
if exist "D:\ComfyUI_windows_portable\ComfyUI\custom_nodes" set COMFY_PATH=D:\ComfyUI_windows_portable\ComfyUI
if exist "C:\ComfyUI\custom_nodes" set COMFY_PATH=C:\ComfyUI
if exist "D:\ComfyUI\custom_nodes" set COMFY_PATH=D:\ComfyUI

if "!COMFY_PATH!" neq "" (
    echo [*] Found ComfyUI at: !COMFY_PATH!
    echo [*] Copying comfy_gpu_sync custom node...
    if not exist "!COMFY_PATH!\custom_nodes\comfy_gpu_sync" mkdir "!COMFY_PATH!\custom_nodes\comfy_gpu_sync"
    xcopy /E /I /Y "custom_nodes\comfy_gpu_sync" "!COMFY_PATH!\custom_nodes\comfy_gpu_sync" >nul
    echo [*] comfy_gpu_sync installed successfully!
) else (
    echo [!] Note: ComfyUI custom_nodes folder not detected automatically.
    echo     Please manually copy the folder 'custom_nodes\comfy_gpu_sync'
    echo     into your ComfyUI's 'custom_nodes\' directory.
)

echo.
echo ==============================================================
echo Setup completed! Next steps:
echo 1. Run 'download_models_windows.bat' to download MiniMax H3 models (~42GB).
echo 2. Start ComfyUI with: 'python main.py --lowvram --port 8188'
echo 3. Run 'start_studio.bat' to open the Web Studio UI!
echo ==============================================================
echo.
pause

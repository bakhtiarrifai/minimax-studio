@echo off
setlocal enabledelayedexpansion

echo ==============================================================
echo       MiniMax H3 Model Downloader for Windows (RTX 3060)
echo ==============================================================
echo.
echo This script will download the required models from Comfy-Org/MiniMax-H3 (~42 GB total).
echo Models will be placed in your ComfyUI\models folder.
echo.

:: Check python
set PYTHON_BIN=python
if exist "C:\ComfyUI_windows_portable\python_embeded\python.exe" set PYTHON_BIN=C:\ComfyUI_windows_portable\python_embeded\python.exe
if exist "D:\ComfyUI_windows_portable\python_embeded\python.exe" set PYTHON_BIN=D:\ComfyUI_windows_portable\python_embeded\python.exe

echo [*] Using Python: !PYTHON_BIN!
!PYTHON_BIN! scripts\download_models.py %*

if %errorlevel% neq 0 (
    echo.
    echo [!] Download encountered an error or was interrupted.
    echo     You can re-run this script anytime; downloads will resume automatically.
)

pause

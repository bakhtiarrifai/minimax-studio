@echo off
setlocal
:: Audio worker for the multi-node pipeline: keeps ComfyUI's audio models (Stable Audio Open) and the Leda narration on
:: this PC, and delivers them to GaiaNAS for the Ubuntu node. Start ComfyUI first (start_comfyui_local.bat).
cd /d %~dp0
if "%MINIMAX_REMOTE_HOST%"=="" set MINIMAX_REMOTE_HOST=bakhtiar-server-ts
node scripts\audio_worker.mjs
pause

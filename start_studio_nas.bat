@echo off
setlocal
:: Web Studio on Windows using GaiaNAS (Z:) as shared storage. LAN access needs the login:
:: user "studio", password in %USERPROFILE%\.config\minimax-studio\password (generated on first start).
if exist Z:\audio (set MINIMAX_ASSETS_ROOT=Z:\) else (echo [!] Z: is not mapped; using the local minimax-studio-out folder.)
node src\studio.js
pause

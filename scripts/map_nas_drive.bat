@echo off
:: Maps GaiaNAS production_assets as Z: with a Samba user (Windows 11 requires SMB signing, so guest access fails).
:: One-time on the server first:  sudo smbpasswd -a bakhtiarrifai
setlocal
set NAS=\192.168.50.195\Gaia-NAS-All\production_assets
if exist Z:\ (echo Z: is already in use & exit /b 1)
net use Z: %NAS% /user:bakhtiarrifai /persistent:yes
if errorlevel 1 (echo Mapping failed. Check the Samba password on the server. & exit /b 1)
for %%d in (audio images videos final) do if not exist Z:\%%d mkdir Z:\%%d
echo Z: = %NAS%

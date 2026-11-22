# Node A (Windows) -> GaiaNAS over SSH, for when the Z: drive is not mapped.
# Copies new audio and images from the Windows ComfyUI output (and any extra folder) to production_assets on the server.
#   powershell -File scripts\sync_to_nas.ps1 -Episode ep15_mahmud
#   powershell -File scripts\sync_to_nas.ps1 -Episode ep15_mahmud -Extra "C:\Users\me\flow-studio-out\ep15\vo_id.wav"
param(
  [Parameter(Mandatory = $true)][string]$Episode,
  [string]$ComfyOutput = "C:\Projects\ComfyUI\ComfyUI\output",
  [string]$SshHost = "bakhtiar-server-ts",
  [string]$Remote = "/mnt/gaia/production_assets",
  [string[]]$Extra = @()
)
$ErrorActionPreference = "Stop"
if ($Episode -notmatch '^[A-Za-z0-9._-]+$') { throw "Episode must be a plain folder name" }
$audio = @(Get-ChildItem -Path (Join-Path $ComfyOutput "audio") -File -Include *.wav, *.mp3, *.flac -Recurse -ErrorAction SilentlyContinue)
$images = @(Get-ChildItem -Path (Join-Path $ComfyOutput "images") -File -Include *.png, *.jpg, *.webp -Recurse -ErrorAction SilentlyContinue)
foreach ($e in $Extra) {
  $item = Get-Item $e
  if ($item.Extension -in ".wav", ".mp3", ".flac", ".m4a") { $audio += $item } else { $images += $item }
}
# One SSH connection to create the folders, one per kind to copy: the server resets bursts of quick connections.
ssh -o BatchMode=yes $SshHost "mkdir -p '$Remote/audio/$Episode' '$Remote/images/$Episode'"
if ($audio.Count) { scp -o BatchMode=yes -p @($audio.FullName) "${SshHost}:$Remote/audio/$Episode/" }
if ($images.Count) { scp -o BatchMode=yes -p @($images.FullName) "${SshHost}:$Remote/images/$Episode/" }
"{0} audio and {1} image file(s) copied to {2}:{3}/(audio|images)/{4}/" -f $audio.Count, $images.Count, $SshHost, $Remote, $Episode

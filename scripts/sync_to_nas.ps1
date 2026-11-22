# Node A (Windows) -> GaiaNAS over SSH, for when the Z: drive is not mapped.
# Copies audio and images from the Windows ComfyUI output (and any extra files) to production_assets on the server.
#   powershell -File scripts\sync_to_nas.ps1 -Episode ep15_mahmud
#   powershell -File scripts\sync_to_nas.ps1 -Episode ep15_mahmud -Extra "C:\path\vo_id.wav;C:\path\frame-01.png"
param(
  [Parameter(Mandatory = $true)][string]$Episode,
  [string]$ComfyOutput = "C:\Projects\ComfyUI\ComfyUI\output",
  [string]$Extra = "",
  [string]$SshHost = "bakhtiar-server-ts",
  [string]$Remote = "/mnt/gaia/production_assets"
)
$ErrorActionPreference = "Stop"
if ($Episode -notmatch '^[A-Za-z0-9._-]+$') { throw "Episode must be a plain folder name" }
$audioExt = ".wav", ".mp3", ".flac", ".m4a"
$imageExt = ".png", ".jpg", ".jpeg", ".webp"
$audio = @()
$images = @()
foreach ($kind in "audio", "images") {
  $dir = Join-Path $ComfyOutput $kind
  if (Test-Path $dir) {
    $files = Get-ChildItem -Path $dir -File -Recurse
    if ($kind -eq "audio") { $audio += $files | Where-Object { $audioExt -contains $_.Extension.ToLower() } }
    else { $images += $files | Where-Object { $imageExt -contains $_.Extension.ToLower() } }
  }
}
foreach ($e in ($Extra -split ";" | Where-Object { $_.Trim() })) {
  $item = Get-Item -LiteralPath $e.Trim()
  if ($audioExt -contains $item.Extension.ToLower()) { $audio += $item }
  elseif ($imageExt -contains $item.Extension.ToLower()) { $images += $item }
  else { throw "Not an audio or image file: $($item.FullName)" }
}
if (-not ($audio.Count + $images.Count)) { "Nothing to copy."; exit 0 }

# One SSH connection to create the folders, one per kind to copy: the server resets bursts of quick connections.
ssh -o BatchMode=yes $SshHost "mkdir -p '$Remote/audio/$Episode' '$Remote/images/$Episode'"
if ($LASTEXITCODE) { throw "ssh $SshHost failed ($LASTEXITCODE)" }
if ($audio.Count) {
  scp -o BatchMode=yes -p @($audio.FullName) "${SshHost}:$Remote/audio/$Episode/"
  if ($LASTEXITCODE) { throw "copying audio failed ($LASTEXITCODE)" }
}
if ($images.Count) {
  scp -o BatchMode=yes -p @($images.FullName) "${SshHost}:$Remote/images/$Episode/"
  if ($LASTEXITCODE) { throw "copying images failed ($LASTEXITCODE)" }
}
"{0} audio and {1} image file(s) copied to {2}:{3}/(audio|images)/{4}/" -f $audio.Count, $images.Count, $SshHost, $Remote, $Episode

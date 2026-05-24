#Requires -Version 5.1
$ErrorActionPreference = "Stop"

# ========== VPS config ==========
$RemoteUser = "root"
$RemoteHost = "68.168.135.59"
$RemotePort = 27361
$RemoteDir  = "/var/www/linux-kernel-notes"
# ================================

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$DistDir    = Join-Path $ProjectDir "docs\.vitepress\dist"

Set-Location $ProjectDir

foreach ($cmd in @("ssh", "scp")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "Command not found: $cmd. Enable OpenSSH Client in Windows Optional Features."
    }
}

Write-Host "[deploy] Building VitePress..."
npm run docs:build

if (-not (Test-Path $DistDir)) {
    throw "Build output not found: $DistDir"
}

$remote = "$RemoteUser@$RemoteHost"

Write-Host "[deploy] Preparing remote directory $RemoteHost`:$RemotePort -> $RemoteDir"
& ssh -p $RemotePort $remote "mkdir -p $RemoteDir; rm -rf ${RemoteDir}/*"

Write-Host "[deploy] Uploading to $RemoteHost`:$RemotePort -> $RemoteDir"
& scp -P $RemotePort -r (Join-Path $DistDir "*") "$remote`:${RemoteDir}/"

Write-Host "[deploy] Done"

#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$DistDir    = Join-Path $ProjectDir "docs\.vitepress\dist"
$EnvFile    = Join-Path $ScriptDir "deploy.local.env"

function Import-DeployEnv {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        throw @"
Missing deploy config: $Path
Copy the template and edit your VPS settings:
  Copy-Item scripts/deploy.example.env scripts/deploy.local.env
"@
    }

    $vars = @{}
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        $eq = $line.IndexOf("=")
        if ($eq -lt 1) { return }
        $key = $line.Substring(0, $eq).Trim()
        $val = $line.Substring($eq + 1).Trim()
        $vars[$key] = $val
    }

    foreach ($name in @("REMOTE_USER", "REMOTE_HOST", "REMOTE_PORT", "REMOTE_DIR")) {
        if (-not $vars.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($vars[$name])) {
            throw "deploy.local.env missing required key: $name"
        }
    }

    return $vars
}

$env = Import-DeployEnv -Path $EnvFile
$RemoteUser = $env["REMOTE_USER"]
$RemoteHost = $env["REMOTE_HOST"]
$RemotePort = $env["REMOTE_PORT"]
$RemoteDir  = $env["REMOTE_DIR"]

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

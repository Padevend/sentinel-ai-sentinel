# Sentinel Official Installer for Windows (PowerShell)
# Usage: irm https://raw.githubusercontent.com/sentinel-ai/sentinel/main/distribution/install.ps1 | iex

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "  🛡️  SENTINEL — AI Software Engineering Agent" -ForegroundColor Cyan
Write-Host "      Autonomous Architecture & Development Runtime" -ForegroundColor DarkCyan
Write-Host ""

# 1. Detect Architecture
$arch = if ([System.Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
    $arch = "arm64"
}

$sentinelHome = Join-Path $env:USERPROFILE ".sentinel"
$binDir = Join-Path $sentinelHome "bin"
$configDir = Join-Path $sentinelHome "config"
$dataDir = Join-Path $sentinelHome "data"
$cacheDir = Join-Path $sentinelHome "cache"
$logsDir = Join-Path $sentinelHome "logs"

# Ensure runtime directories
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$version = if ($env:SENTINEL_VERSION) { $env:SENTINEL_VERSION } else { "latest" }
$repo = "sentinel-ai/sentinel"

$releaseUrl = if ($version -eq "latest") {
    "https://github.com/$repo/releases/latest/download"
} else {
    "https://github.com/$repo/releases/download/v$version"
}

$zipName = "sentinel-windows-$arch.zip"
$downloadUrl = "$releaseUrl/$zipName"
$tempZip = Join-Path ([System.IO.Path]::GetTempPath()) "sentinel-install-$arch.zip"

Write-Host "Detected Platform: Windows-$arch" -ForegroundColor Gray
Write-Host "Installing to: $binDir" -ForegroundColor Gray
Write-Host "Downloading Sentinel ($version)..." -ForegroundColor Yellow

$downloaded = $false
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -UseBasicParsing
    $downloaded = $true
} catch {
    Write-Host "Release download skipped (fallback mode). Checking npm..." -ForegroundColor DarkYellow
}

if ($downloaded -and (Test-Path $tempZip)) {
    Expand-Archive -Path $tempZip -DestinationPath $binDir -Force
    Remove-Item -Force $tempZip -ErrorAction SilentlyContinue
} else {
    # Fallback to npm global install if available
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        Write-Host "Installing @sentinel/cli globally via npm..." -ForegroundColor Cyan
        npm install -g @sentinel/cli
    } else {
        Write-Host "Error: Could not download binary and npm is not found in PATH." -ForegroundColor Red
        exit 1
    }
}

# 2. Add to User PATH
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$binDir*") {
    $newUserPath = "$userPath;$binDir"
    [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
    $env:Path = "$env:Path;$binDir"
    Write-Host "Added $binDir to User Environment PATH." -ForegroundColor Green
}

Write-Host ""
Write-Host "✓ Sentinel installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "To get started:" -ForegroundColor White
Write-Host "  1. Open a new PowerShell / Terminal window" -ForegroundColor Gray
Write-Host "  2. Navigate to your project: cd C:\path\to\project" -ForegroundColor Gray
Write-Host "  3. Launch Sentinel: sentinel" -ForegroundColor Cyan
Write-Host ""

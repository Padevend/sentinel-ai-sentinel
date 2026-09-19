# Sentinel installer for Windows PowerShell.

$ErrorActionPreference = 'Stop'

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw 'Node.js 20 or newer is required. Install Node.js first.'
}
$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) {
    throw "Node.js 20 or newer is required. Found $(node --version)."
}

$arch = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { $arch = 'arm64' }

$sentinelHome = Join-Path $env:USERPROFILE '.sentinel'
$binDir = Join-Path $sentinelHome 'bin'
foreach ($directory in @(
    $binDir,
    (Join-Path $sentinelHome 'config'),
    (Join-Path $sentinelHome 'data'),
    (Join-Path $sentinelHome 'cache'),
    (Join-Path $sentinelHome 'logs')
)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

$version = if ($env:SENTINEL_VERSION) { $env:SENTINEL_VERSION } else { 'latest' }
$repo = if ($env:SENTINEL_REPO) { $env:SENTINEL_REPO } else { 'Padevend/sentinel-ai-sentinel' }
$releaseUrl = if ($version -eq 'latest') {
    "https://github.com/$repo/releases/latest/download"
} else {
    "https://github.com/$repo/releases/download/v$version"
}

$zipName = "sentinel-windows-$arch.zip"
$downloadUrl = "$releaseUrl/$zipName"
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("sentinel-install-" + [Guid]::NewGuid().ToString('N'))
$tempZip = Join-Path $tempRoot $zipName
$tempChecksum = Join-Path $tempRoot 'SHA256SUMS'
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

try {
    Write-Host "Installing Sentinel $version for Windows-$arch to $binDir"
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -UseBasicParsing
    Invoke-WebRequest -Uri "$releaseUrl/SHA256SUMS" -OutFile $tempChecksum -UseBasicParsing

    $expectedLine = Get-Content $tempChecksum | Where-Object {
        $_ -match ("\s" + [regex]::Escape($zipName) + '$')
    } | Select-Object -First 1
    $expectedHash = if ($expectedLine) { ($expectedLine -split '\s+')[0].ToLowerInvariant() } else { '' }
    $actualHash = (Get-FileHash -Path $tempZip -Algorithm SHA256).Hash.ToLowerInvariant()
    if (-not $expectedHash -or $expectedHash -ne $actualHash) {
        throw 'Release checksum verification failed.'
    }

    Expand-Archive -Path $tempZip -DestinationPath $binDir -Force
} finally {
    if (Test-Path $tempRoot) {
        Remove-Item -Recurse -Force $tempRoot -ErrorAction SilentlyContinue
    }
}

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -notlike "*$binDir*") {
    $newUserPath = if ([string]::IsNullOrWhiteSpace($userPath)) { $binDir } else { "$userPath;$binDir" }
    [Environment]::SetEnvironmentVariable('Path', $newUserPath, 'User')
    $env:Path = "$env:Path;$binDir"
}

Write-Host 'Sentinel installed successfully.' -ForegroundColor Green
Write-Host 'Open a new PowerShell window, then run: sentinel --version'

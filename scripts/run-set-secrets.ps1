$inp = "protocol=https" + [Environment]::NewLine + "host=github.com" + [Environment]::NewLine
$cred = $inp | git credential-manager get 2>$null
$tok = ((($cred -split [Environment]::NewLine) | Where-Object { $_ -like 'password=*' } | Select-Object -First 1).Substring(9)).Trim()
$env:GITHUB_BEARER_TOKEN = $tok
Write-Host "token len=$($tok.Length) prefix=$($tok.Substring(0,8))"
# install libsodium-wrappers locally (one-time)
$cacheDir = Join-Path $env:LOCALAPPDATA 'sunpath-libsodium'
if (-not (Test-Path (Join-Path $cacheDir 'node_modules/libsodium-wrappers/package.json'))) {
    Write-Host "==> installing libsodium-wrappers (one-time, into $cacheDir)" -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
    Push-Location $cacheDir
    try {
        if (-not (Test-Path 'package.json')) { '{ "name": "tmp", "version": "1.0.0", "private": true, "type": "module" }' | Out-File -Encoding utf8 'package.json' }
        npm install --no-audit --no-fund libsodium-wrappers@0.7.13 2>&1 | Out-Host
    } finally { Pop-Location }
}
# Run from cacheDir so node resolves libsodium-wrappers from its node_modules.
$repoRoot = (Resolve-Path '.').Path
$env:SUNPATH_REPO_ROOT = $repoRoot
Copy-Item -Force "./scripts/github-set-secrets.mjs" (Join-Path $cacheDir 'github-set-secrets.mjs')
Push-Location $cacheDir
try {
    node ./github-set-secrets.mjs
} finally { Pop-Location }

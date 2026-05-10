# Sunpath: patch Supabase Auth redirect URLs so sunpath.dev magic-link works.
# Must be run after DNS is live and GH Pages is serving the domain.
#
# Usage (from repo root):
#   pwsh ./scripts/fix-auth-redirects.ps1

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$secretsPath = Join-Path $repoRoot '.secrets.local'

if (-not (Test-Path $secretsPath)) {
    Write-Error ".secrets.local not found at $secretsPath"
}

$secrets = @{}
foreach ($line in Get-Content $secretsPath) {
    $trim = $line.Trim()
    if (-not $trim -or $trim.StartsWith('#')) { continue }
    $eq = $trim.IndexOf('=')
    if ($eq -lt 1) { continue }
    $key = $trim.Substring(0, $eq).Trim()
    $val = $trim.Substring($eq + 1).Trim()
    if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
    $secrets[$key] = $val
}

$ref   = $secrets['SUPABASE_PROJECT_REF']
$token = $secrets['SUPABASE_ACCESS_TOKEN']

if (-not $ref -or -not $token) {
    Write-Error "Missing SUPABASE_PROJECT_REF or SUPABASE_ACCESS_TOKEN in .secrets.local"
}

$headers = @{
    Authorization  = "Bearer $token"
    'Content-Type' = 'application/json'
}

$body = @{
    SITE_URL               = 'https://sunpath.dev'
    URI_ALLOW_LIST         = 'https://sunpath.dev/**,http://localhost:5173/**'
} | ConvertTo-Json -Compress

Write-Host "==> patching Supabase Auth URL config for project $ref" -ForegroundColor Cyan
$resp = Invoke-WebRequest `
    -Uri "https://api.supabase.com/v1/projects/$ref/config/auth" `
    -Method PATCH `
    -Headers $headers `
    -Body $body `
    -UseBasicParsing

if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300) {
    Write-Host "==> done. Site URL = https://sunpath.dev, redirects allow sunpath.dev + localhost:5173" -ForegroundColor Green
} else {
    Write-Error "API returned $($resp.StatusCode): $($resp.Content)"
}

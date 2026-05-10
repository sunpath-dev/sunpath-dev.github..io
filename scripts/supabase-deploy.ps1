# Sunpath: one-shot Supabase deploy from a local machine.
# Reads .secrets.local at the repo root, links the project, applies all
# migrations, and deploys all edge functions. Use this any time you change
# anything under supabase/ until/unless the GitHub Actions workflow is
# enabled with proper secrets.
#
# Usage (from repo root):
#   pwsh ./scripts/supabase-deploy.ps1
#   pwsh ./scripts/supabase-deploy.ps1 -SkipFunctions
#   pwsh ./scripts/supabase-deploy.ps1 -SkipMigrations

[CmdletBinding()]
param(
    [switch]$SkipMigrations,
    [switch]$SkipFunctions
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$secretsPath = Join-Path $repoRoot '.secrets.local'

if (-not (Test-Path $secretsPath)) {
    Write-Error ".secrets.local not found at $secretsPath. See README for the format."
}

$secrets = @{}
foreach ($line in Get-Content $secretsPath) {
    $trim = $line.Trim()
    if (-not $trim -or $trim.StartsWith('#')) { continue }
    $eq = $trim.IndexOf('=')
    if ($eq -lt 1) { continue }
    $key = $trim.Substring(0, $eq).Trim()
    $val = $trim.Substring($eq + 1).Trim()
    if ($val.StartsWith('"') -and $val.EndsWith('"')) {
        $val = $val.Substring(1, $val.Length - 2)
    }
    $secrets[$key] = $val
}

foreach ($required in 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF', 'SUPABASE_DB_PASSWORD') {
    if (-not $secrets.ContainsKey($required) -or -not $secrets[$required]) {
        Write-Error "Missing $required in .secrets.local"
    }
}

$ref      = $secrets['SUPABASE_PROJECT_REF']
$password = $secrets['SUPABASE_DB_PASSWORD']
$env:SUPABASE_ACCESS_TOKEN = $secrets['SUPABASE_ACCESS_TOKEN']

Push-Location $repoRoot
try {
    Write-Host "==> linking supabase project $ref" -ForegroundColor Cyan
    npx --yes supabase@latest link --project-ref $ref --password $password | Out-Host

    if (-not $SkipMigrations) {
        Write-Host "==> pushing migrations" -ForegroundColor Cyan
        npx --yes supabase@latest db push --password $password --include-all | Out-Host
    } else {
        Write-Host "==> skipping migrations (per -SkipMigrations)" -ForegroundColor Yellow
    }

    if (-not $SkipFunctions) {
        Write-Host "==> deploying edge functions" -ForegroundColor Cyan
        npx --yes supabase@latest functions deploy --project-ref $ref | Out-Host
    } else {
        Write-Host "==> skipping functions (per -SkipFunctions)" -ForegroundColor Yellow
    }

    Write-Host "==> reloading PostgREST schema cache" -ForegroundColor Cyan
    $reloadBody = @{ query = "do `$do`$ begin execute 'comment on schema public is ''reload-' || extract(epoch from now())::text || ''''; end `$do`$; notify pgrst, 'reload schema';" } | ConvertTo-Json -Compress
    $headers = @{ Authorization = "Bearer $($secrets['SUPABASE_ACCESS_TOKEN'])"; 'Content-Type' = 'application/json' }
    Invoke-WebRequest -Uri "https://api.supabase.com/v1/projects/$ref/database/query" -Method POST -Headers $headers -Body $reloadBody -UseBasicParsing | Out-Null

    Write-Host "==> done" -ForegroundColor Green
}
finally {
    Pop-Location
}

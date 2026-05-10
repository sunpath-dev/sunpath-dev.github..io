$inp = "protocol=https" + [Environment]::NewLine + "host=github.com" + [Environment]::NewLine
function Get-Tok {
    $cred = $script:inp | git credential-manager get 2>$null
    return ((($cred -split [Environment]::NewLine) | Where-Object { $_ -like 'password=*' } | Select-Object -First 1).Substring(9)).Trim()
}
$repo = 'sunpath-dev/sunpath-dev.github.io'

for ($i = 1; $i -le 20; $i++) {
    $tok = Get-Tok
    $h = @{ Authorization = "Bearer $tok"; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version'='2022-11-28'; 'User-Agent'='sunpath' }
    $runs = Invoke-RestMethod -Headers $h -Uri "https://api.github.com/repos/$repo/actions/workflows/supabase.yml/runs?per_page=2&event=workflow_dispatch"
    $latest = $runs.workflow_runs | Select-Object -First 1
    if (-not $latest) { "no dispatch run yet"; Start-Sleep -Seconds 5; continue }
    "[$i] id=$($latest.id) status=$($latest.status) conclusion=$($latest.conclusion) url=$($latest.html_url)"
    if ($latest.status -eq 'completed') {
        "==> jobs:"
        $jobs = Invoke-RestMethod -Headers $h -Uri "https://api.github.com/repos/$repo/actions/runs/$($latest.id)/jobs"
        foreach ($j in $jobs.jobs) {
            "  job '$($j.name)' status=$($j.status) conclusion=$($j.conclusion)"
            foreach ($s in $j.steps) {
                "    step '$($s.name)' status=$($s.status) conclusion=$($s.conclusion)"
            }
        }
        break
    }
    Start-Sleep -Seconds 10
}

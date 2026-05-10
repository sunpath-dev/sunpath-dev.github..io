$inp = "protocol=https" + [Environment]::NewLine + "host=github.com" + [Environment]::NewLine
$cred = $inp | git credential-manager get 2>$null
$tok = ((($cred -split [Environment]::NewLine) | Where-Object { $_ -like 'password=*' } | Select-Object -First 1).Substring(9)).Trim()
$h = @{ Authorization = "Bearer $tok"; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version'='2022-11-28'; 'User-Agent'='sunpath'; 'Content-Type'='application/json' }
try {
    $r = Invoke-WebRequest -UseBasicParsing -Method Post -Headers $h -Uri 'https://api.github.com/repos/sunpath-dev/sunpath-dev.github.io/actions/workflows/supabase.yml/dispatches' -Body '{"ref":"main"}'
    "dispatch STATUS=$($r.StatusCode)"
} catch {
    "dispatch ERR=$($_.Exception.Message)"
    if ($_.ErrorDetails) { $_.ErrorDetails.Message }
}

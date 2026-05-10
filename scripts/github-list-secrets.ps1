$inp = "protocol=https" + [Environment]::NewLine + "host=github.com" + [Environment]::NewLine
$cred = $inp | git credential-manager get 2>$null
$tok = ((($cred -split [Environment]::NewLine) | Where-Object { $_ -like 'password=*' } | Select-Object -First 1).Substring(9)).Trim()
$h = @{ Authorization = "Bearer $tok"; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version'='2022-11-28'; 'User-Agent'='probe' }
$base = 'https://api.github.com/repos/sunpath-dev/sunpath-dev.github..io'

Write-Host "== variables ==" -ForegroundColor Cyan
(Invoke-RestMethod -Headers $h -Uri "$base/actions/variables").variables | ForEach-Object { "  $($_.name) = $($_.value)" }

Write-Host "== secrets ==" -ForegroundColor Cyan
(Invoke-RestMethod -Headers $h -Uri "$base/actions/secrets").secrets | ForEach-Object { "  $($_.name)" }

$results = @()
for ($i = 1; $i -le 5; $i++) {
    Write-Host "================== TEST RUN $i =================="
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    pnpm --filter @finvault/web build
    $code = $LASTEXITCODE
    $sw.Stop()
    $results += [PSCustomObject]@{
        Run = $i
        ExitCode = $code
        DurationMs = $sw.ElapsedMilliseconds
    }
    Write-Host "RUN $i FINISHED WITH EXIT CODE: $code (Duration: $($sw.ElapsedMilliseconds) ms)"
}

Write-Host "================== SUMMARY =================="
$results | Format-Table -AutoSize

$ErrorActionPreference = "Continue"

Write-Host "Running 5 additional rapid back-to-back warm builds..." -ForegroundColor Cyan

$hasModuleNotFound = $false
$hasEnoent = $false
$hasEperm = $false
$totalRuns = 5
$passedRuns = 0

for ($i = 1; $i -le $totalRuns; $i++) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $output = & pnpm --filter @finvault/web build 2>&1 | Out-String
    $ec = $LASTEXITCODE
    $sw.Stop()
    $duration = $sw.ElapsedMilliseconds

    $mnf = $output -match "MODULE_NOT_FOUND"
    $eno = $output -match "ENOENT"
    $eperm = $output -match "EPERM"

    if ($mnf) { $hasModuleNotFound = $true }
    if ($eno) { $hasEnoent = $true }
    if ($eperm) { $hasEperm = $true }

    if ($ec -eq 0 -and -not $mnf -and -not $eno -and -not $eperm) {
        $passedRuns++
        Write-Host "  [PASS] Run $i/$totalRuns - ExitCode=0, Duration=${duration}ms, Errors=None" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Run $i/$totalRuns - ExitCode=$ec, Duration=${duration}ms, MNF=$mnf, ENOENT=$eno, EPERM=$eperm" -ForegroundColor Red
        Write-Host $output
    }
}

Write-Host "`nSummary of Warm Stress Invocations:" -ForegroundColor Cyan
Write-Host "Total Runs: $totalRuns, Passed: $passedRuns"
Write-Host "Any MODULE_NOT_FOUND: $hasModuleNotFound"
Write-Host "Any ENOENT: $hasEnoent"
Write-Host "Any EPERM: $hasEperm"

if ($passedRuns -eq $totalRuns) {
    Write-Host "ALL $totalRuns RUNS PASSED CLEANLY WITH ZERO CRITICAL ERRORS!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "FLAKINESS OR ERROR DETECTED!" -ForegroundColor Red
    exit 1
}

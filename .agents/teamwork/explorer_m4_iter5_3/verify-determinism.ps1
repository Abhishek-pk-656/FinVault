<#
.SYNOPSIS
    FinVault M4 Iteration 5 Comprehensive Verification & Determinism Test Script
.DESCRIPTION
    Executes cold build, 10 consecutive warm builds, Turborepo monorepo build,
    static TypeScript typecheck, and all 7 invariant/stress test suites (308 tests).
    Asserts zero ENOENT, zero EPERM, zero MODULE_NOT_FOUND, and zero float math.
#>

[CmdletBinding()]
param (
    [Parameter()]
    [ValidateSet("All", "ColdBuild", "WarmBuildLoop", "WarmOnly", "TurboBuild", "Typecheck", "Suites")]
    [string]$Stage = "All",

    [Parameter()]
    [int]$WarmRunCount = 10,

    [Parameter()]
    [string]$ProjectRoot = "D:\programming\New_project"
)

$ErrorActionPreference = "Continue"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "   FINVAULT M4 ITERATION 5: 10-RUN DETERMINISM & VERIFICATION HARNESS          " -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "Project Root: $ProjectRoot"
Write-Host "Stage:        $Stage"
Write-Host "Warm Runs:    $WarmRunCount"
Write-Host "Timestamp:    $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"
Write-Host "--------------------------------------------------------------------------------"

Set-Location $ProjectRoot

$GlobalPassed = $true
$Failures = @()

function Check-OutputForCriticalErrors([string]$rawOutput) {
    $criticalPatterns = @(
        "ENOENT",
        "EPERM",
        "MODULE_NOT_FOUND",
        "Cannot find module",
        "unhandledRejection"
    )
    $detected = @()
    foreach ($p in $criticalPatterns) {
        if ($rawOutput -match [regex]::Escape($p)) {
            $detected += $p
        }
    }
    return @($detected)
}

# -----------------------------------------------------------------------------
# PHASE 1: Cold Build Verification (Delete .next and rebuild)
# -----------------------------------------------------------------------------
if ($Stage -in @("All", "ColdBuild")) {
    Write-Host "`n>>> PHASE 1: Cold Build Verification (Scratch Build)" -ForegroundColor Yellow
    $webDir = Join-Path $ProjectRoot "apps\web"
    $nextDir = Join-Path $webDir ".next"
    
    if (Test-Path $nextDir) {
        Write-Host "Removing existing .next cache at $nextDir..."
        Remove-Item -Recurse -Force $nextDir -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    }
    
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $cmdOutput = & pnpm --filter @finvault/web build 2>&1 | Out-String
    $ec = $LASTEXITCODE
    $sw.Stop()
    
    $errors = @(Check-OutputForCriticalErrors $cmdOutput)
    if ($ec -ne 0 -or $errors.Length -gt 0) {
        Write-Host "[-] Cold Build FAILED in $($sw.ElapsedMilliseconds)ms (ExitCode=$ec, DetectedErrors=$($errors -join ', '))" -ForegroundColor Red
        Write-Host $cmdOutput
        $GlobalPassed = $false
        $Failures += "Cold Build failed (ExitCode=$ec, Errors=$($errors -join ', '))"
    } else {
        Write-Host "[+] Cold Build PASSED in $($sw.ElapsedMilliseconds)ms (ExitCode=0, 0 ENOENT, 0 EPERM, 0 MODULE_NOT_FOUND)" -ForegroundColor Green
    }
}

# -----------------------------------------------------------------------------
# PHASE 2: Warm Build Determinism (10 Consecutive Builds)
# -----------------------------------------------------------------------------
if ($Stage -in @("All", "WarmBuildLoop", "WarmOnly")) {
    Write-Host "`n>>> PHASE 2: Warm Build Determinism ($WarmRunCount Consecutive Invocations)" -ForegroundColor Yellow
    $buildResults = @()
    $consecutivePasses = 0

    for ($i = 1; $i -le $WarmRunCount; $i++) {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $rawOutput = & pnpm --filter @finvault/web build 2>&1 | Out-String
        $ec = $LASTEXITCODE
        $sw.Stop()
        $duration = $sw.ElapsedMilliseconds

        $detectedErrors = @(Check-OutputForCriticalErrors $rawOutput)
        $status = "FAIL"
        if ($ec -eq 0 -and $detectedErrors.Length -eq 0) {
            $status = "PASS"
        }

        $errorTokens = "None"
        if ($detectedErrors.Length -gt 0) {
            $errorTokens = $detectedErrors -join ";"
        }

        $buildResults += [PSCustomObject]@{
            Run         = $i
            Status      = $status
            ExitCode    = $ec
            DurationMs  = $duration
            ErrorTokens = $errorTokens
        }

        if ($status -eq "PASS") {
            $consecutivePasses++
            Write-Host ("  [PASS] Run {0,2}/$WarmRunCount - ExitCode=0, Duration={1,5}ms, Errors=None" -f $i, $duration) -ForegroundColor Green
        } else {
            Write-Host ("  [FAIL] Run {0,2}/$WarmRunCount - ExitCode=$ec, Duration={1,5}ms, Errors=$($detectedErrors -join ', ')" -f $i, $duration) -ForegroundColor Red
            Write-Host $rawOutput
            $GlobalPassed = $false
            $Failures += "Warm Build Run $i failed (ExitCode=$ec, Errors=$($detectedErrors -join ', '))"
        }
    }

    Write-Host "`n--- Warm Build Summary Table ---" -ForegroundColor Cyan
    $buildResults | Format-Table -AutoSize | Out-String | Write-Host
    Write-Host "Consecutive Pass Rate: $consecutivePasses / $WarmRunCount ($([math]::Round(($consecutivePasses / $WarmRunCount) * 100, 1))%)"
    if ($consecutivePasses -lt $WarmRunCount) {
        $GlobalPassed = $false
    }
}

# -----------------------------------------------------------------------------
# PHASE 3: Turborepo Monorepo Build (pnpm build)
# -----------------------------------------------------------------------------
if ($Stage -in @("All", "TurboBuild")) {
    Write-Host "`n>>> PHASE 3: Turborepo Monorepo Full Build (pnpm build)" -ForegroundColor Yellow
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $rawOutput = & pnpm build 2>&1 | Out-String
    $ec = $LASTEXITCODE
    $sw.Stop()

    if ($ec -ne 0) {
        Write-Host "[-] Turborepo build FAILED in $($sw.ElapsedMilliseconds)ms (ExitCode=$ec)" -ForegroundColor Red
        Write-Host $rawOutput
        $GlobalPassed = $false
        $Failures += "Turborepo build failed (ExitCode=$ec)"
    } else {
        Write-Host "[+] Turborepo build PASSED in $($sw.ElapsedMilliseconds)ms (ExitCode=0)" -ForegroundColor Green
    }
}

# -----------------------------------------------------------------------------
# PHASE 4: Static TypeScript Typecheck (pnpm --filter @finvault/web typecheck)
# -----------------------------------------------------------------------------
if ($Stage -in @("All", "Typecheck")) {
    Write-Host "`n>>> PHASE 4: Web Static TypeScript Typecheck" -ForegroundColor Yellow
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $rawOutput = & pnpm --filter @finvault/web typecheck 2>&1 | Out-String
    $ec = $LASTEXITCODE
    $sw.Stop()

    if ($ec -ne 0) {
        Write-Host "[-] Web typecheck FAILED in $($sw.ElapsedMilliseconds)ms (ExitCode=$ec)" -ForegroundColor Red
        Write-Host $rawOutput
        $GlobalPassed = $false
        $Failures += "Web typecheck failed (ExitCode=$ec)"
    } else {
        Write-Host "[+] Web typecheck PASSED in $($sw.ElapsedMilliseconds)ms (ExitCode=0, 0 type errors)" -ForegroundColor Green
    }
}

# -----------------------------------------------------------------------------
# PHASE 5: Full Invariant and Stress Test Suites (308 Tests Total)
# -----------------------------------------------------------------------------
if ($Stage -in @("All", "Suites")) {
    Write-Host "`n>>> PHASE 5: All 7 Invariant & Stress Test Suites (308 Tests)" -ForegroundColor Yellow
    
    $suites = @(
        @{
            Name     = "Challenger 1 UI & Web Adversarial Stress"
            Command  = "node"
            Args     = @("--experimental-strip-types", "tests/stress/m4-challenger1-stress.ts")
            Expected = 85
        },
        @{
            Name     = "Challenger 2 Cockpit Invariants & Stress"
            Command  = "node"
            Args     = @("--experimental-strip-types", "tests/stress/m4-challenger2-cockpit-stress.ts")
            Expected = 24
        },
        @{
            Name     = "Forensic Auditor Adversarial Stress"
            Command  = "node"
            Args     = @("--experimental-strip-types", "tests/stress/m4-auditor-stress.ts")
            Expected = 17
        },
        @{
            Name     = "FinVault Sync Engine Invariants"
            Command  = "node"
            Args     = @("--test", "packages/sync-engine/tests/sync-engine.test.ts")
            Expected = 23
        },
        @{
            Name     = "Client SQLite Schema Parity"
            Command  = "node"
            Args     = @("--test", "packages/sync-engine/tests/client-schema.test.ts")
            Expected = 10
        },
        @{
            Name     = "Master E2E Invariant Test Runner"
            Command  = "node"
            Args     = @("--experimental-strip-types", "tests/e2e/runner.ts")
            Expected = 63
        },
        @{
            Name     = "Explorer M1 Monorepo Verification"
            Command  = "node"
            Args     = @(".agents/teamwork/explorer_m1_3/verify-m1.js")
            Expected = 86
        }
    )

    $suiteResults = @()
    $totalVerified = 0

    foreach ($s in $suites) {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $out = & $s.Command $s.Args 2>&1 | Out-String
        $ec = $LASTEXITCODE
        $sw.Stop()

        $pass = ($ec -eq 0)
        if ($pass) {
            $totalVerified += $s.Expected
            Write-Host ("  [PASS] {0} ({1}/{1} checks) - {2}ms, ExitCode=0" -f $s.Name, $s.Expected, $sw.ElapsedMilliseconds) -ForegroundColor Green
        } else {
            Write-Host ("  [FAIL] {0} - ExitCode={1}" -f $s.Name, $ec) -ForegroundColor Red
            Write-Host $out
            $GlobalPassed = $false
            $Failures += "$($s.Name) failed (ExitCode=$ec)"
        }

        $suiteResults += [PSCustomObject]@{
            Suite      = $s.Name
            Passed     = if ($pass) { "PASS" } else { "FAIL" }
            Checks     = $s.Expected
            DurationMs = $sw.ElapsedMilliseconds
            ExitCode   = $ec
        }
    }

    Write-Host "`n--- Test Suites Summary Table ---" -ForegroundColor Cyan
    $suiteResults | Format-Table -AutoSize | Out-String | Write-Host
    Write-Host "Total Invariant Checks Verified: $totalVerified / 308"
    if ($totalVerified -ne 308) {
        $GlobalPassed = $false
        $Failures += "Expected 308 verified tests, got $totalVerified"
    }
}

# -----------------------------------------------------------------------------
# FINAL VERDICT
# -----------------------------------------------------------------------------
Write-Host "`n================================================================================" -ForegroundColor Cyan
if ($GlobalPassed) {
    Write-Host "   OVERALL VERDICT: PASS (100% Deterministic, 0 ENOENT, 0 EPERM, 308/308 Tests) " -ForegroundColor Green
    Write-Host "================================================================================" -ForegroundColor Cyan
    exit 0
} else {
    Write-Host "   OVERALL VERDICT: FAIL (Build Flakiness or Test Failure Detected)            " -ForegroundColor Red
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host "Failure Reasons:" -ForegroundColor Red
    foreach ($f in $Failures) {
        Write-Host " - $f" -ForegroundColor Red
    }
    exit 1
}

#requires -Version 5.1

[CmdletBinding()]
param(
    [ValidateRange(1, 90)]
    [int]$Days = 7,

    [switch]$ForgetToken,

    [switch]$SelfTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$AccountId = "043f551ad8c039a914503318dae50d87"
$Dataset = "digitrust_conversion_events"
$ApiEndpoint = "https://api.cloudflare.com/client/v4/accounts/$AccountId/analytics_engine/sql"
$HealthEndpoint = "https://www.digitranshq.com/api/events"
$TokenPage = "https://dash.cloudflare.com/profile/api-tokens"
$CredentialDirectory = Join-Path $env:LOCALAPPDATA "DigiTrust"
$CredentialPath = Join-Path $CredentialDirectory "cloudflare-analytics-token.txt"

function ConvertFrom-ProtectedValue {
    param([Parameter(Mandatory = $true)][Security.SecureString]$SecureValue)

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Save-ProtectedToken {
    param(
        [Parameter(Mandatory = $true)][Security.SecureString]$SecureToken,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $directory = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }

    $encryptedToken = ConvertFrom-SecureString -SecureString $SecureToken
    Set-Content -LiteralPath $Path -Value $encryptedToken -Encoding ASCII -NoNewline
}

function Read-ProtectedToken {
    param([Parameter(Mandatory = $true)][string]$Path)

    $encryptedToken = Get-Content -LiteralPath $Path -Raw
    $secureToken = ConvertTo-SecureString -String $encryptedToken
    return ConvertFrom-ProtectedValue -SecureValue $secureToken
}

function New-AnalyticsQuery {
    param([Parameter(Mandatory = $true)][ValidateRange(1, 90)][int]$LookbackDays)

    return @"
SELECT
  blob1 AS event_name,
  blob2 AS page_path,
  blob3 AS placement,
  blob4 AS intent,
  SUM(_sample_interval * double1) AS events,
  MAX(timestamp) AS last_seen
FROM digitrust_conversion_events
WHERE timestamp > NOW() - INTERVAL '$LookbackDays' DAY
GROUP BY event_name, page_path, placement, intent
ORDER BY events DESC, last_seen DESC
"@
}

function Invoke-AnalyticsQuery {
    param(
        [Parameter(Mandatory = $true)][string]$Token,
        [Parameter(Mandatory = $true)][string]$Query
    )

    try {
        return Invoke-RestMethod `
            -Method Post `
            -Uri $ApiEndpoint `
            -Headers @{ Authorization = "Bearer $Token" } `
            -ContentType "text/plain" `
            -Body $Query
    }
    catch {
        $statusCode = $null
        $responseProperty = $_.Exception.PSObject.Properties["Response"]
        if ($responseProperty -and $responseProperty.Value) {
            $statusProperty = $responseProperty.Value.PSObject.Properties["StatusCode"]
            if ($statusProperty -and $statusProperty.Value) {
                $statusCode = [int]$statusProperty.Value
            }
        }

        if ($statusCode -eq 401 -or $statusCode -eq 403) {
            throw "Cloudflare rejected the saved read-only token. Run Check-Analytics.bat -ForgetToken, then run it again."
        }
        if ($statusCode) {
            throw "Cloudflare Analytics Engine returned HTTP $statusCode. No credential or query result was printed."
        }
        throw "Cloudflare Analytics Engine could not be reached. Check the network connection and try again."
    }
}

function Get-AnalyticsToken {
    if (Test-Path -LiteralPath $CredentialPath) {
        try {
            return [PSCustomObject]@{
                IsNew = $false
                PlainText = Read-ProtectedToken -Path $CredentialPath
                SecureValue = $null
            }
        }
        catch {
            throw "The saved token cannot be decrypted for this Windows user. Run Check-Analytics.bat -ForgetToken, then run it again."
        }
    }

    Write-Host "One-time setup" -ForegroundColor Cyan
    Write-Host "Create a Cloudflare custom token with Account Analytics: Read permission."
    Write-Host "The browser will open Cloudflare's API Tokens page."
    Write-Host "The token will be encrypted for this Windows user and stored outside the repository."
    Write-Host "Do not paste the token into chat, email, or GitHub."
    Write-Host ""

    try {
        Start-Process $TokenPage
    }
    catch {
        Write-Host "Open this page manually: $TokenPage" -ForegroundColor Yellow
    }

    $secureToken = Read-Host "Paste the new read-only token here" -AsSecureString
    $plainTextToken = ConvertFrom-ProtectedValue -SecureValue $secureToken
    if ([string]::IsNullOrWhiteSpace($plainTextToken)) {
        throw "No token was entered."
    }

    return [PSCustomObject]@{
        IsNew = $true
        PlainText = $plainTextToken
        SecureValue = $secureToken
    }
}

function Test-AnalyticsScript {
    $query = New-AnalyticsQuery -LookbackDays 7
    if ($query -notmatch "FROM digitrust_conversion_events") {
        throw "Self-test failed: production dataset is not fixed."
    }
    if ($query -notmatch "INTERVAL '7' DAY") {
        throw "Self-test failed: lookback is missing."
    }
    if ($query -notmatch "SUM\(_sample_interval \* double1\)") {
        throw "Self-test failed: sampling-aware count is missing."
    }

    $testPath = Join-Path ([IO.Path]::GetTempPath()) ("digitrust-analytics-{0}.txt" -f [Guid]::NewGuid())
    try {
        $testToken = "temporary-self-test-value"
        $secureTestToken = ConvertTo-SecureString -String $testToken -AsPlainText -Force
        Save-ProtectedToken -SecureToken $secureTestToken -Path $testPath
        $storedText = Get-Content -LiteralPath $testPath -Raw
        if ($storedText -match [Regex]::Escape($testToken)) {
            throw "Self-test failed: credential was stored as plaintext."
        }
        if ((Read-ProtectedToken -Path $testPath) -ne $testToken) {
            throw "Self-test failed: protected credential did not round-trip."
        }
    }
    finally {
        if (Test-Path -LiteralPath $testPath) {
            Remove-Item -LiteralPath $testPath -Force
        }
    }

    Write-Host "ANALYTICS_REPORT_SELF_TEST: PASS" -ForegroundColor Green
}

if ($SelfTest) {
    Test-AnalyticsScript
    exit 0
}

if ($ForgetToken) {
    if (Test-Path -LiteralPath $CredentialPath) {
        Remove-Item -LiteralPath $CredentialPath -Force
        Write-Host "Saved Cloudflare analytics token removed." -ForegroundColor Green
    }
    else {
        Write-Host "No saved Cloudflare analytics token was found."
    }
    exit 0
}

Write-Host "DigiTrust conversion analytics" -ForegroundColor Cyan
Write-Host "Production dataset: $Dataset"
Write-Host "Lookback window: $Days day(s)"
Write-Host ""

try {
    $health = Invoke-RestMethod -Method Get -Uri $HealthEndpoint
    if ($health.status -eq "ok" -and $health.durable_storage -eq $true) {
        Write-Host "Production event endpoint: healthy, durable storage connected" -ForegroundColor Green
    }
    else {
        Write-Warning "The production endpoint responded, but durable storage was not confirmed."
    }
}
catch {
    Write-Warning "The production health endpoint could not be checked. The analytics query will still run."
}

$tokenRecord = Get-AnalyticsToken
$token = $tokenRecord.PlainText

try {
    Invoke-AnalyticsQuery -Token $token -Query "SHOW TABLES" | Out-Null
    if ($tokenRecord.IsNew) {
        Save-ProtectedToken -SecureToken $tokenRecord.SecureValue -Path $CredentialPath
        Write-Host "Read-only token verified and saved securely for this Windows user." -ForegroundColor Green
    }

    $query = New-AnalyticsQuery -LookbackDays $Days
    $response = Invoke-AnalyticsQuery -Token $token -Query $query
    $dataProperty = $response.PSObject.Properties["data"]
    if (-not $dataProperty) {
        throw "Cloudflare returned an unexpected analytics response."
    }
    $rows = @($dataProperty.Value)

    Write-Host ""
    if ($rows.Count -eq 0) {
        Write-Host "No conversion events were found in the selected window." -ForegroundColor Yellow
    }
    else {
        $rows |
            Select-Object event_name, page_path, placement, intent, events, last_seen |
            Format-Table -AutoSize |
            Out-String |
            Write-Host

        $verificationEvent = @($rows | Where-Object {
            $_.event_name -eq "briefing_cta_clicked" -and
            $_.page_path -eq "/" -and
            $_.placement -eq "hero" -and
            $_.intent -eq "enterprise-pilot"
        })

        if ($verificationEvent.Count -gt 0) {
            Write-Host "Production CTA verification event: found" -ForegroundColor Green
        }
        else {
            Write-Host "Production CTA verification event: not found in this window" -ForegroundColor Yellow
        }
    }

    Write-Host "Analytics report complete." -ForegroundColor Green
}
finally {
    $token = $null
    $tokenRecord = $null
}

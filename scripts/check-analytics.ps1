#requires -Version 5.1

[CmdletBinding()]
param(
    [ValidateRange(1, 90)]
    [int]$Days = 7,

    [ValidateSet("Production", "Preview")]
    [string]$Environment = "Production",

    [switch]$ForgetToken,

    [switch]$SelfTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Windows PowerShell 5.1 can default to legacy TLS depending on the local .NET
# configuration. Cloudflare's API requires a modern TLS connection.
[Net.ServicePointManager]::SecurityProtocol = `
    [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$AccountId = "043f551ad8c039a914503318dae50d87"
$ApiEndpoint = "https://api.cloudflare.com/client/v4/accounts/$AccountId/analytics_engine/sql"
$TokenPage = "https://dash.cloudflare.com/profile/api-tokens"
$CredentialDirectory = Join-Path $env:LOCALAPPDATA "DigiTrust"
$CredentialPath = Join-Path $CredentialDirectory "cloudflare-analytics-token.txt"
$DatasetByEnvironment = @{
    Production = "digitrust_conversion_events"
    Preview = "digitrust_conversion_events_preview"
}
$HealthEndpointByEnvironment = @{
    Production = "https://www.digitranshq.com/api/events"
    Preview = "https://codex-cloudflare-native-inta.digitranshq.pages.dev/api/events"
}
$Dataset = $DatasetByEnvironment[$Environment]
$HealthEndpoint = $HealthEndpointByEnvironment[$Environment]

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
    param(
        [Parameter(Mandatory = $true)][ValidateRange(1, 90)][int]$LookbackDays,
        [Parameter(Mandatory = $true)][ValidateSet("Production", "Preview")][string]$TargetEnvironment
    )

    $targetDataset = $DatasetByEnvironment[$TargetEnvironment]

    return @"
SELECT
  blob1 AS event_name,
  blob2 AS page_path,
  blob3 AS placement,
  blob4 AS intent,
  SUM(_sample_interval * double1) AS events,
  MAX(timestamp) AS last_seen
FROM $targetDataset
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
        $webExceptionStatus = $null
        $responseProperty = $_.Exception.PSObject.Properties["Response"]
        if ($responseProperty -and $responseProperty.Value) {
            $statusProperty = $responseProperty.Value.PSObject.Properties["StatusCode"]
            if ($statusProperty -and $statusProperty.Value) {
                $statusCode = [int]$statusProperty.Value
            }
        }
        $exceptionStatusProperty = $_.Exception.PSObject.Properties["Status"]
        if ($exceptionStatusProperty -and $exceptionStatusProperty.Value) {
            $webExceptionStatus = [string]$exceptionStatusProperty.Value
        }

        if ($statusCode -eq 401 -or $statusCode -eq 403) {
            throw "Cloudflare rejected the saved read-only token. Run Check-Analytics.bat -ForgetToken, then run it again."
        }
        if ($statusCode) {
            throw "Cloudflare Analytics Engine returned HTTP $statusCode. No credential or query result was printed."
        }
        if ($webExceptionStatus -in @("TrustFailure", "SecureChannelFailure")) {
            throw "Cloudflare Analytics Engine TLS negotiation failed. Confirm that Windows TLS 1.2 is enabled, then try again."
        }
        if ($webExceptionStatus -eq "NameResolutionFailure") {
            throw "Cloudflare's API hostname could not be resolved. Check DNS or VPN settings, then try again."
        }
        if ($webExceptionStatus -in @("ConnectFailure", "ProxyNameResolutionFailure")) {
            throw "Cloudflare's API connection was blocked. Check the firewall, VPN, or proxy, then try again."
        }
        if ($webExceptionStatus -eq "Timeout") {
            throw "Cloudflare's API request timed out. Check the network connection and try again."
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
    $productionQuery = New-AnalyticsQuery -LookbackDays 7 -TargetEnvironment Production
    $previewQuery = New-AnalyticsQuery -LookbackDays 7 -TargetEnvironment Preview
    if ($productionQuery -notmatch "FROM digitrust_conversion_events(?:\r?\n)") {
        throw "Self-test failed: production dataset is not fixed."
    }
    if ($previewQuery -notmatch "FROM digitrust_conversion_events_preview(?:\r?\n)") {
        throw "Self-test failed: preview dataset is not fixed."
    }
    if ($productionQuery -notmatch "INTERVAL '7' DAY" -or $previewQuery -notmatch "INTERVAL '7' DAY") {
        throw "Self-test failed: lookback is missing."
    }
    if ($productionQuery -notmatch "SUM\(_sample_interval \* double1\)" -or $previewQuery -notmatch "SUM\(_sample_interval \* double1\)") {
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
Write-Host "Environment: $Environment"
Write-Host "Dataset: $Dataset"
Write-Host "Lookback window: $Days day(s)"
Write-Host ""

try {
    $health = Invoke-RestMethod -Method Get -Uri $HealthEndpoint
    if ($health.status -eq "ok" -and $health.durable_storage -eq $true) {
        Write-Host "$Environment event endpoint: healthy, durable storage connected" -ForegroundColor Green
    }
    else {
        Write-Warning "The $Environment endpoint responded, but durable storage was not confirmed."
    }
}
catch {
    Write-Warning "The $Environment health endpoint could not be checked. The analytics query will still run."
}

$tokenRecord = Get-AnalyticsToken
$token = $tokenRecord.PlainText

try {
    Invoke-AnalyticsQuery -Token $token -Query "SHOW TABLES" | Out-Null
    if ($tokenRecord.IsNew) {
        Save-ProtectedToken -SecureToken $tokenRecord.SecureValue -Path $CredentialPath
        Write-Host "Read-only token verified and saved securely for this Windows user." -ForegroundColor Green
    }

    $query = New-AnalyticsQuery -LookbackDays $Days -TargetEnvironment $Environment
    $response = Invoke-AnalyticsQuery -Token $token -Query $query
    $dataProperty = $response.PSObject.Properties["data"]
    if (-not $dataProperty) {
        throw "Cloudflare returned an unexpected analytics response."
    }
    $rows = @($dataProperty.Value)

    Write-Host ""
    if ($rows.Count -eq 0) {
        if ($Environment -eq "Preview") {
            throw "Preview SES lead verification event was not found in this window. Wait one minute and run the check again."
        }
        Write-Host "No conversion events were found in the selected window." -ForegroundColor Yellow
    }
    else {
        $rows |
            Select-Object event_name, page_path, placement, intent, events, last_seen |
            Format-Table -AutoSize |
            Out-String |
            Write-Host

        if ($Environment -eq "Preview") {
            $verificationEvent = @($rows | Where-Object {
                $_.event_name -eq "lead_submitted" -and
                $_.page_path -eq "/intake-thank-you/" -and
                $_.placement -eq "aws_ses_intake" -and
                $_.intent -eq "enterprise-pilot"
            })

            if ($verificationEvent.Count -eq 0) {
                throw "Preview SES lead verification event was not found in this window. Wait one minute and run the check again."
            }
            Write-Host "Preview SES lead verification event: found" -ForegroundColor Green
        }
        else {
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
    }

    Write-Host "Analytics report complete." -ForegroundColor Green
}
finally {
    $token = $null
    $tokenRecord = $null
}

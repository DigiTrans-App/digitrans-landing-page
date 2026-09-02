@echo off
setlocal
title DigiTrust preview SES analytics verification

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check-analytics.ps1" -Environment Preview
set "report_exit_code=%ERRORLEVEL%"

echo.
if not "%report_exit_code%"=="0" (
  echo The preview analytics verification did not complete. Review the message above.
)

if not "%DIGITRUST_ANALYTICS_NO_PAUSE%"=="1" pause
exit /b %report_exit_code%

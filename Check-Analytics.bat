@echo off
setlocal
title DigiTrust conversion analytics

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check-analytics.ps1" %*
set "report_exit_code=%ERRORLEVEL%"

echo.
if not "%report_exit_code%"=="0" (
  echo The analytics report did not complete. Review the message above.
)

if not "%DIGITRUST_ANALYTICS_NO_PAUSE%"=="1" pause
exit /b %report_exit_code%

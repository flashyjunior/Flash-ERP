@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-flash-erp-vps-from-git.ps1"
set "FLASH_ERP_DEPLOY_EXIT=%ERRORLEVEL%"
if not "%FLASH_ERP_DEPLOY_EXIT%"=="0" pause
exit /b %FLASH_ERP_DEPLOY_EXIT%

@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed yet.
  echo A browser window will open. Download the LTS version, install it, then double-click this file again.
  start https://nodejs.org/en/download
  pause
  exit /b 1
)
start http://localhost:3000
node server.js
pause

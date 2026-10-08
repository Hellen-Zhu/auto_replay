@echo off
rem Serves the reports and full replays (trace viewer) of earlier runs - keep this window open while viewing
chcp 65001 >nul
cd /d "%~dp0"
"%~dp0node\node.exe" "%~dp0runner\runner.js" --view
echo.
pause

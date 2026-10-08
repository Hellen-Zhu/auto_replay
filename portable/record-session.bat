@echo off
rem Records a manual session (no case is run): work in the browser by hand, then press Enter in this window
chcp 65001 >nul
cd /d "%~dp0"
"%~dp0node\node.exe" "%~dp0runner\runner.js" --record
echo.
pause

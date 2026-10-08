@echo off
rem UAT replay runner - double click to choose a case, or drag a case .json onto this file
chcp 65001 >nul
cd /d "%~dp0"
set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
set PLAYWRIGHT_BROWSERS_PATH=%~dp0ms-playwright
"%~dp0node\node.exe" "%~dp0runner\runner.js" %1
echo.
pause

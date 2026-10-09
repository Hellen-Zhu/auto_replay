@echo off
rem UAT replay runner - double click to choose the cases to run, or drag a case .json,
rem several of them or a folder of cases onto this file
chcp 65001 >nul
cd /d "%~dp0"
set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
set PLAYWRIGHT_BROWSERS_PATH=%~dp0ms-playwright
"%~dp0node\node.exe" "%~dp0runner\runner.js" %*
echo.
pause

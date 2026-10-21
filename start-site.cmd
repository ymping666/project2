@echo off
cd /d "%~dp0"
node build.mjs
if errorlevel 1 exit /b 1
echo One Note local preview: http://127.0.0.1:4176/
echo Keep this window open. Press Ctrl+C to stop the preview.
node server.mjs
pause

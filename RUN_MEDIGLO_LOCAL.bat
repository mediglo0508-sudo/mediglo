@echo off
title MGHYN Clinic ERP - Localhost Server (Port 3000)
echo ========================================================
echo Starting MGHYN Clinic ERP (Full 28-Module Suite)...
echo Local URL:   http://localhost:3000
echo Network URL: http://%COMPUTERNAME%:3000
echo ========================================================
cd /d "%~dp0apps\mghyn"
call "C:\Program Files\nodejs\node.exe" --env-file=.env ".\node_modules\vite\bin\vite.js" dev --port 3000 --host 0.0.0.0
pause

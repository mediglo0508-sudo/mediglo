@echo off
title MGHYN Clinic ERP - Hot Reload Server (Port 3000)
echo ========================================================
echo Starting MGHYN Clinic ERP in Hot-Reload Mode...
echo Local URL:   http://localhost:3000
echo ========================================================
cd /d "%~dp0apps\mghyn"
call "C:\Program Files\nodejs\node.exe" --env-file=.env ".\node_modules\vite\bin\vite.js" dev --port 3000 --host 0.0.0.0
pause

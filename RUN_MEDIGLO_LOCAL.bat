@echo off
title MediGlo Harmony ERP - Localhost Server
echo ========================================================
echo Starting MediGlo Harmony ERP on Localhost...
echo Local URL:   http://localhost:3000
echo Network URL: http://%COMPUTERNAME%:3000
echo ========================================================
cd /d "%~dp0"
call npm run preview --workspace=@mediglo/erp -- --port 3000 --host 0.0.0.0
pause

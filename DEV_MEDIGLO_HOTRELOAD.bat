@echo off
title MediGlo Harmony ERP - Hot Reload Dev Server
echo ========================================================
echo Starting MediGlo Harmony ERP in Hot-Reload Dev Mode...
echo Local URL:   http://localhost:5173
echo ========================================================
cd /d "%~dp0"
call npm run dev --workspace=@mediglo/erp -- --host 0.0.0.0
pause

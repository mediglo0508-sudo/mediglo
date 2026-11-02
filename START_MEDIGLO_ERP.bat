@echo off
title MediGlo Harmony Clinic ERP Launcher
color 0A
echo =======================================================
echo         MEDIGLO HARMONY CLINIC ERP LAUNCHER
echo =======================================================
echo.
cd /d "C:\Users\Vikas Koul\Documents\antigravity\hopeful-mendel"

echo [1/3] Starting Isolated Database & Auth Server (Port 54321)...
start "MediGlo Isolated DB" /min node scripts\isolated-local-supabase.mjs

timeout /t 2 /nobreak >nul

echo [2/3] Starting MediGlo Harmony ERP Dev Server (Port 3000)...
start "MediGlo ERP Dev" /min node scripts\run-erp.mjs

timeout /t 4 /nobreak >nul

echo [3/3] Opening MediGlo Harmony in your Browser...
start http://localhost:3000/auth

echo.
echo =======================================================
echo MediGlo Harmony is running!
echo ERP URL:        http://localhost:3000/auth
echo Register Kiosk: http://localhost:3000/register
echo Super-Admin:    admin@mediglo.in / AdminPassword2026!
echo =======================================================
echo.
pause

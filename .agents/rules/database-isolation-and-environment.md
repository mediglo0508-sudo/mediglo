---
trigger: always_on
description: Critical database isolation, Windows command execution, and in-house architecture invariants for MediGlo Harmony.
---

# MediGlo Harmony Engineering & Environment Invariants

## 1. Zero-Touch Live Production Database Guardrail
- Under NO circumstances perform any destructive, write, update, or migration operation against the live MGHYN production database (`wrjhdtdlxekackjdsjpf`).
- The new 30-module MediGlo Harmony ERP (`apps/erp`) must strictly operate against the isolated local database server running on `http://127.0.0.1:54321` (`apps/erp/isolated_mediglo_harmony.db`).
- Treat MGHYN (`apps/mghyn`) and its live database strictly as read-only references.

## 2. Windows PowerShell CLI Invocation
- Because PowerShell execution policies block `.ps1` wrapper scripts, always invoke npm/tsc/node commands using:
  `cmd.exe /c "cd apps\\erp && ..."`

## 3. In-House Self-Contained Architecture (Zero Paid API Keys)
- Do not add dependencies on external paid AI APIs or cloud keys.
- OCR runs in-browser via `tesseract.js`.
- AI Manager runs locally in `/api/ai-manager` querying SQLite data.
- Doctor AI patterns persist into `clinical_ai_patterns`.
- PDF generation runs client-side via standard PDF streams.

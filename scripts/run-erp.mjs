// @ts-check
import { spawn } from "node:child_process";
import path from "node:path";

const erpDir = path.resolve("apps/erp");
const viteBin = path.join(erpDir, "node_modules", "vite", "bin", "vite.js");

// Safety guard: Ensure isolated DB
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.VITE_SUPABASE_URL = "http://127.0.0.1:54321";

let isShuttingDown = false;
let currentChild = null;

process.on("SIGINT", () => {
  isShuttingDown = true;
  if (currentChild) currentChild.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  isShuttingDown = true;
  if (currentChild) currentChild.kill();
  process.exit(0);
});

function startServer() {
  if (isShuttingDown) return;
  console.log(`[ERP Supervisor] Spawning Vite dev server from ${viteBin}...`);

  const child = spawn(process.execPath, [viteBin, "dev", "--host", "0.0.0.0", "--port", "3000", "--strictPort"], {
    cwd: erpDir,
    stdio: "inherit",
    env: {
      ...process.env,
      CI: "true",
      FORCE_COLOR: "1",
    },
  });

  currentChild = child;

  child.on("exit", (code, signal) => {
    if (isShuttingDown) return;
    console.warn(`[ERP Supervisor] Vite dev exited (code: ${code}, signal: ${signal}). Auto-restarting in 1s...`);
    setTimeout(startServer, 1000);
  });

  child.on("error", (err) => {
    console.error(`[ERP Supervisor] Failed to spawn Vite:`, err);
    if (!isShuttingDown) setTimeout(startServer, 2000);
  });
}

startServer();

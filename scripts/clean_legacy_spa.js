const fs = require('fs');
const path = require('path');

const legacy = [
  'apps/erp/src/App.tsx',
  'apps/erp/src/main.tsx',
  'apps/erp/src/legacy_pages',
  'apps/erp/src/components/appointments/AppointmentFormModal.tsx',
  'apps/erp/src/components/auth/ProtectedRoute.tsx',
  'apps/erp/src/components/auth/AccessDenied.tsx',
  'apps/erp/src/components/billing/BillLineEditor.tsx',
  'apps/erp/src/components/customers/CustomerDrawer.tsx',
  'apps/erp/src/components/layout/AppShell.tsx',
  'apps/erp/src/components/layout/nav-items.ts',
  'apps/erp/src/components/layout/NotificationBell.tsx',
  'apps/erp/src/components/ui/button-variants.ts',
  'apps/erp/src/hooks/useQueries.ts',
];

const destDir = 'apps/erp/legacy_spa_backup';
fs.mkdirSync(destDir, { recursive: true });

for (const item of legacy) {
  if (fs.existsSync(item)) {
    const target = path.join(destDir, path.basename(item));
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    fs.renameSync(item, target);
    console.log(`Archived ${item} -> ${target}`);
  }
}
console.log('Legacy SPA cleanup done!');

const fs = require('fs');

// Fix customers.tsx
let c = fs.readFileSync('apps/erp/src/routes/_authenticated/customers.tsx', 'utf8');
c = c.replace(/import { WalletRedeemDialog } from "@\/components\/WalletRedeemDialog";[^\n]*/, 
  'import { WalletRedeemDialog } from "@/components/WalletRedeemDialog";\nimport { DigitalRegistrationDialog } from "@/components/DigitalRegistrationDialog";\nimport { UserPlus } from "lucide-react";');
c = c.replace(/const \[selected, setSelected\] = useState<Set<string>>\(new Set\(\)\);[^\n]*/,
  'const [selected, setSelected] = useState<Set<string>>(new Set());\n  const [regOpen, setRegOpen] = useState(false);');
fs.writeFileSync('apps/erp/src/routes/_authenticated/customers.tsx', c);

// Fix reception.tsx
let r = fs.readFileSync('apps/erp/src/routes/_authenticated/reception.tsx', 'utf8');
r = r.replace(/import { ClientTimelineDialog, type ClientTimelineTarget } from "@\/components\/ClientTimelineDialog";[^\n]*/,
  'import { ClientTimelineDialog, type ClientTimelineTarget } from "@/components/ClientTimelineDialog";\nimport { DigitalRegistrationDialog } from "@/components/DigitalRegistrationDialog";\nimport { UserPlus } from "lucide-react";');
r = r.replace(/const \[saving, setSaving\] = useState\(false\);[^\n]*/,
  'const [saving, setSaving] = useState(false);\n  const [regOpen, setRegOpen] = useState(false);');
fs.writeFileSync('apps/erp/src/routes/_authenticated/reception.tsx', r);

console.log('Fixed syntax in both files');

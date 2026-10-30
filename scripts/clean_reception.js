const fs = require('fs');

// Move apps/erp/src/pages to legacy_pages if exists
if (fs.existsSync('apps/erp/src/pages')) {
  fs.renameSync('apps/erp/src/pages', 'apps/erp/src/legacy_pages');
  console.log('Archived apps/erp/src/pages to legacy_pages');
}

// Clean reception.tsx
let r = fs.readFileSync('apps/erp/src/routes/_authenticated/reception.tsx', 'utf8');

// Remove misplaced DigitalRegistrationDialog at end of file if any
r = r.replace(/<DigitalRegistrationDialog open=\{regOpen\} onOpenChange=\{setRegOpen\} defaultCheckIn=\{true\} \/>\s*<\/div>\s*<\/div>\s*<\/div>/g, '</div>\n    </div>');
r = r.replace(/<DigitalRegistrationDialog open=\{regOpen\} onOpenChange=\{setRegOpen\} defaultCheckIn=\{true\} \/>/g, '');

// Place it properly right before closing ReceptionPage:
const target = '              {inFlight.length === 0 && <p className="text-sm text-muted-foreground">No active patients in the clinic.</p>}\n            </div>\n          </Card>\n        </div>\n      </div>';
const replacement = target + '\n      <DigitalRegistrationDialog open={regOpen} onOpenChange={setRegOpen} defaultCheckIn={true} />';

if (r.includes(target)) {
  r = r.replace(target, replacement);
} else {
  // Try CRLF
  const targetCRLF = target.replace(/\n/g, '\r\n');
  const replacementCRLF = replacement.replace(/\n/g, '\r\n');
  r = r.replace(targetCRLF, replacementCRLF);
}

fs.writeFileSync('apps/erp/src/routes/_authenticated/reception.tsx', r);
console.log('Corrected DigitalRegistrationDialog in reception.tsx');

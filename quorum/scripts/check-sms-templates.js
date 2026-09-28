// Renders every SMS template at its worst-case length in both locales and fails the build
// if any is longer than one GSM-7 segment or breaks a content rule (brief §2.5).
import { KINDS, LOCALES, worstCase, validateSms } from '../core/sms-templates.js';

let failed = 0;
for (const kind of KINDS) {
  for (const locale of LOCALES) {
    const text = worstCase(kind, locale);
    const { ok, errors, analysis } = validateSms(text);
    const count = `${String(analysis.septets).padStart(3)}/160`;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${kind.padEnd(7)} ${locale}  ${count}  ${text}`);
    if (!ok) {
      failed++;
      for (const e of errors) console.log(`       - ${e}`);
    }
  }
}
if (failed) {
  console.error(`\n${failed} template(s) failed`);
  process.exit(1);
}
console.log('\nall templates are one GSM-7 segment at worst case');

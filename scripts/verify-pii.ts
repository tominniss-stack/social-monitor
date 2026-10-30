/**
 * Standalone verification of `redactPII()`.
 *
 * Run: npm run verify:pii
 * Exits 1 on any failed assertion. No test framework required.
 */
import { redactPII } from '../src/lib/pii';

let failures = 0;
let passes = 0;

function check(label: string, got: string, want: string) {
  if (got === want) {
    passes += 1;
    return;
  }
  failures += 1;
  console.error(`  ✗ ${label}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);
}

function checkNotContains(label: string, got: string, forbidden: string) {
  if (!got.includes(forbidden)) {
    passes += 1;
    return;
  }
  failures += 1;
  console.error(`  ✗ ${label}: output still contains ${JSON.stringify(forbidden)} → ${JSON.stringify(got)}`);
}

console.log('Emails');
check('simple email', redactPII('Email me at jane.doe@example.com please'), 'Email me at [email redacted] please');
check(
  'plus-addressed email with subdomain',
  redactPII('contact: sales+uk@mail.example.co.uk.'),
  'contact: [email redacted].'
);
check('email is not treated as a handle', redactPII('a@b.io'), '[email redacted]');

console.log('Phone numbers');
check('UK mobile with space', redactPII('Call me on 07700 900123'), 'Call me on [phone redacted]');
check('UK mobile no space', redactPII('Call 07700900123 now'), 'Call [phone redacted] now');
check('UK international', redactPII('WhatsApp +44 7700 900123 ok?'), 'WhatsApp [phone redacted] ok?');
check('UK landline', redactPII('Office 020 7123 4567'), 'Office [phone redacted]');
check('US formatted', redactPII('Ring +1 (555) 123-4567 today'), 'Ring [phone redacted] today');
check('short numbers are kept (price)', redactPII('It costs £1,499 per year'), 'It costs £1,499 per year');
check('year is kept', redactPII('Since 2019 we have used it'), 'Since 2019 we have used it');
check('seat count is kept', redactPII('We have 25 client accounts and 120 seats'), 'We have 25 client accounts and 120 seats');

console.log('Handles');
check('instagram handle', redactPII('DM @jane_doe99 for details'), 'DM [handle redacted] for details');
check('handle with dots', redactPII('cc @agency.lead.uk'), 'cc [handle redacted]');
check('handle at start', redactPII('@support please help'), '[handle redacted] please help');

console.log('URLs');
check(
  'URL with query string keeps bare origin',
  redactPII('see https://example.com/track?user=123&token=abc for details'),
  'see https://example.com for details'
);
check(
  'URL with query string and no path',
  redactPII('http://shop.example.co.uk?ref=jane'),
  'http://shop.example.co.uk'
);
check('bare URL without query is untouched', redactPII('docs at https://example.com/pricing'), 'docs at https://example.com/pricing');

console.log('Combined / edge cases');
{
  const input = 'Hi, I am @tom_b, email tom@acme.io or call 07700 900123; signup at https://x.com/a?b=1';
  const out = redactPII(input);
  checkNotContains('combined: email gone', out, 'tom@acme.io');
  checkNotContains('combined: phone gone', out, '07700 900123');
  checkNotContains('combined: handle gone', out, '@tom_b');
  checkNotContains('combined: query gone', out, '?b=1');
  check('combined: full output', out, 'Hi, I am [handle redacted], email [email redacted] or call [phone redacted]; signup at https://x.com');
}
check('empty string', redactPII(''), '');
check('no PII passes through unchanged', redactPII('What is the pricing for agencies?'), 'What is the pricing for agencies?');

console.log('');
if (failures > 0) {
  console.error(`FAILED: ${failures} assertion(s) failed, ${passes} passed.`);
  process.exit(1);
}
console.log(`OK: ${passes} assertions passed.`);

/**
 * Lightweight assertion-based tests for the verification logic.
 * Run with: npm test
 */
import assert from 'assert';
import { verifyLabel, GOVERNMENT_WARNING, fuzzyContains } from './verify';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL - ${name}`);
    console.error('       ', err instanceof Error ? err.message : err);
  }
}

function fieldStatus(res: ReturnType<typeof verifyLabel>, field: string): string {
  const f = res.fields.find((x) => x.field === field);
  return f ? f.status : 'missing';
}

const compliantText = [
  'OLD TOM DISTILLERY',
  'Kentucky Straight Bourbon Whiskey',
  '45% Alc./Vol. (90 Proof)',
  '750 mL',
  GOVERNMENT_WARNING,
].join('\n');

const app = {
  brandName: 'OLD TOM DISTILLERY',
  classType: 'Kentucky Straight Bourbon Whiskey',
  alcoholContent: '45% Alc./Vol. (90 Proof)',
  netContents: '750 mL',
};

console.log('Running verification tests...');

test('fully compliant label passes all fields', () => {
  const res = verifyLabel(app, compliantText);
  assert.strictEqual(res.overall, 'pass');
  assert.strictEqual(fieldStatus(res, 'brandName'), 'pass');
  assert.strictEqual(fieldStatus(res, 'alcoholContent'), 'pass');
  assert.strictEqual(fieldStatus(res, 'netContents'), 'pass');
  assert.strictEqual(fieldStatus(res, 'governmentWarning'), 'pass');
});

test('brand name matches despite casing/punctuation differences', () => {
  const text = compliantText.replace('OLD TOM DISTILLERY', "Old Tom Distillery");
  const res = verifyLabel(app, text);
  assert.strictEqual(fieldStatus(res, 'brandName'), 'pass');
});

test("Stone's Throw title-case brand matches STONE'S THROW application", () => {
  const res = verifyLabel(
    { brandName: "STONE'S THROW" },
    "Stone's Throw\nIndia Pale Ale\n" + GOVERNMENT_WARNING
  );
  assert.strictEqual(fieldStatus(res, 'brandName'), 'pass');
});

test('title-case government warning is rejected', () => {
  const text = compliantText.replace('GOVERNMENT WARNING:', 'Government Warning:');
  const res = verifyLabel(app, text);
  assert.strictEqual(fieldStatus(res, 'governmentWarning'), 'fail');
  assert.strictEqual(res.overall, 'fail');
});

test('missing government warning is rejected', () => {
  const text = compliantText.replace(GOVERNMENT_WARNING, '');
  const res = verifyLabel(app, text);
  assert.strictEqual(fieldStatus(res, 'governmentWarning'), 'fail');
});

test('proof matches ABV numerically (90 Proof == 45% ABV)', () => {
  const text = compliantText.replace('45% Alc./Vol. (90 Proof)', '90 Proof');
  const res = verifyLabel(app, text);
  assert.strictEqual(fieldStatus(res, 'alcoholContent'), 'pass');
});

test('wrong ABV fails', () => {
  const text = compliantText.replace('45% Alc./Vol. (90 Proof)', '12% Alc./Vol.');
  const res = verifyLabel(app, text);
  assert.strictEqual(fieldStatus(res, 'alcoholContent'), 'fail');
});

test('net contents unit normalization (750ml == 750 mL)', () => {
  const text = compliantText.replace('750 mL', '750ml');
  const res = verifyLabel(app, text);
  assert.strictEqual(fieldStatus(res, 'netContents'), 'pass');
});

test('missing brand on label fails', () => {
  const text = compliantText.replace('OLD TOM DISTILLERY', 'SOME OTHER BRAND');
  const res = verifyLabel(app, text);
  assert.strictEqual(fieldStatus(res, 'brandName'), 'fail');
});

test('fuzzyContains tolerates minor OCR noise', () => {
  assert.ok(fuzzyContains('OLD T0M DlSTILLERY', 'OLD TOM DISTILLERY'));
});

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);

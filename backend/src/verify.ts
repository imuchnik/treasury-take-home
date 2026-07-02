/**
 * Core label verification logic.
 *
 * This module is intentionally free of any I/O (no OCR, no HTTP) so it can be
 * unit-tested in isolation and reused. It takes the OCR'd label text plus the
 * expected application data and produces a structured, field-by-field result.
 */

export type FieldStatus = 'pass' | 'fail' | 'warning' | 'skipped';

export interface FieldResult {
  field: string;
  label: string;
  expected: string;
  found: string;
  status: FieldStatus;
  note?: string;
}

export interface ApplicationData {
  brandName?: string;
  classType?: string;
  alcoholContent?: string;
  netContents?: string;
}

export interface VerificationResult {
  overall: 'pass' | 'fail' | 'warning';
  fields: FieldResult[];
  extractedText: string;
}

/** The exact TTB government health warning statement (27 CFR 16.21). */
export const GOVERNMENT_WARNING =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink ' +
  'alcoholic beverages during pregnancy because of the risk of birth defects. ' +
  '(2) Consumption of alcoholic beverages impairs your ability to drive a car or ' +
  'operate machinery, and may cause health problems.';

/** Lowercase, collapse whitespace, strip punctuation for fuzzy comparisons. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9%.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Collapse all whitespace to single spaces without changing case/punctuation. */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/** Similarity ratio in [0,1] based on edit distance. */
export function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Does `needle` appear in `haystack` allowing for small OCR noise?
 * We slide a window the size of the needle across the haystack and check for a
 * close match. This tolerates OCR mistakes like "0" vs "O" without requiring an
 * exact substring.
 */
export function fuzzyContains(haystack: string, needle: string, minSim = 0.85): boolean {
  const h = normalize(haystack);
  const n = normalize(needle);
  if (!n) return false;
  if (h.includes(n)) return true;

  const words = h.split(' ');
  const needleWordCount = n.split(' ').length;
  for (let i = 0; i + needleWordCount <= words.length; i++) {
    const window = words.slice(i, i + needleWordCount).join(' ');
    if (similarity(window, n) >= minSim) return true;
  }
  // Also try a raw character window as a fallback for single tokens.
  for (let i = 0; i + n.length <= h.length; i += 1) {
    const window = h.substr(i, n.length);
    if (similarity(window, n) >= minSim) return true;
  }
  return false;
}

/** Extract percentage numbers, e.g. "45% Alc./Vol." -> 45. */
function extractPercents(text: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,2}(?:\.\d+)?)\s*%/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(parseFloat(m[1]));
  return out;
}

/** Extract "90 Proof" -> 90 (proof) -> 45 ABV, returned as ABV numbers. */
function extractProofsAsAbv(text: string): number[] {
  const out: number[] = [];
  const re = /(\d{2,3}(?:\.\d+)?)\s*proof/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(parseFloat(m[1]) / 2);
  return out;
}

/** Pull the ABV value out of an expected string like "45% Alc./Vol. (90 Proof)". */
function expectedAbv(expected: string): number | null {
  const pct = extractPercents(expected);
  if (pct.length) return pct[0];
  const proof = extractProofsAsAbv(expected);
  if (proof.length) return proof[0];
  return null;
}

function verifyBrandName(expected: string, text: string): FieldResult {
  const base: FieldResult = {
    field: 'brandName',
    label: 'Brand Name',
    expected,
    found: '',
    status: 'skipped',
  };
  if (!expected.trim()) return { ...base, note: 'No brand name provided in application.' };

  if (fuzzyContains(text, expected, 0.85)) {
    return { ...base, found: expected, status: 'pass' };
  }
  // Try a looser match and flag it for human review (Dave's "judgment" case).
  if (fuzzyContains(text, expected, 0.7)) {
    return {
      ...base,
      found: '(approximate match)',
      status: 'warning',
      note: 'Brand name is a close but not exact match — recommend manual review.',
    };
  }
  return {
    ...base,
    status: 'fail',
    note: 'Brand name not found on label.',
  };
}

function verifyClassType(expected: string | undefined, text: string): FieldResult {
  const base: FieldResult = {
    field: 'classType',
    label: 'Class / Type',
    expected: expected ?? '',
    found: '',
    status: 'skipped',
  };
  if (!expected || !expected.trim()) {
    return { ...base, note: 'No class/type provided in application.' };
  }
  if (fuzzyContains(text, expected, 0.8)) {
    return { ...base, found: expected, status: 'pass' };
  }
  return { ...base, status: 'fail', note: 'Class/type designation not found on label.' };
}

function verifyAlcoholContent(expected: string, text: string): FieldResult {
  const base: FieldResult = {
    field: 'alcoholContent',
    label: 'Alcohol Content',
    expected,
    found: '',
    status: 'skipped',
  };
  if (!expected.trim()) return { ...base, note: 'No alcohol content provided in application.' };

  const wantAbv = expectedAbv(expected);
  const foundAbvs = [...extractPercents(text), ...extractProofsAsAbv(text)];

  if (wantAbv !== null) {
    // Numeric comparison tolerant of proof<->ABV and small OCR error.
    const hit = foundAbvs.find((v) => Math.abs(v - wantAbv) <= 0.5);
    if (hit !== undefined) {
      return { ...base, found: `${hit}% ABV`, status: 'pass' };
    }
    if (foundAbvs.length) {
      return {
        ...base,
        found: foundAbvs.map((v) => `${v}%`).join(', '),
        status: 'fail',
        note: `Expected ~${wantAbv}% ABV but found ${foundAbvs.join('%, ')}%.`,
      };
    }
  }
  // Fall back to a fuzzy string check.
  if (fuzzyContains(text, expected, 0.8)) {
    return { ...base, found: expected, status: 'pass' };
  }
  return { ...base, status: 'fail', note: 'Alcohol content not found on label.' };
}

function verifyNetContents(expected: string, text: string): FieldResult {
  const base: FieldResult = {
    field: 'netContents',
    label: 'Net Contents',
    expected,
    found: '',
    status: 'skipped',
  };
  if (!expected.trim()) return { ...base, note: 'No net contents provided in application.' };

  // Normalize volume units: "750 mL" == "750ml", "1 L" == "1l", "1.5 liters" == "1.5l".
  const normVol = (s: string) =>
    normalize(s)
      .replace(/milliliters?|millilitres?/g, 'ml')
      .replace(/liters?|litres?/g, 'l')
      .replace(/(\d)\s+(ml|l|oz|cl)\b/g, '$1$2');

  const wanted = normVol(expected);
  const haystack = normVol(text);
  if (haystack.includes(wanted) || fuzzyContains(haystack, wanted, 0.85)) {
    return { ...base, found: expected, status: 'pass' };
  }
  return { ...base, status: 'fail', note: 'Net contents not found on label.' };
}

/**
 * The government warning must be EXACT: word-for-word text, and the literal
 * "GOVERNMENT WARNING:" prefix must be in ALL CAPS (per 27 CFR 16.22 and
 * Jenny's note about title-case rejections).
 */
function verifyGovernmentWarning(text: string): FieldResult {
  const base: FieldResult = {
    field: 'governmentWarning',
    label: 'Government Warning',
    expected: GOVERNMENT_WARNING,
    found: '',
    status: 'fail',
  };

  const collapsed = collapseWhitespace(text);

  // 1) The prefix must exist in ALL CAPS.
  const hasAllCapsPrefix = /GOVERNMENT WARNING:/.test(collapsed);
  const hasAnyCasePrefix = /government warning:/i.test(collapsed);

  if (!hasAnyCasePrefix) {
    return { ...base, note: 'Government warning statement is missing.' };
  }
  if (!hasAllCapsPrefix) {
    return {
      ...base,
      found: '(prefix not in all caps)',
      note: '"GOVERNMENT WARNING:" must be in all capital letters. Found different casing.',
    };
  }

  // 2) The full statement must match word-for-word (case-insensitive on the body,
  //    tolerant of OCR whitespace/punctuation noise).
  const idx = collapsed.indexOf('GOVERNMENT WARNING:');
  const candidate = collapsed.substring(idx);
  const sim = similarity(normalize(candidate.substring(0, GOVERNMENT_WARNING.length + 40)), normalize(GOVERNMENT_WARNING));

  if (sim >= 0.95) {
    return { ...base, found: 'GOVERNMENT WARNING: …', status: 'pass' };
  }
  if (sim >= 0.85) {
    return {
      ...base,
      found: 'GOVERNMENT WARNING: …',
      status: 'warning',
      note: 'Warning text is close but not an exact match — recommend manual review (possible OCR noise or altered wording).',
    };
  }
  return {
    ...base,
    found: 'GOVERNMENT WARNING: (text differs)',
    note: 'Warning statement wording does not match the required exact text.',
  };
}

/** Run all field checks and roll up an overall result. */
export function verifyLabel(app: ApplicationData, extractedText: string): VerificationResult {
  const fields: FieldResult[] = [
    verifyBrandName(app.brandName ?? '', extractedText),
    verifyClassType(app.classType, extractedText),
    verifyAlcoholContent(app.alcoholContent ?? '', extractedText),
    verifyNetContents(app.netContents ?? '', extractedText),
    verifyGovernmentWarning(extractedText),
  ];

  const considered = fields.filter((f) => f.status !== 'skipped');
  const hasFail = considered.some((f) => f.status === 'fail');
  const hasWarn = considered.some((f) => f.status === 'warning');
  const overall: VerificationResult['overall'] = hasFail ? 'fail' : hasWarn ? 'warning' : 'pass';

  return { overall, fields, extractedText };
}

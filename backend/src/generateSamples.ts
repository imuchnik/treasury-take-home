/**
 * Generates sample label images for testing/demo.
 * Produces one compliant label and a few non-compliant variants that exercise
 * the verification edge cases raised in the stakeholder interviews.
 */
import fs from 'fs';
import path from 'path';
import { createCanvas } from 'canvas';
import { GOVERNMENT_WARNING } from './verify';

const OUT_DIR = path.join(__dirname, '..', '..', 'samples');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

interface LabelSpec {
  fileName: string;
  brand: string;
  classType: string;
  abv: string;
  net: string;
  warning: string;
}

function wrap(text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

function draw(spec: LabelSpec): void {
  const width = 900;
  const height = 640;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fdfcf7';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#8a6d3b';
  ctx.lineWidth = 6;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  ctx.fillStyle = '#1a1a1a';
  ctx.textBaseline = 'top';

  ctx.font = 'bold 38px Arial';
  ctx.fillText(spec.brand, 50, 90);

  ctx.font = '28px Arial';
  ctx.fillText(spec.classType, 50, 160);

  ctx.font = '28px Arial';
  ctx.fillText(spec.abv, 50, 210);
  ctx.fillText(spec.net, 50, 255);

  ctx.font = '20px Arial';
  let y = 335;
  for (const line of wrap(spec.warning, 62)) {
    ctx.fillText(line, 50, y);
    y += 30;
  }

  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
  fs.writeFileSync(path.join(OUT_DIR, spec.fileName), buffer);
  console.log('Wrote', spec.fileName);
}

const specs: LabelSpec[] = [
  {
    fileName: 'label-compliant.jpg',
    brand: 'OLD TOM DISTILLERY',
    classType: 'Kentucky Straight Bourbon Whiskey',
    abv: '45% Alc./Vol. (90 Proof)',
    net: '750 mL',
    warning: GOVERNMENT_WARNING,
  },
  {
    // Government warning in title case -> should be REJECTED (Jenny's example).
    fileName: 'label-bad-warning-case.jpg',
    brand: 'RIVER BEND VODKA',
    classType: 'Premium Vodka',
    abv: '40% Alc./Vol. (80 Proof)',
    net: '1 L',
    warning: GOVERNMENT_WARNING.replace('GOVERNMENT WARNING:', 'Government Warning:'),
  },
  {
    // Missing government warning entirely -> REJECTED.
    fileName: 'label-missing-warning.jpg',
    brand: 'SUNSET RIDGE WINERY',
    classType: 'Napa Valley Cabernet Sauvignon',
    abv: '13.5% Alc./Vol.',
    net: '750 mL',
    warning: '',
  },
  {
    // Brand casing/punctuation differs -> should PASS via fuzzy match (Dave's case).
    fileName: 'label-brand-casing.jpg',
    brand: "Stone's Throw",
    classType: 'India Pale Ale',
    abv: '6.5% Alc./Vol.',
    net: '355 mL',
    warning: GOVERNMENT_WARNING,
  },
];

for (const s of specs) draw(s);
console.log('Sample labels written to', OUT_DIR);

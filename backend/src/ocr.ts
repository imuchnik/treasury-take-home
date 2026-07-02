/**
 * OCR abstraction.
 *
 * Default engine is Tesseract.js, which runs fully offline/on-box. This matters
 * because (per the IT interview) the agency firewall blocks most outbound
 * traffic to cloud ML endpoints. An optional OCR.space cloud engine can be
 * enabled by setting OCR_ENGINE=ocrspace and providing OCR_API_KEY.
 */
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import { createWorker, Worker } from 'tesseract.js';

const ENGINE = (process.env.OCR_ENGINE || 'tesseract').toLowerCase();
const OCR_API_KEY = process.env.OCR_API_KEY;

let workerPromise: Promise<Worker> | null = null;

/** Lazily create and reuse a single Tesseract worker (warm start => faster). */
async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      // PSM 3 = fully automatic page segmentation. This reads multi-size text
      // blocks (including large bold titles) more reliably than the default.
      await worker.setParameters({ tessedit_pageseg_mode: '3' as any });
      return worker;
    })();
  }
  return workerPromise;
}

async function tesseractOcr(imagePath: string): Promise<string> {
  const worker = await getWorker();
  const { data } = await worker.recognize(imagePath);
  return data.text || '';
}

async function ocrSpaceOcr(imagePath: string): Promise<string> {
  if (!OCR_API_KEY) {
    throw new Error('OCR_ENGINE=ocrspace requires OCR_API_KEY to be set.');
  }
  const form = new FormData();
  form.append('apikey', OCR_API_KEY);
  form.append('OCREngine', '2');
  form.append('file', fs.createReadStream(imagePath));

  const res = await axios.post('https://api.ocr.space/parse/image', form, {
    headers: form.getHeaders(),
    timeout: 20000,
  });
  const parsed = res.data?.ParsedResults?.[0]?.ParsedText;
  if (typeof parsed !== 'string') {
    throw new Error(res.data?.ErrorMessage || 'OCR.space returned no text.');
  }
  return parsed;
}

/** Extract text from an image file using the configured engine. */
export async function extractText(imagePath: string): Promise<string> {
  if (ENGINE === 'ocrspace') return ocrSpaceOcr(imagePath);
  return tesseractOcr(imagePath);
}

/** Warm up the OCR engine at boot so the first request is fast. */
export async function warmUp(): Promise<void> {
  if (ENGINE === 'tesseract') {
    await getWorker();
  }
}

export function engineName(): string {
  return ENGINE;
}

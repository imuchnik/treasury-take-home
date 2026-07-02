import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';

import { extractText, warmUp, engineName } from './ocr';
import { verifyLabel, ApplicationData, VerificationResult } from './verify';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per image
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are accepted.'));
  },
});

interface VerifyResponseItem {
  index: number;
  fileName: string;
  success: boolean;
  message?: string;
  durationMs?: number;
  result?: VerificationResult;
}

function readApplicationData(body: Record<string, unknown>): ApplicationData {
  return {
    brandName: (body.brandName as string) || '',
    classType: (body.classType as string) || '',
    alcoholContent: (body.alcoholContent as string) || '',
    netContents: (body.netContents as string) || '',
  };
}

async function processOne(
  file: Express.Multer.File,
  app: ApplicationData,
  index: number
): Promise<VerifyResponseItem> {
  const start = Date.now();
  try {
    const text = await extractText(file.path);
    const result = verifyLabel(app, text);
    return {
      index,
      fileName: file.originalname,
      success: true,
      durationMs: Date.now() - start,
      result,
    };
  } catch (err) {
    return {
      index,
      fileName: file.originalname,
      success: false,
      message: err instanceof Error ? err.message : 'Unknown error during processing.',
    };
  } finally {
    fs.promises.unlink(file.path).catch(() => undefined);
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ocrEngine: engineName() });
});

/** Single-label verification. */
app.post('/api/verify', upload.single('label'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ success: false, message: 'A label image is required.' });
  }
  const appData = readApplicationData(req.body);
  const item = await processOne(file, appData, 0);
  return res.json(item);
});

/**
 * Batch verification. Accepts multiple label images under the field name
 * "labels" and a JSON array "applications" describing the expected data for
 * each, aligned by index. Images are processed in parallel for speed.
 */
app.post('/api/verify-batch', upload.array('labels', 300), async (req, res) => {
  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) {
    return res.status(400).json({ success: false, message: 'At least one label image is required.' });
  }

  let applications: ApplicationData[] = [];
  try {
    applications = JSON.parse((req.body.applications as string) || '[]');
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid applications JSON.' });
  }

  const items = await Promise.all(
    files.map((file, i) => processOne(file, applications[i] || {}, i))
  );

  return res.json({ success: true, items });
});

/**
 * In production the built frontend is copied to backend/public. Serve it so the
 * whole app (UI + API) runs from a single URL/host. Any non-API route falls
 * back to index.html so client-side routing works.
 */
const CLIENT_DIR = path.join(__dirname, '..', 'public');
if (fs.existsSync(path.join(CLIENT_DIR, 'index.html'))) {
  app.use(express.static(CLIENT_DIR));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(CLIENT_DIR, 'index.html'));
  });
  console.log(`Serving frontend from ${CLIENT_DIR}`);
}

app.listen(PORT, async () => {
  console.log(`Label verifier backend listening on http://localhost:${PORT}`);
  console.log(`OCR engine: ${engineName()}`);
  try {
    await warmUp();
    console.log('OCR engine warmed up and ready.');
  } catch (err) {
    console.warn('OCR warm-up failed (will retry on first request):', err);
  }
});

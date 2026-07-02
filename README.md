# AI-Powered Alcohol Label Verification (Prototype)

A proof-of-concept web app that helps TTB compliance agents verify that an
alcohol label's artwork matches the data in the application. An agent enters the
expected fields, uploads the label photo, and gets a clear, field-by-field
**Pass / Fail / Review** result in a few seconds.

This directory (`solution/`) is a self-contained implementation.

---

## What it checks

For each label the app compares the uploaded image against the application data:

| Field | How it's verified |
|-------|-------------------|
| **Brand Name** | Fuzzy match tolerant of case & punctuation (`STONE'S THROW` == `Stone's Throw`). Close-but-not-exact matches are flagged **Review** for human judgment. |
| **Class / Type** | Fuzzy substring match. |
| **Alcohol Content** | Numeric match that understands **ABV ↔ Proof** (`90 Proof` == `45% ABV`) with tolerance for small OCR error. |
| **Net Contents** | Unit-normalized match (`750 mL` == `750ml`, `1 L` == `1l`). |
| **Government Warning** | **Exact** check: the statement must match word-for-word **and** the `GOVERNMENT WARNING:` prefix must be in **ALL CAPS** (per 27 CFR 16.22). Title-case, altered wording, or missing warning → **Fail**. |

The rollup is **Fail** if any field fails, **Review** if any field is borderline,
otherwise **Pass**. Results are advisory — the agent makes the final call.

---

## Why these design choices (mapping to stakeholder needs)

- **Fast (< 5s).** The interview called out that anything slower than ~5s won't
  get used. OCR runs on a warm, reused worker; sample labels verify in
  **0.5–1.7s** each. Batch images are processed **in parallel**.
- **Works behind the firewall.** IT noted outbound traffic to cloud ML endpoints
  is often blocked. The default OCR engine is **Tesseract.js**, which runs
  **fully on-box with no external calls**. An optional OCR.space cloud engine is
  available via config if desired.
- **Usable by non-technical agents.** Large fonts, high contrast, obvious
  buttons, plain-language results, per-field explanations, image preview, and a
  mobile-friendly layout. Designed against the "my 73-year-old mother" benchmark.
- **Batch uploads.** Importers dump 200–300 applications at once, so the UI and
  the `/api/verify-batch` endpoint accept many labels in one submission.
- **Human judgment preserved.** Borderline brand/warning matches are surfaced as
  **Review** rather than auto-rejected (Dave's "STONE'S THROW" nuance).
- **No sensitive data retained.** Uploaded images are deleted immediately after
  processing.

---

## Architecture

```
solution/
├── backend/          Node + Express + TypeScript API
│   └── src/
│       ├── index.ts            Express server & routes
│       ├── ocr.ts              OCR abstraction (Tesseract default, OCR.space optional)
│       ├── verify.ts           Pure verification logic (no I/O, unit-tested)
│       ├── verify.test.ts      Assertion-based tests for the logic
│       └── generateSamples.ts  Generates demo label images
├── frontend/         React + TypeScript single-page app
│   └── src/
│       ├── App.tsx    Form, batch handling, results UI
│       └── api.ts     Typed API client
└── samples/          Generated demo labels (compliant + non-compliant)
```

The verification logic (`verify.ts`) is deliberately **pure** (no OCR/HTTP) so it
is easy to unit-test and reason about; OCR is a swappable adapter.

---

## Running locally

**Prerequisites:** Node.js 18+ and npm. No API keys required for the default
(offline) OCR engine.

### 1. Backend

```bash
cd solution/backend
npm install
cp .env.example .env      # optional; defaults are fine
npm run dev               # dev mode with reload
# or: npm run build && npm start
```

The API listens on `http://localhost:3001` (override with `PORT`).
Check it: `curl http://localhost:3001/api/health`

### 2. Frontend

```bash
cd solution/frontend
npm install
npm start                 # opens http://localhost:3000
```

The frontend proxies API calls to `http://localhost:3001` in development (see
`proxy` in `package.json`). For a production build, set `REACT_APP_API_BASE` to
the deployed backend URL and run `npm run build`.

> **Port already in use?** If `3001` is taken, start the backend on another port
> (`PORT=4000 npm run dev`) and update the `proxy` value in
> `frontend/package.json` to match, then restart the frontend.

### 3. Generate sample labels (optional)

```bash
cd solution/backend
npm run gen-samples       # writes images to solution/samples/
```

### 4. Run the tests

```bash
cd solution/backend
npm test
```

---

## Deployment (single URL)

For a shareable prototype, the app deploys as **one service**: the Express
backend serves both the API (`/api/*`) and the compiled React UI (everything
else). This gives reviewers a single clickable URL.

### Combined production build (run from `solution/`)

```bash
npm run build     # installs deps, builds frontend + backend, copies UI into backend/public
npm start         # serves UI + API on $PORT (default 3001)
```

Then open `http://localhost:3001`.

### Deploy to Render (recommended)

A `render.yaml` blueprint is included. Steps:

1. Push this repo to GitHub.
2. In Render → **New → Blueprint**, point it at the repo.
   - If you push only the `solution/` folder as the repo root, the blueprint
     works as-is. If you push the whole take-home repo, set `rootDir: solution`
     in `render.yaml`.
3. Render runs `npm run build` then `npm start`. Health check: `/api/health`.
4. **OCR on the free tier:** offline Tesseract is memory-heavy for 512 MB
   instances, so the blueprint defaults to the lighter cloud engine
   (`OCR_ENGINE=ocrspace`). Add a free `OCR_API_KEY` from
   [ocr.space/ocrapi](https://ocr.space/ocrapi) in the Render dashboard
   (marked `sync: false` so it isn't committed). To use offline OCR instead,
   set `OCR_ENGINE=tesseract` and choose an instance with more memory.

The same build/start commands work on any Node host (Railway, Fly.io, Azure App
Service, etc.).

---

## API

- `GET /api/health` → `{ status, ocrEngine }`
- `POST /api/verify` (multipart) — single label
  - `label`: image file
  - `brandName`, `classType`, `alcoholContent`, `netContents`: form fields
- `POST /api/verify-batch` (multipart) — many labels
  - `labels`: one or more image files
  - `applications`: JSON array of `{ brandName, classType, alcoholContent, netContents }`, aligned by index

Example:

```bash
cd solution/samples
curl -X POST http://localhost:3001/api/verify-batch \
  -F "labels=@label-compliant.jpg" \
  -F 'applications=[{"brandName":"OLD TOM DISTILLERY","classType":"Kentucky Straight Bourbon Whiskey","alcoholContent":"45% Alc./Vol. (90 Proof)","netContents":"750 mL"}]'
```

---

## OCR engine configuration

Set in `backend/.env`:

```
OCR_ENGINE=tesseract        # default, fully offline
# OCR_ENGINE=ocrspace       # cloud fallback
# OCR_API_KEY=...           # required only for ocrspace
```

---

## Sample labels (in `samples/`)

| File | Purpose | Expected result |
|------|---------|-----------------|
| `label-compliant.jpg` | Fully compliant bourbon | **Pass** |
| `label-brand-casing.jpg` | Brand `Stone's Throw` vs app `STONE'S THROW` | **Pass** (fuzzy) |
| `label-bad-warning-case.jpg` | Warning in Title Case | **Fail** (warning not all-caps) |
| `label-missing-warning.jpg` | No warning statement | **Fail** (warning missing) |

---

## Assumptions & limitations

- **OCR quality drives accuracy.** Tesseract handles clean labels well but can
  misread tiny/ambiguous strings (e.g. a short "1 L" may read as "TIL"). In those
  cases the tool safely reports the field as not confirmed rather than guessing.
  A production system could add image pre-processing (deskew, contrast, upscale)
  or a stronger OCR model, and let agents manually correct a mis-read field.
- **Prototype, not COLA-integrated.** This is a standalone PoC; no COLA
  integration, auth, or persistent storage, consistent with the stated scope.
- **English labels** assumed for OCR; other languages would need additional
  Tesseract language packs.
- **Not for production PII/retention** as-is. Images are processed in memory and
  deleted; a production deployment would add the usual federal compliance
  controls (retention policy, audit logging, access control).
- **Thresholds are tunable.** Fuzzy-match similarity thresholds were chosen for
  reasonable behavior on test data and can be calibrated against a labeled
  dataset.

---

## Possible next steps

- Image pre-processing pipeline to handle glare / angle / low light (Jenny's ask).
- Editable OCR results so agents can correct a mis-read field and re-check.
- Confidence scores per field surfaced in the UI.
- Persisted audit trail of decisions for compliance.
- CSV/COLA import to pre-fill application data for large batches.

/**
 * Copies the built React app (frontend/build) into backend/public so the
 * Express server can serve the UI and API from a single host/URL.
 * Cross-platform (no shell dependency) for use on CI / Render / etc.
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'frontend', 'build');
const dest = path.join(__dirname, '..', 'backend', 'public');

if (!fs.existsSync(src)) {
  console.error('Frontend build not found at', src, '- run the frontend build first.');
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });

console.log('Copied frontend build ->', dest);

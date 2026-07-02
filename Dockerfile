# ---- Build stage ----
FROM node:20-bookworm-slim AS build

# Native build deps for node-canvas (used by the sample generator).
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install all deps (frontend + backend) using lockfiles for reproducibility.
COPY package.json ./
COPY backend/package.json backend/package-lock.json ./backend/
COPY frontend/package.json frontend/package-lock.json ./frontend/

RUN npm --prefix backend ci && npm --prefix frontend ci

# Copy sources and build (frontend -> backend/dist -> copy UI into backend/public).
COPY . .
RUN npm run build:frontend \
    && npm run build:backend \
    && npm run copy:client

# ---- Runtime stage ----
FROM node:20-bookworm-slim AS runtime

# Runtime shared libs for node-canvas.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

ENV NODE_ENV=production
ENV OCR_ENGINE=tesseract
ENV PORT=8080

# Bring over production node_modules, compiled server, and the built UI.
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/package.json ./package.json
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/public ./public

EXPOSE 8080

CMD ["node", "dist/index.js"]

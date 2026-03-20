FROM node:20-slim

# Install Playwright dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libasound2 \
    && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/crawler/package.json ./packages/crawler/
COPY packages/seo-engine/package.json ./packages/seo-engine/
COPY packages/au-engine/package.json ./packages/au-engine/
COPY packages/geo-engine/package.json ./packages/geo-engine/
COPY packages/scoring/package.json ./packages/scoring/
COPY packages/reporter/package.json ./packages/reporter/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/

RUN npm install --omit=dev

COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN npm run build

EXPOSE 3100

CMD ["node", "apps/api/dist/server.js"]

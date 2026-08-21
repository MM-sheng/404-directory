# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.service.json ./
COPY src ./src
RUN npx tsc -p tsconfig.service.json

FROM node:20-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4040 \
    HEADLESS=true \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npx playwright install --with-deps --only-shell chromium \
  && npm cache clean --force \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/dist ./dist
COPY app/favicon.ico ./app/favicon.ico
COPY drizzle ./drizzle
COPY README.md .env.example ./

EXPOSE 4040

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4040)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then node dist/db/migrate.js; fi && node dist/server.js"]

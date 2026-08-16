# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/playwright:v1.62.1-jammy AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.service.json ./
COPY src ./src
RUN npx tsc -p tsconfig.service.json

FROM mcr.microsoft.com/playwright:v1.62.1-jammy
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4040 \
    HEADLESS=true \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY README.md .env.example ./

EXPOSE 4040

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4040)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER pwuser
CMD ["node", "dist/server.js"]

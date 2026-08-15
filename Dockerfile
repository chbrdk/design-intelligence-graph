# Playwright includes the matching Chromium runtime and all Linux browser libraries.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json ./web/
RUN npm ci && npm ci --prefix web

COPY . ./

RUN npm run build && npm run web:build

ENV DIG_IN_CONTAINER=1
EXPOSE 8787

# Default: serve the slim web UI + job API. Override with `docker compose run dig …`.
CMD ["node", "dist/src/web-server.js"]

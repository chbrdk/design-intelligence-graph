# DIG Next island for Coolify — sibling layout like CHECKION v3.
# Context: repository root (design-intelligence-graph).
# Coolify: Dockerfile path `/Dockerfile`, domain https://dig.projects-a.plygrnd.tech
#
# Sibling DS: fetches github.com/chbrdk/msqdx-ui at MSQDX_UI_REF next to the app
# so file: deps and webpack aliases (`../../../msqdx-ui/…`) resolve.

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

# ---- Design system (msqdx-ui) ----
FROM base AS ds
ARG MSQDX_UI_REPO=https://github.com/chbrdk/msqdx-ui.git
# Pin: bump when DIG barrels need newer primitives (ChatOverlay / ReactNode return).
ARG MSQDX_UI_REF=fabd43b44a8d4c24adfe14d2a538260a577e788f
RUN git init /workspace/msqdx-ui \
    && cd /workspace/msqdx-ui \
    && git remote add origin "${MSQDX_UI_REPO}" \
    && git fetch --depth 1 origin "${MSQDX_UI_REF}" \
    && git checkout --force FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "${MSQDX_UI_REF}" \
    && printf 'node-linker=hoisted\n' > .npmrc \
    && pnpm install --frozen-lockfile \
    && pnpm --filter @msqdx/ui-tokens build \
    && rm -rf node_modules \
    && find . -type d -name node_modules -prune -exec rm -rf {} +

# ---- Builder ----
FROM base AS builder
ENV NODE_ENV=development
COPY --from=ds /workspace/msqdx-ui /workspace/msqdx-ui
COPY . /workspace/design-intelligence-graph
WORKDIR /workspace/design-intelligence-graph/apps/web

RUN --mount=type=cache,target=/root/.npm \
    npm install --no-audit --no-fund --include=dev --legacy-peer-deps

# One React tree for app + DS source (see msqdx-ui/knowledge/react-types-dedupe.md).
RUN test -d /workspace/msqdx-ui/packages/ui/src \
    && test -f /workspace/msqdx-ui/packages/ui-tokens/dist/index.js \
    && test -f /workspace/msqdx-ui/packages/ui/src/components/ChatOverlay.tsx \
    && rm -rf /workspace/msqdx-ui/node_modules \
    && ln -s /workspace/design-intelligence-graph/apps/web/node_modules /workspace/msqdx-ui/node_modules \
    && test -d /workspace/msqdx-ui/node_modules/react

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=6144
# Blank secrets during build so Next does not SSG against live Plexon/API.
RUN AUTH_SECRET= \
    PLEXON_SERVICE_SECRET= \
    PLEXON_AUTH_URL= \
    DIG_API_URL= \
    npm run build \
    && rm -f /workspace/msqdx-ui/node_modules

# ---- Runner ----
FROM ${NODE_IMAGE} AS runner
WORKDIR /workspace/design-intelligence-graph/apps/web

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3010
ENV HOSTNAME=0.0.0.0
ENV DIG_FEDERATION_MODE=dummy
EXPOSE 3010

COPY --from=builder /workspace/design-intelligence-graph/apps/web/package.json ./package.json
COPY --from=builder /workspace/design-intelligence-graph/apps/web/package-lock.json ./package-lock.json
COPY --from=builder /workspace/design-intelligence-graph/apps/web/node_modules ./node_modules
COPY --from=builder /workspace/design-intelligence-graph/apps/web/.next ./.next
COPY --from=builder /workspace/design-intelligence-graph/apps/web/next.config.ts ./next.config.ts
COPY --from=builder /workspace/design-intelligence-graph/apps/web/tsconfig.json ./tsconfig.json
COPY --from=builder /workspace/design-intelligence-graph/apps/web/public ./public
COPY --from=builder /workspace/msqdx-ui /workspace/msqdx-ui

# Keep DS peer resolution at runtime (SSR barrels).
RUN ln -sfn /workspace/design-intelligence-graph/apps/web/node_modules /workspace/msqdx-ui/node_modules

CMD ["npm", "run", "start"]

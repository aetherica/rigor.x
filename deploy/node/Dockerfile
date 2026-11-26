# syntax=docker/dockerfile:1
# Portable Node runtime for the Aetherica (RIGOR-X) MCP server.
# Build from the repository root:  docker build -f deploy/node/Dockerfile -t aetherica-node .
# Run:  docker run --env-file deploy/node/.env -p 8787:8787 -v aetherica-data:/data aetherica-node
# (No VOLUME instruction: some hosts refuse it; mount persistent storage at DATA_DIR yourself.)
# NODE_IMAGE may point at a registry mirror of the SAME digest, e.g.
#   --build-arg NODE_IMAGE=mirror.gcr.io/library/node:24.11.1-bookworm-slim@sha256:48abc13a19400ca3985071e287bd405a1d99306770eb81d61202fb6b65cf0b57
ARG NODE_IMAGE=node:24.11.1-bookworm-slim@sha256:48abc13a19400ca3985071e287bd405a1d99306770eb81d61202fb6b65cf0b57

FROM ${NODE_IMAGE} AS deps
WORKDIR /app/deploy/cloudflare-ts
COPY deploy/cloudflare-ts/package.json deploy/cloudflare-ts/package-lock.json ./
# Production dependencies only (the OAuth provider); lockfile-exact, no install scripts.
# Behind a TLS-inspecting proxy, pass its CA as a build secret (never stored in the image):
#   docker build --secret id=npm_ca,src=/path/to/ca.pem ...
RUN --mount=type=secret,id=npm_ca,required=false \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=8787
WORKDIR /app
COPY --from=deps /app/deploy/cloudflare-ts/node_modules deploy/cloudflare-ts/node_modules
COPY deploy/cloudflare-ts/package.json deploy/cloudflare-ts/
COPY deploy/cloudflare-ts/src deploy/cloudflare-ts/src
COPY deploy/cloudflare-ts/public deploy/cloudflare-ts/public
COPY deploy/node/package.json deploy/node/*.ts deploy/node/*.mjs deploy/node/
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--import", "./deploy/node/register.mjs", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "deploy/node/server.ts"]

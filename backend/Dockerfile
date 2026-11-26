# Backend image. Build context is the repository root: npm workspaces share the root package-lock.json.
#   docker build -f backend/Dockerfile -t seatholder-backend .
# Configuration (APP_ENV, DATABASE_URL, ...) comes from the environment at run time; nothing secret is baked in.
# Multi-arch: the same file builds linux/amd64 and linux/arm64 (Fargate on Graviton).

FROM node:24.22.3-alpine3.24@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS base
WORKDIR /app

# Build: all dependencies, Prisma client generation, TypeScript compile.
FROM base AS build
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci -w backend --ignore-scripts
COPY tsconfig.base.json ./
COPY backend/ backend/
RUN npm run db:generate -w backend \
  && npm run build -w backend -- --sourceMap false

# Runtime: production dependencies and compiled output only. No sources, tests or dev tooling.
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
# --omit=optional also drops the Prisma CLI and TypeScript, which the lockfile keeps as optional peers of @prisma/client.
RUN npm ci --omit=dev --omit=optional -w backend --ignore-scripts \
  && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist

# The listening port is the BACKEND_PORT of the config module (default 3001); pass the same value at run time.
# The container listens on all interfaces; the host-run example (.env.example) binds 127.0.0.1 instead.
ARG BACKEND_PORT=3001
ENV BACKEND_HOST=0.0.0.0
ENV BACKEND_PORT=${BACKEND_PORT}
EXPOSE ${BACKEND_PORT}

USER node

# busybox wget ships with the base image. The ALB health check uses the same path.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${BACKEND_PORT}/api/health" || exit 1

# node is PID 1 and handles SIGTERM itself (graceful shutdown in backend/src/shutdown.ts).
CMD ["node", "backend/dist/server.js"]

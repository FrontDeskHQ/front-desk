# Build context is the repo root (workspace deps live across apps/, packages/, connectors/).
FROM oven/bun:1.3.5

WORKDIR /app
COPY . .

# Scoped to connector-host so root dev deps with native builds (evalite -> better-sqlite3) are skipped.
RUN bun install --frozen-lockfile --filter connector-host --ignore-scripts
RUN bunx turbo@2.7.3 build -F connector-host...

WORKDIR /app/connectors/host
ENV NODE_ENV=production
CMD ["bun", "dist/index.js"]

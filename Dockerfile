# 9t — production image (Next.js + encrypted phone socket on the same port)
# Build: docker build -t 9t .
# Run:   docker compose up -d --build

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
ENV NODE_ENV=production
# Webpack build matches the low-memory VPS practice (see HANDOFF.md);
# Turbopack needs more RAM than small hosts reliably have.
RUN npm run build -- --webpack
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
  PORT=3265 \
  NINE_T_HOST=0.0.0.0 \
  NINE_T_DATA_DIR=/data \
  NINE_T_BACKUP_DIR=/data/backups
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/middleware.ts ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
RUN mkdir -p /data/objects && chown -R node:node /app /data
USER node
VOLUME ["/data"]
EXPOSE 3265
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3265/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/serve.mjs"]

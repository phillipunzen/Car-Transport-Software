# ---------- Abhängigkeiten ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---------- Build ----------
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npx next build

# ---------- Laufzeit ----------
FROM node:22-alpine AS runner
RUN npm install -g prisma@6.19.3 \
 && mkdir -p /data/uploads && chown -R node:node /data
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/data/uploads

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/assets ./assets
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

USER node
EXPOSE 3000
VOLUME ["/data/uploads"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]

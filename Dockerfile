# Ski Alpina — Container für Coolify (rasselbande.work)
#
# Ein Container, zwei Prozesse (scripts/docker-serve.mjs): App auf $PORT (8080),
# Spiel-Socket auf 127.0.0.1:8788, /ws wird intern weitergereicht.
# Migrationen laufen beim Start, nicht beim Build: Coolify baut ohne Datenbank.
#
# Der NUC baut ohne BuildKit, daher bewusst schlicht gehalten.
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --legacy-peer-deps --no-audit --no-fund

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DOCKER_PREVIEW=1
# Ohne DATABASE_URL überspringt `npm run build` die Migrationen (siehe oben).
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    DOCKER_PREVIEW=1 \
    PORT=8080 \
    WS_PORT=8788
# Vite wird zur Laufzeit gebraucht (`vite preview`), daher der ganze Baum.
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/docker-serve.mjs"]

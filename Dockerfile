# CapiLAR backend image (PWA-190).
#
# Two targets:
# - runtime (the default, last stage): the API, with production dependencies only.
#     docker build -t capilar-api .
# - migrate: everything needed to run `prisma migrate deploy` and the seed, once per deploy.
#     docker build --target migrate -t capilar-migrate .

# Node 24, as package.json "engines" asks for.
FROM node:24-bookworm-slim AS base
WORKDIR /app

# All dependencies (dev included): to build, and for the Prisma CLI and tsx in "migrate".
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Generates the Prisma client (src/generated, not in git) and compiles to dist/.
FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

# Runs the pending migrations; the seed with: npx prisma db seed
FROM build AS migrate
# Without the "update to Prisma 8" box on every run: the project stays on Prisma 7.
ENV PRISMA_HIDE_UPDATE_MESSAGE=true
CMD ["npx", "prisma", "migrate", "deploy"]

# Production dependencies only, without the CLI, Jest, TypeScript...
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
# The salon's time zone, as on the machines where the app was developed and tested (the server's
# default is UTC). Dates and times are already handled with SALON_TIME_ZONE; this also keeps the
# log in local time.
ENV TZ=America/Argentina/Buenos_Aires
# Profile photos. A volume goes here so they survive new deploys (docker-compose.prod.yml).
ENV UPLOADS_DIR=/app/uploads

COPY --from=prod-deps /app/node_modules ./node_modules
# dist/ already has the generated Prisma client and the mail templates.
COPY --from=build /app/dist ./dist
COPY package.json ./

# Without root. The folder is created here so a new volume takes its owner (node).
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node

EXPOSE 3000

# Up and connected to the database. With the database down GET /health takes ~10 s to answer
# 503 (the connection pool's wait), so the timeout is longer than that.
HEALTHCHECK --interval=30s --timeout=15s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# node directly (not npm start): it gets Docker's SIGTERM and Nest closes in order.
CMD ["node", "dist/main.js"]

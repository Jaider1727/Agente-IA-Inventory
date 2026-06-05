# Stage 1 — install production dependencies only
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts --omit=dev

# Stage 2 — production image
FROM node:20-alpine AS production

WORKDIR /app

# Copy production modules and source — owned by the non-root node user
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node package.json ./

ENV NODE_ENV=production

# Run as non-root for least-privilege
USER node

# PORT may be injected at runtime (reverse proxy / orchestrator); 3000 default
EXPOSE 3000

CMD ["node", "src/app.js"]

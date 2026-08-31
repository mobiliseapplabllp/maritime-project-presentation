# Mundra Port Operations Portal — single-container app image (API + built UI).
FROM node:22-alpine AS ui
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY backend/ ./
COPY --from=ui /app/frontend/dist /app/frontend/dist
COPY frontend/src/ai/engine.js /app/frontend/src/ai/engine.js
ENV NODE_ENV=production PORT=5200 SEED_IF_EMPTY=1
EXPOSE 5200
CMD ["node", "server.js"]

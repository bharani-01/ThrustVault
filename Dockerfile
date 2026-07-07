# ── Stage 1: Build the React Frontend ──────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy frontend packages and install dependencies
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source and build the static bundle
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Package the Backend Server ──────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Copy root packages and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code and static directories
COPY src/ ./src
COPY public/ ./public
COPY server.js ./

# Copy built React frontend assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose server port
EXPOSE 8000

# Set production environment and run
ENV NODE_ENV=production
CMD ["node", "server.js"]

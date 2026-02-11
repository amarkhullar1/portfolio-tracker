# Stage 1: Build the frontend
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Production image
FROM node:20-alpine

WORKDIR /app

# Copy package.json and install production deps only
COPY package.json ./
RUN npm install --omit=dev

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy server
COPY server ./server

# Create data directory
RUN mkdir -p /app/data

# The data directory is a volume mount point
VOLUME /app/data

EXPOSE 3001

ENV NODE_ENV=production
ENV DATA_DIR=/app/data

CMD ["node", "server/index.js"]

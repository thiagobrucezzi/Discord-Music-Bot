# Discord music bot — lightweight image (Node 20 LTS)
# Built for linux/amd64 in CI (the Oracle Micro VM is AMD x86_64).
FROM node:20-slim

WORKDIR /app

# Install dependencies first to take advantage of layer caching
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# App code
COPY . .

ENV NODE_ENV=production

# The bot only makes outbound connections (Discord gateway + internal Lavalink),
# it does not expose any port.
CMD ["node", "index.js"]

# Bot de música Discord — imagen liviana (Node 20 LTS)
# Construida para linux/amd64 en CI (la VM Oracle Micro es AMD x86_64).
FROM node:20-slim

WORKDIR /app

# Instalar dependencias primero para aprovechar la cache de capas
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Código de la app
COPY . .

ENV NODE_ENV=production

# El bot solo hace conexiones salientes (gateway de Discord + Lavalink interno),
# no expone ningún puerto.
CMD ["node", "index.js"]

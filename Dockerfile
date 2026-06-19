# syntax=docker/dockerfile:1
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Dépendances d'abord (meilleur cache de build)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Code applicatif
COPY server.js ./
COPY public ./public

# Exécution en utilisateur non-root (l'image node fournit l'utilisateur `node`)
USER node

EXPOSE 3000

# Vérification de santé via l'endpoint dédié
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

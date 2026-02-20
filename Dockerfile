# ==========================================
# ÉTAPE 1 : BUILD NESTJS (L'Usine TypeScript)
# ==========================================
FROM node:20-alpine AS build

WORKDIR /usr/src/app

# Installation de toutes les dépendances (y compris dev pour le build)
COPY package*.json ./
RUN npm ci

# Copie du code source complet
COPY . .

# Compilation du TypeScript en JavaScript (génère le dossier /dist)
RUN npm run build

# ==========================================
# ÉTAPE 2 : PRODUCTION (Le Serveur Allégé)
# ==========================================
FROM node:20-alpine AS production

WORKDIR /usr/src/app

# On ne réinstalle QUE les dépendances de production (pas de modules de test ou de dev)
COPY package*.json ./
RUN npm ci --only=production

# On récupère UNIQUEMENT le code compilé de l'étape 1
COPY --from=build /usr/src/app/dist ./dist

# On expose le port 8000 par défaut (bien qu'Azure écrasera ça avec sa variable PORT)
EXPOSE 8000

# On lance le code compilé directement avec Node (hyper rapide, sans watch mode, logs sur stdout)
CMD ["node", "dist/main"]
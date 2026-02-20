FROM node:20-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
# On crée le dossier de logs pour que Promtail puisse le lire
RUN mkdir -p /var/log/arcal 
CMD ["sh", "-c", "npm run start:dev > /var/log/arcal/app.log 2>&1"]
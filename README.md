# 🧠 ARCAL - Orchestrator Service

L'Orchestrateur est le service central (API REST & Client gRPC) chargé de piloter l'infrastructure Azure et le cycle de vie des ventes. Il agit comme le cerveau du système : il fait le pont entre les requêtes HTTP du Frontend (Vue.js) et le pilotage bas niveau des Moteurs de vente (Engines) dans le Cloud.

Il est conçu pour être **Stateless** : il se synchronise avec l'état réel du Cloud au démarrage.



## 🛠 Stack Technique

* **Framework :** NestJS (Node.js)
* **Cloud Provider :** Microsoft Azure (Container Apps, ACR, VNet)
* **Communication Inter-Services :** gRPC / Protobuf (`@nestjs/microservices`, `@grpc/grpc-js`)
* **SDKs Azure :**
    * `@azure/arm-appcontainers` (Provisioning dynamique des conteneurs)
    * `@azure/identity` (Authentification Service Principal / Managed Identity)

## ✨ Fonctionnalités Clés

### 1. Provisioning Dynamique & Connexion gRPC (`spawn`)
Lorsqu'une demande de création arrive depuis le dashboard admin, l'orchestrateur effectue une séquence complexe :
1. **Création (Scale-from-Zero) :** Utilise le SDK Azure pour spawner une nouvelle **Container App** isolée.
2. **Configuration Réseau (Dual-Ingress) :** - Ouvre le port `3000` en **externe** (WSS) pour autoriser les acheteurs (Front-end Vue.js) à s'y connecter.
   - Ouvre le port `50051` en **interne** (VNet Azure uniquement) pour sécuriser le pilotage de la vente.
3. **Pilotage (gRPC) :** Dès que l'IP interne est disponible, l'Orchestrateur instancie un proxy gRPC à la volée, se connecte au port `50051` du nouveau Moteur, et lui envoie l'ordre de démarrage (`StartSale`).

### 2. Destruction (`kill`)
Permet de supprimer une ressource Azure spécifique (le Moteur) pour arrêter la facturation (Scale-to-Zero) et libérer les ressources.

### 3. Synchronisation d'État (Auto-Discovery)
Afin de ne pas perdre la trace des ventes en cas de redémarrage ou de mise à l'échelle de l'Orchestrateur lui-même :
* Au lancement (`OnModuleInit`), le service scanne le Resource Group Azure.
* Il liste toutes les apps correspondant aux ventes actives.
* Il reconstruit le tableau des sessions en mémoire.

## 🔌 API Endpoints (REST)

| Méthode | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/sales` | Renvoie la liste JSON des ventes actives et leur URL WebSocket publique. |
| `POST` | `/sales/spawn` | Body: `{ "saleId": "vente-01" }`. Provisionne le Moteur sur Azure et initialise la boucle gRPC. |
| `DELETE` | `/sales/:id` | Détruit le conteneur Azure associé à l'ID. |
## ⚙️ Configuration (.env)

Ce fichier est critique. Il doit contenir les identifiants du **Service Principal** Azure.
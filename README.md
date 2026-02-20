# 🧠 ARCAL - Orchestrator Service

L'Orchestrateur est le service central (API REST) chargé de piloter l'infrastructure Azure. Il agit comme une passerelle de gestion entre le Frontend et le Cloud.

Il est conçu pour être **Stateless** : il se synchronise avec l'état réel du Cloud au démarrage.

## 🛠 Stack Technique

* **Framework :** NestJS (Node.js)
* **Cloud Provider :** Microsoft Azure (Container Apps)
* **SDKs :**
    * `@azure/arm-appcontainers` (Gestion des conteneurs)
    * `@azure/identity` (Authentification Service Principal)
    * `dotenv` (Gestion des variables d'environnement)

## ✨ Fonctionnalités Clés

### 1. Provisioning à la demande (`spawn`)
Lorsqu'une demande de création arrive, l'orchestrateur :
1.  Utilise le SDK Azure pour créer une nouvelle **Container App**.
2.  Lui attribue l'image Docker définie dans `ENGINE_IMAGE` (gérée par le script de déploiement).
3.  Configure les ressources (0.5 CPU / 1Gi RAM) et l'Ingress (WebSocket actif).
4.  Injecte les crédentials du Registre Privé (ACR) pour que Azure puisse pull l'image.

### 2. Destruction (`kill`)
Permet de supprimer une ressource Azure spécifique pour arrêter la facturation et nettoyer l'environnement.

### 3. Synchronisation d'État (Auto-Discovery)
Afin de ne pas perdre la trace des ventes en cas de redémarrage du serveur local :
* Au lancement (`OnModuleInit`), le service scanne le Resource Group Azure.
* Il liste toutes les apps commençant par le préfixe `market-`.
* Il reconstruit le tableau des ventes actives en mémoire.

## 🔌 API Endpoints

| Méthode | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/sales` | Renvoie la liste JSON des ventes actives et leur URL WebSocket. |
| `POST` | `/sales/spawn` | Body: `{ "saleId": "Paris" }`. Crée une nouvelle instance Azure. |
| `DELETE` | `/sales/:id` | Supprime l'instance Azure associée à l'ID. |

## ⚙️ Configuration (.env)

Ce fichier est critique. Il doit contenir les identifiants du **Service Principal** Azure.

# Installation
npm install

# Lancement en mode développement (Watch)
npm run start:dev

🚀 Lancement
Bash

# Installation
npm install

# Lancement en mode développement (Watch)
npm run start:dev
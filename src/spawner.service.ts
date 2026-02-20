import { Injectable, Logger } from '@nestjs/common';
import { ContainerAppsAPIClient } from '@azure/arm-appcontainers';
import { DefaultAzureCredential } from '@azure/identity';
import { ClientGrpcProxy, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class SpawnerService {
    private subscriptionId = process.env.AZURE_SUBSCRIPTION_ID!;
    private resourceGroup = process.env.AZURE_RESOURCE_GROUP!;
    private location = process.env.AZURE_LOCATION || 'francecentral';
    private containerAppEnvId = process.env.AZURE_CONTAINER_ENV_ID!;
    private registryUrl = process.env.AZURE_REGISTRY_URL!;
    private image = process.env.ENGINE_IMAGE!;

    private readonly logger = new Logger(SpawnerService.name);
    
    async listActiveContainers() {
        const credential = new DefaultAzureCredential();
        const client = new ContainerAppsAPIClient(credential, this.subscriptionId);
        const sales: any[] = []

        // On demande à Azure la liste de tout ce qui tourne dans le Resource Group
        for await (const app of client.containerApps.listByResourceGroup(this.resourceGroup)) {
            if (app.name && app.name.startsWith('market-')) {
                // On récupère le nom de l'image (ex: acrarcal...:v20260213-111039)
                const fullImage = app.template?.containers?.[0]?.image || '';
                // On ne garde que ce qui est après le ":" (le tag)
                const version = fullImage.split(':').pop() || 'unknown';

                sales.push({
                    id: app.name.replace('market-', ''),
                    name: app.name,
                    url: `wss://${app.configuration?.ingress?.fqdn}`,
                    version: version // 👈 On ajoute l'info ici
                });
            }
        }
        return sales;
    }

    async killSaleInstance(saleId: string) {
        const safeId = saleId.toLowerCase().replace(/[^a-z0-9-]/g, '');
        const appName = `market-${safeId}`;

        const credential = new DefaultAzureCredential();
        const client = new ContainerAppsAPIClient(credential, this.subscriptionId);

        console.log(`Demande de suppression pour : ${appName}...`);

        try {
            // On demande la suppression et on attend qu'Azure confirme
            await client.containerApps.beginDeleteAndWait(this.resourceGroup, appName);
            console.log(`${appName} a été détruit.`);
            return { status: 'deleted', saleId };
        } catch (error) {
            console.error("Erreur suppression Azure:", error);
            throw error;
        }
    }

    async spawnSaleInstance(saleId: string) {
        const safeId = saleId.toLowerCase().replace(/[^a-z0-9-]/g, '');
        const appName = `market-${safeId}`;
        const credential = new DefaultAzureCredential();
        const client = new ContainerAppsAPIClient(credential, this.subscriptionId);

        console.log(`🚀 Démarrage du déploiement pour : ${appName}...`);

        try {
            const result = await client.containerApps.beginCreateOrUpdateAndWait(
                this.resourceGroup,
                appName,
                {
                    location: this.location,
                    //environmentId: this.containerAppEnvId,
                    managedEnvironmentId: this.containerAppEnvId,
                    configuration: {
                        ingress: {
                            // 1. LA PORTE PRINCIPALE : Pour ton Front-end (Vue.js)
                            external: true,
                            targetPort: 3000,
                            transport: 'auto', // Gère parfaitement le WSS (WebSocket)
                            
                            // 2. LA PORTE DE SERVICE : Pour le gRPC (L'Orchestrateur)
                            additionalPortMappings: [
                                {
                                    external: false, // 👈 LE FIX EST ICI : Seul le réseau Azure interne y a accès
                                    targetPort: 50051,
                                    exposedPort: 50051
                                }
                            ]
                        },
                        secrets: [
                            { name: 'registry-password', value: process.env.REGISTRY_PASSWORD || '' }
                        ],
                        registries: [
                            {
                                server: this.registryUrl,
                                username: process.env.REGISTRY_USERNAME,
                                passwordSecretRef: 'registry-password'
                            }
                        ]
                    },
                    template: {
                        containers: [
                            {
                                name: 'engine',
                                image: this.image,
                                resources: { cpu: 0.25, memory: '0.5Gi' },

                                env: [
                                    { name: 'PORT', value: '3000' },
                                    { name: 'SALE_ID', value: saleId },

                                    // On passe les infos LiveKit (L'orchestrateur les lit de SON propre .env)
                                    { name: 'LIVEKIT_URL', value: process.env.LIVEKIT_URL },
                                    { name: 'LIVEKIT_API_KEY', value: process.env.LIVEKIT_API_KEY },
                                    { name: 'LIVEKIT_API_SECRET', value: process.env.LIVEKIT_API_SECRET },

                                    // 1. REDIS (Interne à Azure)
                                    // On utilise le FQDN interne à Azure pour que le trafic reste dans le réseau privé (meilleure sécurité et latence)
                                    { name: 'VALKEY_HOST', value: process.env.VALKEY_HOST },
                                    { name: 'VALKEY_PORT', value: process.env.VALKEY_PORT },
                                    { name: 'VALKEY_PASSWORD', value: process.env.VALKEY_PASSWORD },
                                ]
                            }
                        ]
                    }
                }
            );

            console.log(`✅ ${appName} déployé !`);

            const fqdn = result.configuration?.ingress?.fqdn;

            if (!fqdn) {
                throw new Error("Pas d'URL publique/privée générée par Azure !");
            }

            // 🌟 NOUVEAU : On connecte le gRPC à l'instance fraîchement créée 🌟
            try {
                const grpcResponse = await this.notifyEngineViaGrpc(saleId, fqdn);
                this.logger.log(`Réponse gRPC de l'Engine : ${grpcResponse.message}`);
            } catch (grpcError) {
                this.logger.error(`Le conteneur est créé, mais le ping gRPC a échoué: ${grpcError.message}`);
                // Note : En prod, tu voudras peut-être faire un "retry" ou un fallback ici
            }

            return {
                saleId,
                appName,
                url: `wss://${fqdn}`, // Pour ton front (WebSocket)
                grpcUrl: `${fqdn}:50051` // Pour info (Pilotage interne)
            };

        } catch (error: any) {
            console.log("❌ --- ERREUR AZURE DÉTAILLÉE ---");

            // 1. On cherche le message de validation précis
            if (error.response?.body) {
                console.error("Message du serveur :", JSON.stringify(error.response.body, null, 2));
            }
            // 2. Si c'est un problème de structure d'objet (Validation SDK)
            else if (error.details) {
                console.error("Détails structurels :", JSON.stringify(error.details, null, 2));
            }
            // 3. Cas général
            else {
                console.error("Message d'erreur :", error.message);
            }

            throw error;
        }

    }

    private async notifyEngineViaGrpc(saleId: string, fqdn: string) {
        this.logger.log(`Tentative de connexion gRPC vers ${fqdn}:50051...`);

        // 1. Instanciation dynamique du proxy
        const grpcClient = new ClientGrpcProxy({
            package: 'sale',
            protoPath: join(__dirname, '../proto/sale.proto'), // ⚠️ Vérifie que le dossier proto est bien copié dans 'dist' lors du build
            url: `${fqdn}:50051`,
        });

        // 2. Récupération de l'interface typée
        const saleService = grpcClient.getService<SaleEngineService>('SaleEngineService');

        // 3. Envoi du message et attente de la réponse
        // On utilise firstValueFrom pour convertir l'Observable RxJS en une Promesse classique
        const response = await firstValueFrom(saleService.startSale({ saleId }));
        
        // 4. On ferme proprement la connexion pour éviter les fuites de mémoire
        grpcClient.close();

        return response;
    }
}

export interface StartSaleResponse {
    success: boolean;
    message: string;
}

// Mets à jour l'interface de ton service pour utiliser ce type
interface SaleEngineService {
    startSale(data: { saleId: string }): import('rxjs').Observable<StartSaleResponse>;
}
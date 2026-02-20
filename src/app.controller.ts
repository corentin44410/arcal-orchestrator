import { Controller, Get, Post, Body, Delete, Param, OnModuleInit } from '@nestjs/common'; // 👈 Ajout de OnModuleInit
import { SpawnerService } from './spawner.service';

@Controller('sales')
export class AppController implements OnModuleInit { 
  
  private activeSales: any[] = [];

  constructor(private readonly spawner: SpawnerService) {}

  async onModuleInit() {
    console.log("Démarrage : Synchronisation avec Azure...");
    try {
      // On récupère la vraie liste chez Azure
      const realSales = await this.spawner.listActiveContainers();
      this.activeSales = realSales;
      console.log(`✅ Synchronisation terminée : ${this.activeSales.length} ventes trouvées.`);
    } catch (error) {
      console.error("⚠️ Impossible de synchroniser avec Azure (Check tes credentials)", error);
    }
  }

  @Get()
  getSales() {
    return this.activeSales;
  }

  @Post('spawn')
  async createSale(@Body('saleId') saleId: string) {
    const saleInstance = await this.spawner.spawnSaleInstance(saleId);
    
    this.activeSales.push({
        id: saleId,
        name: `Vente ${saleId}`,
        url: saleInstance.url
    });

    return saleInstance;
  }

  @Delete(':id')
  async deleteSale(@Param('id') id: string) {
    await this.spawner.killSaleInstance(id);
    this.activeSales = this.activeSales.filter(s => s.id !== id);
    return { message: 'Sale deleted' };
  }
}
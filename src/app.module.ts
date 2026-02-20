import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; 
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { AppController } from './app.controller';
import { SpawnerService } from './spawner.service';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, 
      envFilePath: '.env',
    }),
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),
  ],
  controllers: [AppController],
  providers: [SpawnerService, AppService],
})
export class AppModule {}
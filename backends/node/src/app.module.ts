import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentController } from './agent/agent.controller';
import { CatalogController } from './catalog/catalog.controller';
import { DrizzleModule } from './db/drizzle.service';
import { validateEnv } from './env.config';
import { AnalyticsController } from './semantic/analytics.controller';
import { SalesAggregatorService } from './semantic/sales-aggregator.service';
import { SchemaService } from './semantic/schema.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), DrizzleModule],
  controllers: [AnalyticsController, CatalogController, AgentController],
  providers: [SalesAggregatorService, SchemaService],
})
export class AppModule {}

import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { EnvironmentVariables } from '../env.config';

/**
 * Database access for the whole backend. Every connection of the pool announces its data scope as
 * the startup parameter analytics.territory_group; the analytics views return no rows without it.
 */
@Injectable()
export class DrizzleService implements OnModuleDestroy {
  private readonly client: postgres.Sql;
  readonly db: PostgresJsDatabase;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.client = postgres(config.get('DATABASE_URL', { infer: true }), {
      max: 10,
      connection: { 'analytics.territory_group': config.get('DATA_SCOPE', { infer: true }) },
    });
    this.db = drizzle(this.client);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.end();
  }
}

@Global()
@Module({
  providers: [DrizzleService],
  exports: [DrizzleService],
})
export class DrizzleModule {}

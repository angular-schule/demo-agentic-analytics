import { plainToInstance, Transform } from 'class-transformer';
import { IsIn, IsInt, IsString, Max, Min, validateSync } from 'class-validator';

const DATA_SCOPES = ['*', 'Europe', 'North America', 'Pacific'] as const;
export type DataScope = (typeof DATA_SCOPES)[number];

/** Environment of the backend. An invalid value stops the start-up. */
export class EnvironmentVariables {
  /** postgres://analytics_reader:…@host:5432/adventureworks */
  @IsString()
  DATABASE_URL!: string;

  /** Sales territory group this backend may see. */
  @IsIn(DATA_SCOPES)
  DATA_SCOPE!: DataScope;

  /**
   * The agent's model as a Mastra model-router string: provider, slash, model. The provider's API key
   * comes from its usual environment variable (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY).
   */
  @IsString()
  MODEL = 'anthropic/claude-sonnet-5-5';

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 8080;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(env);
  if (errors.length > 0) {
    throw new Error(`Invalid environment: ${errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; ')}`);
  }
  return env;
}

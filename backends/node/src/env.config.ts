import { plainToInstance, Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

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
   * comes from its usual environment variable (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, MISTRAL_API_KEY).
   */
  @IsString()
  MODEL = 'anthropic/claude-sonnet-5-5';

  // Mastra reads the keys from the environment itself; they are listed here so the start can check them.
  @IsOptional() @IsString() ANTHROPIC_API_KEY?: string;
  @IsOptional() @IsString() OPENAI_API_KEY?: string;
  @IsOptional() @IsString() GOOGLE_GENERATIVE_AI_API_KEY?: string;
  @IsOptional() @IsString() MISTRAL_API_KEY?: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 8080;
}

const API_KEYS = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
} as const;
export type ApiKeyVariable = (typeof API_KEYS)[keyof typeof API_KEYS];

/**
 * Why the agent cannot run with this model, in words for whoever starts the demo; undefined when it can.
 * The backend still starts: the dashboard works without the model, and the chat shows this text.
 */
export function modelProblem(model: string, apiKey: (variable: ApiKeyVariable) => string | undefined): string | undefined {
  const [provider = ''] = model.split('/');
  const variable = (API_KEYS as Record<string, ApiKeyVariable | undefined>)[provider];
  if (!variable || model.length <= provider.length + 1) {
    return `MODEL=${model} names no provider this demo supports (anthropic, openai, google, mistral). Set MODEL in agent/.env, see agent/.env.example, and restart.`;
  }
  if (!apiKey(variable)) {
    return `MODEL=${model} needs ${variable}. Add it to agent/.env, see agent/.env.example, and restart.`;
  }
  return undefined;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(env);
  if (errors.length > 0) {
    throw new Error(`Invalid environment: ${errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; ')}`);
  }
  return env;
}

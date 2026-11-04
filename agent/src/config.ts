// Mastra reports usage to PostHog unless this is set. It is read on every capture, so setting it
// before the first agent run is enough.
process.env['MASTRA_TELEMETRY_DISABLED'] ??= '1';

/**
 * The model as a Mastra model-router string: provider, slash, model. The provider's API key comes
 * from its usual environment variable (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, MISTRAL_API_KEY).
 */
export const MODEL = process.env['MODEL'] ?? 'anthropic/claude-sonnet-5-5';

const API_KEYS: Record<string, string | undefined> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
};

/**
 * Why the agent cannot run with this model, in words for whoever starts the demo; undefined when it can.
 * The service still starts, and the chat shows this text.
 */
export function modelProblem(model: string, env: Record<string, string | undefined>): string | undefined {
  const [provider = ''] = model.split('/');
  const variable = API_KEYS[provider];
  if (!variable || model.length <= provider.length + 1) {
    return `MODEL=${model} names no provider this demo supports (anthropic, openai, google, mistral). Set MODEL in agent/.env, see agent/.env.example, and restart.`;
  }
  if (!env[variable]) {
    return `MODEL=${model} needs ${variable}. Add it to agent/.env, see agent/.env.example, and restart.`;
  }
  return undefined;
}

export const MODEL_PROBLEM = modelProblem(MODEL, process.env);

/** Base URL of the backend (.NET or Node, same contract). */
export const DATA_API_URL = (process.env['DATA_API_URL'] ?? 'http://127.0.0.1:8081').replace(/\/$/, '');

export const PORT = Number(process.env['PORT'] ?? 4111);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error(`PORT must be a port number, not '${process.env['PORT']}'.`);

/**
 * The agent spends the API key on every request and has no login, so it listens on localhost only.
 * In a container HOST=0.0.0.0 makes it reachable for the frontend container, not for the network.
 */
export const HOST = process.env['HOST'] ?? '127.0.0.1';

/** Browser origin allowed to call the agent directly (the Angular dev server proxies instead). */
export const ALLOWED_ORIGIN = process.env['ALLOWED_ORIGIN'] ?? 'http://localhost:4200';

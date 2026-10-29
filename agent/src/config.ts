// Mastra reports usage to PostHog unless this is set. It is read on every capture, so setting it
// before the first agent run is enough.
process.env['MASTRA_TELEMETRY_DISABLED'] ??= '1';

/**
 * The model as a Mastra model-router string: provider, slash, model. The provider's API key comes
 * from its usual environment variable (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY).
 */
export const MODEL = process.env['MODEL'] ?? 'anthropic/claude-sonnet-5-5';

/** Base URL of the data backend (.NET or Node, same contract). */
export const DATA_API_URL = (process.env['DATA_API_URL'] ?? 'http://127.0.0.1:8081').replace(/\/$/, '');

export const PORT = Number(process.env['PORT'] ?? 4111);

/**
 * The agent spends the API key on every request and has no login, so it listens on localhost only.
 * In a container HOST=0.0.0.0 makes it reachable for the frontend container, not for the network.
 */
export const HOST = process.env['HOST'] ?? '127.0.0.1';

/** Browser origin allowed to call the agent directly (the Angular dev server proxies instead). */
export const ALLOWED_ORIGIN = process.env['ALLOWED_ORIGIN'] ?? 'http://localhost:4200';

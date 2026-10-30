import type { AngularToolCall } from '@copilotkit/angular';

export type ToolResult<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

/**
 * Reads the result of a server tool. The agent's tools answer with JSON: their data, or
 * `{ error }` when the data backend refused or failed. Mastra itself answers arguments that fail
 * the tool's schema with `{ error: true, message }`. Returns undefined while the call runs.
 */
export function readToolResult<T, A extends Record<string, unknown>>(
  call: AngularToolCall<A>,
  isValue: (output: object) => boolean,
): ToolResult<T> | undefined {
  if (call.status !== 'complete') return undefined;
  let output: unknown;
  try {
    output = JSON.parse(call.result);
  } catch {
    output = undefined;
  }
  if (typeof output === 'object' && output !== null) {
    if (isValue(output)) return { value: output as T };
    if ('error' in output && typeof output.error === 'string') return { error: output.error };
    if ('message' in output && typeof output.message === 'string') return { error: output.message };
  }
  return { error: 'The agent returned no readable result.' };
}

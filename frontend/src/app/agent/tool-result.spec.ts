import type { AngularToolCall } from '@copilotkit/angular';
import { readToolResult } from './tool-result';

type Args = Record<string, unknown>;
const call = (status: string, result?: string) => ({ status, result, args: {} }) as unknown as AngularToolCall<Args>;
const isRows = (output: object) => 'rows' in output;

describe('readToolResult', () => {
  it('waits while the call runs', () => {
    expect(readToolResult(call('executing'), isRows)).toBeUndefined();
  });

  it('returns the data', () => {
    expect(readToolResult(call('complete', '{"rows":[]}'), isRows)).toEqual({ value: { rows: [] } });
  });

  it('returns the message of the semantic layer', () => {
    expect(readToolResult(call('complete', '{"error":"Unknown measure \'salary\'."}'), isRows)).toEqual({
      error: "Unknown measure 'salary'.",
    });
  });

  it("returns the message of Mastra's schema check", () => {
    expect(readToolResult(call('complete', '{"error":true,"message":"Tool input validation failed."}'), isRows)).toEqual({
      error: 'Tool input validation failed.',
    });
  });

  it('does not fail on text that is not JSON', () => {
    expect(readToolResult(call('complete', 'Internal Server Error'), isRows)).toEqual({
      error: 'The agent returned no readable result.',
    });
  });
});

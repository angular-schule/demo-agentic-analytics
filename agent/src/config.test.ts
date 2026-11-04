import assert from 'node:assert/strict';
import { test } from 'node:test';
import { modelProblem } from './config.ts';

test('a model with its API key can run', () => {
  assert.equal(modelProblem('anthropic/claude-sonnet-5-5', { ANTHROPIC_API_KEY: 'key' }), undefined);
});

test('a missing API key names the variable and where it belongs', () => {
  assert.equal(
    modelProblem('google/gemini-3-flash-preview', { ANTHROPIC_API_KEY: 'key' }),
    'MODEL=google/gemini-3-flash-preview needs GOOGLE_GENERATIVE_AI_API_KEY. Add it to agent/.env, see agent/.env.example, and restart.',
  );
});

test('an unknown provider or a model without a name lists the supported providers', () => {
  for (const model of ['ollama/llama3', 'anthropic', 'anthropic/']) {
    assert.match(modelProblem(model, {}) ?? '', /names no provider this demo supports \(anthropic, openai, google, mistral\)/);
  }
});

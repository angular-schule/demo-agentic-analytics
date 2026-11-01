// The LLM for the tests: it answers with scripted tool calls and texts instead of a real model, so
// the agents can be tested without cost and with repeatable results. It runs on the server of the
// demo model (demo-model/server.mjs) and so speaks every API format the agents use. The agents
// reach it through ANTHROPIC_BASE_URL, MISTRAL_BASE_URL or OPENAI_BASE_URL (see compose.test.yaml).
//
// The script picks the answer from the last message:
//   - a tool result          -> a short text that quotes the tool name
//   - "revenue per year"     -> querySales, line chart of revenue per year
//   - "pin"                  -> pinToDashboard with the same view (a frontend tool)
//   - "salary"               -> querySales with a measure that does not exist
//   - "mountain"             -> findProducts for Mountain-200
//   - "brakes"               -> findResellers for Brakes and Gears
//   - "slow"                 -> a long text in small pieces, for stopping a run
//   - anything else          -> "Hello from the fake model."
import { serve } from '../demo-model/server.mjs';

const REVENUE_PER_YEAR = { title: 'Revenue per year', chart: 'line', query: { measures: ['revenue'], groupBy: ['year'] } };

serve(({ messages }) => {
  const last = messages.at(-1);
  if (last.role === 'tool') return { text: `The ${last.name} result is shown above.` };
  const text = last.role === 'user' ? last.text.toLowerCase() : '';
  if (text.includes('slow')) return { text: 'This answer streams slowly. '.repeat(60), delayMs: 100 };
  if (text.includes('pin')) return { tool: 'pinToDashboard', input: REVENUE_PER_YEAR };
  if (text.includes('salary')) return { tool: 'querySales', input: { title: 'Salaries', chart: 'bar', query: { measures: ['salary'] } } };
  if (text.includes('brakes')) return { tool: 'findResellers', input: { search: 'Brakes and Gears' } };
  if (text.includes('mountain')) return { tool: 'findProducts', input: { search: 'Mountain-200', limit: 4 } };
  if (text.includes('revenue per year')) return { tool: 'querySales', input: REVENUE_PER_YEAR };
  return { text: 'Hello from the fake model.' };
});

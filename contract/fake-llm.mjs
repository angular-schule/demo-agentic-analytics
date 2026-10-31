// A stand-in for the Anthropic Messages API, for the tests: it answers with scripted tool calls and
// texts instead of a real model, so the agents can be tested without cost and without chance.
// Both agents reach it through ANTHROPIC_BASE_URL (see compose.test.yaml).
//
// The script picks the answer from the last message:
//   - a tool result          -> a short text that quotes the tool name
//   - "revenue per year"     -> querySales, line chart of revenue per year
//   - "pin"                  -> pinToDashboard with the same view (a frontend tool)
//   - "salary"               -> querySales with a measure that does not exist
//   - "mountain"             -> findProducts for Mountain-200
//   - "slow"                 -> a long text in small pieces, for stopping a run
//   - anything else          -> "Hello from the fake model."
//
// GET /requests returns every request body received, DELETE /requests forgets them.
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.PORT ?? 4000);
const REVENUE_PER_YEAR = { title: 'Revenue per year', chart: 'line', query: { measures: ['revenue'], groupBy: ['year'] } };

const requests = [];
let nextId = 1;

function lastMessage(body) {
  const message = body.messages.at(-1);
  const blocks = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content;
  return { role: message.role, blocks };
}

function script(body) {
  const { blocks } = lastMessage(body);
  const toolResult = blocks.find((b) => b.type === 'tool_result');
  if (toolResult) {
    const call = body.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).find((b) => b.type === 'tool_use' && b.id === toolResult.tool_use_id);
    return { text: `The ${call?.name ?? 'tool'} result is shown above.` };
  }
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join(' ').toLowerCase();
  if (text.includes('slow')) return { text: 'This answer streams slowly. '.repeat(60), delayMs: 100 };
  if (text.includes('pin')) return { tool: 'pinToDashboard', input: REVENUE_PER_YEAR };
  if (text.includes('salary')) return { tool: 'querySales', input: { title: 'Salaries', chart: 'bar', query: { measures: ['salary'] } } };
  if (text.includes('mountain')) return { tool: 'findProducts', input: { search: 'Mountain-200', limit: 4 } };
  if (text.includes('revenue per year')) return { tool: 'querySales', input: REVENUE_PER_YEAR };
  return { text: 'Hello from the fake model.' };
}

/** The Anthropic stream for one answer: one text block or one tool_use block. */
function* events(body, answer) {
  const id = `msg_fake_${nextId++}`;
  yield ['message_start', { type: 'message_start', message: { id, type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }];
  if (answer.tool) {
    const toolId = `toolu_fake_${nextId++}`;
    const json = JSON.stringify(answer.input);
    yield ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: toolId, name: answer.tool, input: {} } }];
    for (let i = 0; i < json.length; i += 20) {
      yield ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + 20) } }];
    }
  } else {
    yield ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }];
    for (const piece of answer.text.match(/.{1,24}/gs) ?? []) {
      yield ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } }];
    }
  }
  yield ['content_block_stop', { type: 'content_block_stop', index: 0 }];
  yield ['message_delta', { type: 'message_delta', delta: { stop_reason: answer.tool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } }];
  yield ['message_stop', { type: 'message_stop' }];
}

const server = createServer(async (request, response) => {
  const path = request.url ?? '/';
  if (path === '/requests' && request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(requests));
    return;
  }
  if (path === '/requests' && request.method === 'DELETE') {
    requests.length = 0;
    response.writeHead(204).end();
    return;
  }
  // The Anthropic SDKs differ in whether the base URL includes /v1, so any path ending in /messages counts.
  if (request.method !== 'POST' || !path.endsWith('/messages')) {
    response.writeHead(404).end();
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const record = { body, apiKey: request.headers['x-api-key'] ?? null, completed: false, aborted: false };
  requests.push(record);
  response.on('close', () => {
    record.aborted = !record.completed;
  });

  const answer = script(body);
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  for (const [name, data] of events(body, answer)) {
    if (response.destroyed) return;
    response.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    if (answer.delayMs) await sleep(answer.delayMs);
  }
  record.completed = true;
  response.end();
});

server.listen(PORT, '0.0.0.0', () => console.log(`Fake LLM on port ${PORT}`));

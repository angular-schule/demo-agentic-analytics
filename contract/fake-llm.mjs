// A stand-in for an LLM provider, for the tests: it answers with scripted tool calls and texts
// instead of a real model, so the agents can be tested without cost and with repeatable results.
// It speaks two formats: Anthropic's Messages API (/messages) and OpenAI's Chat Completions
// (/chat/completions), which OpenAI, Gemini and Mistral offer, too. The agents reach it through
// ANTHROPIC_BASE_URL or MISTRAL_BASE_URL (see compose.test.yaml).
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

const textOf = (content) =>
  typeof content === 'string' ? content : (content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join(' ');

/** The last message in both formats: the name of the tool whose result it carries, or its text. */
function lastMessage(body, format) {
  const message = body.messages.at(-1);
  if (format === 'openai') {
    if (message.role !== 'tool') return { text: textOf(message.content) };
    const call = body.messages.flatMap((m) => m.tool_calls ?? []).find((c) => c.id === message.tool_call_id);
    return { toolResultOf: call?.function?.name ?? 'tool' };
  }
  const blocks = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content;
  const toolResult = blocks.find((b) => b.type === 'tool_result');
  if (!toolResult) return { text: textOf(blocks) };
  const call = body.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).find((b) => b.type === 'tool_use' && b.id === toolResult.tool_use_id);
  return { toolResultOf: call?.name ?? 'tool' };
}

function script(body, format) {
  const last = lastMessage(body, format);
  if (last.toolResultOf) return { text: `The ${last.toolResultOf} result is shown above.` };
  const text = last.text.toLowerCase();
  if (text.includes('slow')) return { text: 'This answer streams slowly. '.repeat(60), delayMs: 100 };
  if (text.includes('pin')) return { tool: 'pinToDashboard', input: REVENUE_PER_YEAR };
  if (text.includes('salary')) return { tool: 'querySales', input: { title: 'Salaries', chart: 'bar', query: { measures: ['salary'] } } };
  if (text.includes('mountain')) return { tool: 'findProducts', input: { search: 'Mountain-200', limit: 4 } };
  if (text.includes('revenue per year')) return { tool: 'querySales', input: REVENUE_PER_YEAR };
  return { text: 'Hello from the fake model.' };
}

/** The Anthropic stream for one answer: one text block or one tool_use block. */
function* anthropicEvents(body, answer) {
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

/** The Chat Completions stream for one answer: text deltas or one tool call. */
function* openaiEvents(body, answer) {
  const id = `chatcmpl-fake-${nextId++}`;
  // The usage travels in the last chunk, as with Mistral; OpenAI's SDK reads it there, too.
  const chunk = (delta, finish = null) => [null, {
    id, object: 'chat.completion.chunk', created: 0, model: body.model,
    choices: [{ index: 0, delta, finish_reason: finish }],
    ...(finish ? { usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } } : {}),
  }];
  if (answer.tool) {
    const json = JSON.stringify(answer.input);
    yield chunk({ role: 'assistant', content: null, tool_calls: [{ index: 0, id: `call_fake_${nextId++}`, type: 'function', function: { name: answer.tool, arguments: '' } }] });
    for (let i = 0; i < json.length; i += 20) yield chunk({ tool_calls: [{ index: 0, function: { arguments: json.slice(i, i + 20) } }] });
    yield chunk({}, 'tool_calls');
  } else {
    yield chunk({ role: 'assistant', content: '' });
    for (const piece of answer.text.match(/.{1,24}/gs) ?? []) yield chunk({ content: piece });
    yield chunk({}, 'stop');
  }
  yield [null, '[DONE]'];
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
  // The SDKs differ in whether the base URL includes /v1, so only the end of the path counts.
  const format = path.endsWith('/messages') ? 'anthropic' : path.endsWith('/chat/completions') ? 'openai' : null;
  if (request.method !== 'POST' || !format) {
    response.writeHead(404).end();
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const apiKey = request.headers['x-api-key'] ?? request.headers['authorization']?.replace(/^Bearer /, '') ?? null;
  const record = { format, body, apiKey, completed: false, aborted: false };
  requests.push(record);
  response.on('close', () => {
    record.aborted = !record.completed;
  });

  const answer = script(body, format);
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  for (const [name, data] of format === 'openai' ? openaiEvents(body, answer) : anthropicEvents(body, answer)) {
    if (response.destroyed) return;
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    response.write(`${name ? `event: ${name}\n` : ''}data: ${payload}\n\n`);
    if (answer.delayMs) await sleep(answer.delayMs);
  }
  record.completed = true;
  response.end();
});

server.listen(PORT, '0.0.0.0', () => console.log(`Fake LLM on port ${PORT}`));

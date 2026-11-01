// An HTTP server that stands in for an LLM provider. It speaks the three API formats the agents use:
//   - Anthropic's Messages API         POST …/messages
//   - OpenAI's Chat Completions        POST …/chat/completions   (OpenAI, Gemini and Mistral in .NET, Mistral in Mastra)
//   - OpenAI's Responses API           POST …/responses          (OpenAI in Mastra)
// Each request is turned into one plain conversation, and `answer` decides what comes back:
// a text, a tool call, or both. The answer streams in the provider's format.
//
// GET /requests returns every request received, DELETE /requests forgets them.
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * @typedef {{ role: 'user', text: string }
 *   | { role: 'assistant', text: string, toolCalls: { id: string, name: string, input: unknown }[] }
 *   | { role: 'tool', name: string, output: string }} Message
 * @typedef {{ system: string, tools: string[], messages: Message[] }} Conversation
 * @typedef {{ text?: string, tool?: string, input?: unknown, delayMs?: number }} Answer
 */

const MAX_REQUESTS = 200;
let nextId = 1;
const newId = (prefix) => `${prefix}_${nextId++}`;

const textOf = (content) =>
  typeof content === 'string' ? content : (content ?? []).filter((b) => typeof b.text === 'string').map((b) => b.text).join('');

const parseArguments = (json) => {
  try {
    return JSON.parse(json || '{}');
  } catch {
    return {};
  }
};

/** @returns {Conversation} */
function anthropicConversation(body) {
  const names = new Map();
  const messages = [];
  for (const message of body.messages) {
    const blocks = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content;
    if (message.role === 'user') {
      for (const result of blocks.filter((b) => b.type === 'tool_result')) {
        messages.push({ role: 'tool', name: names.get(result.tool_use_id) ?? 'tool', output: textOf(result.content) });
      }
      const text = textOf(blocks.filter((b) => b.type === 'text'));
      if (text) messages.push({ role: 'user', text });
    } else {
      const toolCalls = blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input }));
      for (const call of toolCalls) names.set(call.id, call.name);
      messages.push({ role: 'assistant', text: textOf(blocks.filter((b) => b.type === 'text')), toolCalls });
    }
  }
  return { system: textOf(body.system), tools: (body.tools ?? []).map((t) => t.name), messages };
}

/** @returns {Conversation} */
function chatConversation(body) {
  const names = new Map();
  const messages = [];
  let system = '';
  for (const message of body.messages) {
    if (message.role === 'system' || message.role === 'developer') system += textOf(message.content);
    else if (message.role === 'user') messages.push({ role: 'user', text: textOf(message.content) });
    else if (message.role === 'tool') messages.push({ role: 'tool', name: names.get(message.tool_call_id) ?? 'tool', output: textOf(message.content) });
    else {
      const toolCalls = (message.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, input: parseArguments(c.function.arguments) }));
      for (const call of toolCalls) names.set(call.id, call.name);
      messages.push({ role: 'assistant', text: textOf(message.content), toolCalls });
    }
  }
  return { system, tools: (body.tools ?? []).map((t) => t.function.name), messages };
}

/** @returns {Conversation} */
function responsesConversation(body) {
  const names = new Map();
  const messages = [];
  let system = body.instructions ?? '';
  const input = typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : body.input;
  for (const item of input) {
    if (item.type === 'function_call') {
      names.set(item.call_id, item.name);
      const last = messages.at(-1);
      const call = { id: item.call_id, name: item.name, input: parseArguments(item.arguments) };
      if (last?.role === 'assistant') last.toolCalls.push(call);
      else messages.push({ role: 'assistant', text: '', toolCalls: [call] });
    } else if (item.type === 'function_call_output') {
      messages.push({ role: 'tool', name: names.get(item.call_id) ?? 'tool', output: typeof item.output === 'string' ? item.output : JSON.stringify(item.output) });
    } else if (item.role === 'system' || item.role === 'developer') system += textOf(item.content);
    else if (item.role === 'user') messages.push({ role: 'user', text: textOf(item.content) });
    else if (item.role === 'assistant') messages.push({ role: 'assistant', text: textOf(item.content), toolCalls: [] });
  }
  return { system, tools: (body.tools ?? []).filter((t) => t.type === 'function').map((t) => t.name), messages };
}

const pieces = (text) => text.match(/.{1,24}/gs) ?? [];
const chunksOf = (json) => json.match(/.{1,20}/gs) ?? [];

/** Anthropic's stream: a text block, a tool_use block, or both. Yields [event name, data]. */
function* anthropicEvents(body, answer) {
  yield ['message_start', { type: 'message_start', message: { id: newId('msg'), type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }];
  let index = 0;
  if (answer.text) {
    yield ['content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }];
    for (const text of pieces(answer.text)) yield ['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text } }];
    yield ['content_block_stop', { type: 'content_block_stop', index }];
    index++;
  }
  if (answer.tool) {
    yield ['content_block_start', { type: 'content_block_start', index, content_block: { type: 'tool_use', id: newId('toolu'), name: answer.tool, input: {} } }];
    for (const json of chunksOf(JSON.stringify(answer.input))) yield ['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json } }];
    yield ['content_block_stop', { type: 'content_block_stop', index }];
  }
  yield ['message_delta', { type: 'message_delta', delta: { stop_reason: answer.tool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } }];
  yield ['message_stop', { type: 'message_stop' }];
}

/** The Chat Completions stream: text deltas, then the tool call. */
function* chatEvents(body, answer) {
  const id = newId('chatcmpl');
  // The usage travels in the last chunk, as with Mistral; OpenAI's SDK reads it there, too.
  const chunk = (delta, finish = null) => [null, {
    id, object: 'chat.completion.chunk', created: 0, model: body.model,
    choices: [{ index: 0, delta, finish_reason: finish }],
    ...(finish ? { usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } } : {}),
  }];
  yield chunk({ role: 'assistant', content: '' });
  for (const content of pieces(answer.text ?? '')) yield chunk({ content });
  if (answer.tool) {
    yield chunk({ tool_calls: [{ index: 0, id: newId('call'), type: 'function', function: { name: answer.tool, arguments: '' } }] });
    for (const json of chunksOf(JSON.stringify(answer.input))) yield chunk({ tool_calls: [{ index: 0, function: { arguments: json } }] });
  }
  yield chunk({}, answer.tool ? 'tool_calls' : 'stop');
  yield [null, '[DONE]'];
}

/** The Responses API stream: one output item for the text, one for the tool call. */
function* responsesEvents(body, answer) {
  const response = { id: newId('resp'), object: 'response', created_at: 0, model: body.model, status: 'in_progress', store: body.store ?? true };
  let sequence = 0;
  const event = (type, data) => [type, { type, sequence_number: sequence++, ...data }];
  yield event('response.created', { response });
  let outputIndex = 0;
  if (answer.text) {
    const item = { type: 'message', id: newId('msg'), role: 'assistant', status: 'in_progress', content: [] };
    yield event('response.output_item.added', { output_index: outputIndex, item });
    for (const delta of pieces(answer.text)) yield event('response.output_text.delta', { item_id: item.id, output_index: outputIndex, content_index: 0, delta });
    yield event('response.output_item.done', { output_index: outputIndex, item: { ...item, status: 'completed', content: [{ type: 'output_text', text: answer.text, annotations: [] }] } });
    outputIndex++;
  }
  if (answer.tool) {
    const json = JSON.stringify(answer.input);
    const item = { type: 'function_call', id: newId('fc'), call_id: newId('call'), name: answer.tool, arguments: '', status: 'in_progress' };
    yield event('response.output_item.added', { output_index: outputIndex, item });
    for (const delta of chunksOf(json)) yield event('response.function_call_arguments.delta', { item_id: item.id, output_index: outputIndex, delta });
    yield event('response.output_item.done', { output_index: outputIndex, item: { ...item, arguments: json, status: 'completed' } });
  }
  yield event('response.completed', { response: { ...response, status: 'completed', incomplete_details: null, usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } } });
}

const FORMATS = {
  anthropic: { conversation: anthropicConversation, events: anthropicEvents },
  chat: { conversation: chatConversation, events: chatEvents },
  responses: { conversation: responsesConversation, events: responsesEvents },
};

/** The SDKs differ in whether the base URL includes /v1, so only the end of the path counts. */
function formatOf(path) {
  if (path.endsWith('/messages')) return 'anthropic';
  if (path.endsWith('/chat/completions')) return 'chat';
  if (path.endsWith('/responses')) return 'responses';
  return null;
}

/**
 * Starts the server.
 * @param {(conversation: Conversation) => Answer} answer
 */
export function serve(answer, { port = Number(process.env.PORT ?? 4000), name = 'Fake LLM' } = {}) {
  const requests = [];
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
    const format = formatOf(path);
    if (request.method !== 'POST' || !format) {
      response.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    let body;
    let conversation;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      conversation = FORMATS[format].conversation(body);
    } catch (error) {
      response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: `Unreadable request: ${error.message}` } }));
      return;
    }
    const apiKey = request.headers['x-api-key'] ?? request.headers['authorization']?.replace(/^Bearer /, '') ?? null;
    const record = { format, body, apiKey, completed: false, aborted: false };
    requests.push(record);
    if (requests.length > MAX_REQUESTS) requests.shift();
    response.on('close', () => {
      record.aborted = !record.completed;
    });

    const reply = answer(conversation);
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    for (const [event, data] of FORMATS[format].events(body, reply)) {
      if (response.destroyed) return;
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      response.write(`${event ? `event: ${event}\n` : ''}data: ${payload}\n\n`);
      if (reply.delayMs) await sleep(reply.delayMs);
    }
    record.completed = true;
    response.end();
  });
  server.listen(port, '0.0.0.0', () => console.log(`${name} on port ${port}`));
  return server;
}

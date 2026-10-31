// Agent tests: every agent (Microsoft Agent Framework in ASP.NET Core, Mastra in NestJS, Mastra as a
// separate service) answers the same AG-UI requests against the fake LLM in contract/fake-llm.mjs.
// Run with the test setup from compose.test.yaml:  node --test 'contract/*.test.mjs'
// DOTNET_API_URL, NODE_API_URL, AGENT_SERVICE_URL and FAKE_LLM_URL default to the ports from compose.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

const fakeLlm = process.env.FAKE_LLM_URL ?? 'http://127.0.0.1:4000';
const dataApi = process.env.NODE_API_URL ?? 'http://127.0.0.1:8082';
const agents = {
  'Microsoft Agent Framework (ASP.NET Core)': process.env.DOTNET_API_URL ?? 'http://127.0.0.1:8081',
  'Mastra (NestJS)': dataApi,
  'Mastra (agent service)': process.env.AGENT_SERVICE_URL ?? 'http://127.0.0.1:4111',
};
const REVENUE_PER_YEAR = { title: 'Revenue per year', chart: 'line', query: { measures: ['revenue'], groupBy: ['year'] } };
const PIN_TOOL = {
  name: 'pinToDashboard',
  description: 'Pins a view to the dashboard next to the chat.',
  parameters: { type: 'object', properties: { title: { type: 'string' }, chart: { type: 'string' }, query: { type: 'object' } }, required: ['title', 'chart', 'query'] },
};

/** One AG-UI run; returns the events in the order they arrived. */
async function run(base, text, { tools = [], signal } = {}) {
  const response = await fetch(`${base}/agent/ag-ui/analyst`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({
      threadId: crypto.randomUUID(),
      runId: crypto.randomUUID(),
      messages: [{ id: crypto.randomUUID(), role: 'user', content: text }],
      tools,
      context: [],
      state: {},
      forwardedProps: {},
    }),
    signal,
  });
  assert.equal(response.status, 200);
  return parseEvents(await response.text());
}

function parseEvents(text) {
  return text
    .split('\n\n')
    .flatMap((block) => block.split('\n').filter((line) => line.startsWith('data:')))
    .map((line) => JSON.parse(line.slice(5)));
}

const ofType = (events, type) => events.filter((e) => e.type === type);
const toolArgs = (events, id) => JSON.parse(ofType(events, 'TOOL_CALL_ARGS').filter((e) => e.toolCallId === id).map((e) => e.delta).join(''));
const text = (events) => ofType(events, 'TEXT_MESSAGE_CONTENT').map((e) => e.delta).join('');

async function fakeRequests() {
  return (await fetch(`${fakeLlm}/requests`)).json();
}

async function resetFake() {
  await fetch(`${fakeLlm}/requests`, { method: 'DELETE' });
}

/** Reads the traffic window's event stream for a moment and returns the latest state of each exchange. */
async function trafficWindow(base) {
  const abort = new AbortController();
  const response = await fetch(`${base}/agent/debug/llm`, { signal: abort.signal });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = '';
  const stop = sleep(1500).then(() => abort.abort());
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      received += decoder.decode(value, { stream: true });
    }
  } catch {
    // Aborted on purpose: the stream never ends by itself.
  }
  await stop;
  const latest = new Map(parseEvents(received).map((e) => [e.id, e]));
  return { exchanges: [...latest.values()], raw: received };
}

/** Collects every enum in a JSON schema by its path, so schemas from different generators can be compared. */
function enums(schema, path = '') {
  if (typeof schema !== 'object' || schema === null) return {};
  const found = Array.isArray(schema.enum) ? { [path]: [...schema.enum].sort() } : {};
  for (const [key, value] of Object.entries(schema)) {
    if (key !== 'enum') Object.assign(found, enums(value, `${path}/${key}`));
  }
  return found;
}

before(async () => {
  const response = await fetch(`${fakeLlm}/requests`).catch(() => null);
  assert.ok(response?.ok, `The fake LLM is not reachable at ${fakeLlm}. Start the test setup from compose.test.yaml.`);
});
after(resetFake);

for (const [name, base] of Object.entries(agents)) {
  describe(name, () => {
    test('a question becomes a querySales call, and the result is what the API returns', async () => {
      const events = await run(base, 'Revenue per year, please');
      assert.equal(events[0].type, 'RUN_STARTED');
      assert.equal(events.at(-1).type, 'RUN_FINISHED');

      const [call] = ofType(events, 'TOOL_CALL_START');
      assert.equal(call.toolCallName, 'querySales');
      assert.deepEqual(toolArgs(events, call.toolCallId), REVENUE_PER_YEAR);

      const [result] = ofType(events, 'TOOL_CALL_RESULT');
      const api = await (await fetch(`${dataApi}/api/sales/aggregate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(REVENUE_PER_YEAR.query),
      })).json();
      assert.deepEqual(JSON.parse(result.content), api);
      assert.equal(text(events), 'The querySales result is shown above.');
    });

    test('a frontend tool is left to the browser', async () => {
      const events = await run(base, 'Please pin it', { tools: [PIN_TOOL] });
      const [call] = ofType(events, 'TOOL_CALL_START');
      assert.equal(call.toolCallName, 'pinToDashboard');
      assert.deepEqual(toolArgs(events, call.toolCallId), REVENUE_PER_YEAR);
      assert.equal(ofType(events, 'TOOL_CALL_RESULT').length, 0, 'the agent must not answer for the browser');
      assert.equal(events.at(-1).type, 'RUN_FINISHED');
    });

    test('a request outside the semantic layer becomes a tool error, not a failed run', async () => {
      const events = await run(base, 'Show me the salary of every employee');
      // Mastra rejects the name against the Zod schema before the tool runs, the .NET tool in the semantic
      // layer. Either way the model learns which measures exist and can correct the request.
      const [result] = ofType(events, 'TOOL_CALL_RESULT');
      assert.ok(JSON.parse(result.content).error);
      assert.match(result.content, /revenue/);
      assert.ok(!result.content.includes('"rows"'));
      assert.equal(ofType(events, 'RUN_ERROR').length, 0);
      assert.equal(events.at(-1).type, 'RUN_FINISHED');
    });

    test('the product search returns product cards without photos in the answer', async () => {
      const events = await run(base, 'What does the Mountain bike look like?');
      const [result] = ofType(events, 'TOOL_CALL_RESULT');
      const { products } = JSON.parse(result.content);
      assert.ok(products.length > 0);
      assert.ok(products.every((p) => p.productName.startsWith('Mountain-200')));
      assert.ok(!result.content.includes('base64'), 'photos are loaded by the browser, not sent to the model');
    });

    test('the model gets the rules, both tools, compact tool results and room for long answers', async () => {
      await resetFake();
      await run(base, 'Revenue per year, please');
      const [first, second] = await fakeRequests();
      const system = Array.isArray(first.body.system) ? first.body.system.map((b) => b.text).join('') : first.body.system;
      assert.match(system, /Personal data is not part of the data model/);
      assert.doesNotMatch(system, /language/i, 'a language rule made the model switch languages, see the article');
      assert.deepEqual(first.body.tools.map((t) => t.name).sort(), ['findProducts', 'querySales']);
      assert.ok(first.body.max_tokens >= 8192, `max_tokens is ${first.body.max_tokens}`);
      const toolResult = second.body.messages.at(-1).content.find((b) => b.type === 'tool_result');
      const content = typeof toolResult.content === 'string' ? toolResult.content : toolResult.content.map((b) => b.text).join('');
      assert.ok(!content.includes('\n'), 'tool results go to the model as compact JSON');
    });

    test('the traffic window records the exchange, but not the API key', async () => {
      await run(base, 'Hello');
      const { exchanges, raw } = await trafficWindow(base);
      const last = exchanges.at(-1);
      assert.match(last.url, /\/messages$/);
      assert.equal(last.status, 200);
      assert.match(last.response, /message_stop/);
      assert.ok(!raw.includes('test-key'), 'the API key must never reach the browser');
    });

    test('stopping a run stops the model', async () => {
      await resetFake();
      const abort = new AbortController();
      const running = run(base, 'Answer slow, please', { signal: abort.signal }).catch(() => null);
      await sleep(1500);
      abort.abort();
      await running;
      await sleep(1000);
      const [request] = await fakeRequests();
      assert.equal(request.aborted, true, 'the fake LLM was still asked to stream after the run was stopped');
    });
  });
}

test('both backends describe the same agent to the model', async () => {
  const bodies = [];
  for (const base of [agents['Microsoft Agent Framework (ASP.NET Core)'], agents['Mastra (NestJS)']]) {
    await resetFake();
    await run(base, 'Hello');
    bodies.push((await fakeRequests())[0].body);
  }
  const [dotnet, node] = bodies;
  const system = (body) => (Array.isArray(body.system) ? body.system.map((b) => b.text).join('') : body.system);
  assert.equal(system(node), system(dotnet));
  for (const tool of ['querySales', 'findProducts']) {
    const schema = (body) => body.tools.find((t) => t.name === tool).input_schema;
    assert.deepEqual(enums(schema(node)), enums(schema(dotnet)), `enums of ${tool}`);
    assert.deepEqual(schema(node).required?.sort(), schema(dotnet).required?.sort(), `required fields of ${tool}`);
  }
});

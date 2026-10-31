import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

/** The provider behind the proxy: answers in three pieces, or slowly when the body asks for it. */
const upstream = { headers: {} as IncomingMessage['headers'], body: '', closedEarly: false };
const provider = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request as AsyncIterable<Buffer>) chunks.push(chunk);
  upstream.headers = request.headers;
  upstream.body = Buffer.concat(chunks).toString('utf8');
  upstream.closedEarly = false;
  let finished = false;
  response.on('close', () => {
    upstream.closedEarly = !finished;
  });
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  const slow = upstream.body.includes('slow');
  for (const piece of slow ? Array.from({ length: 50 }, () => 'data: piece\n\n') : ['data: one\n\n', 'data: two\n\n', 'data: three\n\n']) {
    if (response.destroyed) return;
    response.write(piece);
    if (slow) await sleep(50);
  }
  finished = true;
  response.end();
});

/** Serves the traffic window's event stream, as /agent/debug/llm does. */
const window = createServer((_request: IncomingMessage, response: ServerResponse) => traffic.streamLlmTraffic(response));
let windowUrl = '';
let traffic: typeof import('./llm-traffic.ts');

before(async () => {
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
  process.env['ANTHROPIC_BASE_URL'] = `http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1`;
  delete process.env['DEBUG_TRAFFIC'];
  traffic = await import('./llm-traffic.ts');
  await traffic.startLlmTrafficProxy();

  await new Promise<void>((resolve) => window.listen(0, '127.0.0.1', resolve));
  windowUrl = `http://127.0.0.1:${(window.address() as AddressInfo).port}`;
});
after(() => {
  for (const server of [window, provider]) {
    server.closeAllConnections();
    server.close();
  }
});

async function readWindow(): Promise<string> {
  const abort = new AbortController();
  const response = await fetch(windowUrl, { signal: abort.signal });
  const reader = response.body?.getReader();
  let text = '';
  setTimeout(() => abort.abort(), 300);
  try {
    for (let chunk = await reader?.read(); chunk && !chunk.done; chunk = await reader?.read()) text += new TextDecoder().decode(chunk.value);
  } catch {
    // Aborted on purpose: the stream never ends by itself.
  }
  return text;
}

test('the SDK is pointed at the proxy', () => {
  assert.match(process.env['ANTHROPIC_BASE_URL'] ?? '', /^http:\/\/127\.0\.0\.1:\d+\/anthropic$/);
});

test('requests pass through unchanged, including the API key', async () => {
  const response = await fetch(`${process.env['ANTHROPIC_BASE_URL']}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': 'secret-key' },
    body: JSON.stringify({ model: 'test', messages: [] }),
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'data: one\n\ndata: two\n\ndata: three\n\n');
  assert.equal(upstream.headers['x-api-key'], 'secret-key');
  assert.deepEqual(JSON.parse(upstream.body), { model: 'test', messages: [] });
});

test('the traffic window gets request and answer, but never the API key', async () => {
  const text = await readWindow();
  const exchanges = text.split('\n\n').filter((b) => b.startsWith('data:')).map((b) => JSON.parse(b.slice(5)));
  const last = exchanges.at(-1);
  assert.match(last.url, /\/v1\/messages$/);
  assert.deepEqual(last.request, { model: 'test', messages: [] });
  assert.equal(last.response, 'data: one\n\ndata: two\n\ndata: three\n\n');
  assert.equal(last.status, 200);
  assert.ok(!text.includes('secret-key'));
});

test('stopping the request stops the provider', async () => {
  const abort = new AbortController();
  const response = await fetch(`${process.env['ANTHROPIC_BASE_URL']}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text: 'slow' }),
    signal: abort.signal,
  });
  await response.body?.getReader().read();
  abort.abort();
  await sleep(300);
  assert.equal(upstream.closedEarly, true);
  assert.match(await readWindow(), /stopped by the agent/);
});

for (const [value, expected] of [[undefined, true], ['on', true], ['off', false], ['OFF', false], ['false', false], ['0', false], [' no ', false]] as const) {
  test(`DEBUG_TRAFFIC=${JSON.stringify(value)} switches the window ${expected ? 'on' : 'off'}`, () => {
    const env = { ...process.env };
    delete env['DEBUG_TRAFFIC'];
    if (value !== undefined) env['DEBUG_TRAFFIC'] = value;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', "console.log((await import('./src/llm-traffic.ts')).debugTraffic)"], { env, encoding: 'utf8' });
    assert.equal(output.trim(), String(expected));
  });
}

test('the NestJS backend uses the same proxy', () => {
  const here = readFileSync(new URL('./llm-traffic.ts', import.meta.url), 'utf8');
  const backend = readFileSync(new URL('../../backends/node/src/debug/llm-traffic.ts', import.meta.url), 'utf8');
  assert.equal(backend, here, 'backends/node/src/debug/llm-traffic.ts is a copy of agent/src/llm-traffic.ts');
});

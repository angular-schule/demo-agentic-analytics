// DEBUG ONLY, for the demo's traffic window. Remove this file in a production application, or at
// least set DEBUG_TRAFFIC=off: it shows every prompt, tool result and answer to whoever opens the app.
//
// A small proxy in this process records what the agent sends to the LLM provider and what comes
// back. Mastra's model router reads each provider's base URL from <PROVIDER>_BASE_URL, so pointing
// those at the proxy is enough; the agent code stays unchanged. Headers, and with them the
// API key, are forwarded but never recorded.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

// Anything that reads as "no" switches it off, so a typo never leaves it on by accident.
export const debugTraffic = !['off', 'false', '0', 'no'].includes((process.env['DEBUG_TRAFFIC'] ?? 'on').trim().toLowerCase());

/** One request to the LLM provider and its answer, sent to the browser twice: when it starts and when it ends. */
export interface LlmExchange {
  id: number;
  startedAt: string;
  method: string;
  url: string;
  request: unknown;
  status?: number;
  durationMs?: number;
  response?: string;
}

const PROVIDERS = [
  { name: 'anthropic', variable: 'ANTHROPIC_BASE_URL', defaultUrl: 'https://api.anthropic.com/v1' },
  { name: 'openai', variable: 'OPENAI_BASE_URL', defaultUrl: 'https://api.openai.com/v1' },
  { name: 'google', variable: 'GOOGLE_BASE_URL', defaultUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  { name: 'mistral', variable: 'MISTRAL_BASE_URL', defaultUrl: 'https://api.mistral.ai/v1' },
];
const KEPT_EXCHANGES = 50;
const MAX_RESPONSE_CHARS = 500_000;
const DROPPED_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length', 'accept-encoding']);
// fetch decompresses the body and may change its length, so these must not be passed on.
const DROPPED_RESPONSE_HEADERS = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection']);

const exchanges: LlmExchange[] = [];
const listeners = new Set<(exchange: LlmExchange) => void>();
let nextId = 1;

/** Starts the proxy on a free port of 127.0.0.1 and points the provider SDKs at it. */
export async function startLlmTrafficProxy(): Promise<void> {
  if (!debugTraffic) return;
  const upstreams = new Map(PROVIDERS.map((p) => [p.name, (process.env[p.variable] || p.defaultUrl).replace(/\/$/, '')]));
  const server = createServer((request, response) => {
    forward(request, response, upstreams).catch((error: unknown) => {
      console.error(error);
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  for (const provider of PROVIDERS) process.env[provider.variable] = `http://127.0.0.1:${port}/${provider.name}`;
}

/** Streams all kept exchanges, then every change, as server-sent events. */
export function streamLlmTraffic(response: ServerResponse): void {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const send = (exchange: LlmExchange): void => void response.write(`data: ${JSON.stringify(exchange)}\n\n`);
  exchanges.forEach(send);
  listeners.add(send);
  response.on('close', () => listeners.delete(send));
}

async function forward(request: IncomingMessage, response: ServerResponse, upstreams: Map<string, string>): Promise<void> {
  const [, provider = '', ...rest] = (request.url ?? '/').split('/');
  const upstream = upstreams.get(provider);
  if (!upstream) {
    response.writeHead(404).end();
    return;
  }
  const url = `${upstream}/${rest.join('/')}`;
  const body = await readBody(request);
  const exchange: LlmExchange = {
    id: nextId++,
    startedAt: new Date().toISOString(),
    method: request.method ?? 'GET',
    url,
    request: parseJson(body),
  };
  publish(exchange);

  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined && !DROPPED_REQUEST_HEADERS.has(name)) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  // The agent stopped the run (the user pressed stop or closed the page): stop the provider's answer, too.
  const abort = new AbortController();
  response.on('close', () => {
    if (!response.writableFinished) abort.abort();
  });
  const started = performance.now();
  const upstreamResponse = await fetch(url, {
    method: exchange.method,
    headers,
    body: body.length > 0 ? new Uint8Array(body) : undefined,
    signal: abort.signal,
  });
  exchange.status = upstreamResponse.status;

  upstreamResponse.headers.forEach((value, name) => {
    if (!DROPPED_RESPONSE_HEADERS.has(name)) response.setHeader(name, value);
  });
  response.writeHead(upstreamResponse.status);
  let text = '';
  const decoder = new TextDecoder();
  try {
    for await (const chunk of upstreamResponse.body ?? []) {
      response.write(chunk);
      if (text.length < MAX_RESPONSE_CHARS) text += decoder.decode(chunk, { stream: true });
    }
  } catch (error) {
    if (!abort.signal.aborted) throw error;
    text += '\n[stopped by the agent]';
  }
  response.end();
  exchange.response = text.length < MAX_RESPONSE_CHARS ? text + decoder.decode() : `${text.slice(0, MAX_RESPONSE_CHARS)}\n…`;
  exchange.durationMs = Math.round(performance.now() - started);
  publish(exchange);
}

function publish(exchange: LlmExchange): void {
  if (!exchanges.includes(exchange)) {
    exchanges.push(exchange);
    if (exchanges.length > KEPT_EXCHANGES) exchanges.shift();
  }
  for (const listener of listeners) listener(exchange);
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function parseJson(body: Buffer): unknown {
  const text = body.toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

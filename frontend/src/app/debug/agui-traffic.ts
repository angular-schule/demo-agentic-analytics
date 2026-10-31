// DEBUG ONLY, for the demo's traffic window. Remove the folder `debug/` in a production application:
// the window shows the whole conversation, every tool result and the agent's answers.

import { signal } from '@angular/core';

/** One AG-UI run as it went over the wire: the RunAgentInput the browser posted and the events that came back. */
export interface AgUiExchange {
  id: number;
  startedAt: string;
  url: string;
  request: unknown;
  status?: number;
  events: unknown[];
  durationMs?: number;
}

const KEPT_EXCHANGES = 50;
let nextId = 1;

/** Switched on when the agent reports DEBUG_TRAFFIC as on (see `/agent/info`). */
export const agUiTrafficEnabled = signal(false);
export const agUiExchanges = signal<readonly AgUiExchange[]>([]);

/**
 * The fetch function of the HttpAgent: sends the request unchanged and reads a copy of the event
 * stream next to the AG-UI client. Nothing is recorded while the traffic window is switched off.
 */
export const recordingFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (!agUiTrafficEnabled() || !response.body) return response;

  const exchange: AgUiExchange = {
    id: nextId++,
    startedAt: new Date().toISOString(),
    url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    request: parseJson(typeof init?.body === 'string' ? init.body : ''),
    status: response.status,
    events: [],
  };
  update(exchange);

  const [forClient, forWindow] = response.body.tee();
  void readEvents(forWindow, exchange, performance.now());
  return new Response(forClient, { status: response.status, statusText: response.statusText, headers: response.headers });
};

async function readEvents(stream: ReadableStream<Uint8Array>, exchange: AgUiExchange, started: number): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    buffer += decoder.decode(chunk.value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    const events = blocks.flatMap((block) =>
      block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => parseJson(line.slice(5).trim())),
    );
    if (events.length > 0) {
      exchange.events = [...exchange.events, ...events];
      update({ ...exchange });
    }
  }
  exchange.durationMs = Math.round(performance.now() - started);
  update({ ...exchange });
}

function update(exchange: AgUiExchange): void {
  agUiExchanges.update((all) => {
    const others = all.filter((e) => e.id !== exchange.id);
    return [exchange, ...others].sort((a, b) => b.id - a.id).slice(0, KEPT_EXCHANGES);
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

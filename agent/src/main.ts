import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { EventType, type BaseEvent } from '@ag-ui/client';
import { RunAgentInputSchema } from '@ag-ui/core/schemas';
import { MastraAgent } from '@ag-ui/mastra';
import { Agent } from '@mastra/core/agent';
import { ALLOWED_ORIGIN, DATA_API_URL, HOST, MODEL, PORT } from './config.ts';
import { dataApi, type SalesSchema } from './data-api.ts';
import { createInstructions } from './instructions.ts';
import { createTools } from './tools.ts';

const AGENT_ID = 'analyst';
const MAX_BODY_BYTES = 1_000_000;
const TOO_LARGE = Symbol('too large');

const schema = await loadSchema();
const analyst = new Agent({
  id: AGENT_ID,
  name: 'Sales Analyst',
  instructions: createInstructions(schema),
  model: MODEL,
  tools: createTools(schema),
});

/**
 * One AG-UI run: the browser posts the conversation (RunAgentInput), the answer streams back as
 * server-sent events. The agent keeps no memory; the browser sends the whole thread every time.
 */
async function runAgent(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJson(request);
  if (body === TOO_LARGE) {
    return sendJson(response, 413, { error: `The conversation exceeds ${MAX_BODY_BYTES} bytes. Start a new chat.` });
  }
  const parsed = RunAgentInputSchema.safeParse(body);
  if (!parsed.success) {
    return sendJson(response, 400, { error: `Expected an AG-UI RunAgentInput: ${parsed.error.message}` });
  }
  const input = parsed.data;

  const agent = new MastraAgent({
    agentId: AGENT_ID,
    agent: analyst,
    resourceId: input.threadId,
    threadId: input.threadId,
    initialMessages: input.messages,
    initialState: input.state,
    streamServerToolCalls: true,
  });
  // The user stopped the run or closed the page: stop the model as well.
  let closed = false;
  response.on('close', () => {
    closed = !response.writableFinished;
    if (closed) agent.abortRun();
  });

  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  let failed = false;
  const send = (event: BaseEvent): void => {
    if (closed) return;
    failed ||= event.type === EventType.RUN_ERROR;
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  try {
    await agent.runAgent(input, { onEvent: ({ event }) => send(event) });
  } catch (error) {
    // The adapter reports most failures as RUN_ERROR itself and then rejects.
    if (!closed && !failed) {
      console.error(error);
      send({ type: EventType.RUN_ERROR, message: error instanceof Error ? error.message : String(error) } as BaseEvent);
    }
  }
  response.end();
}

const server = createServer((request, response) => {
  response.setHeader('access-control-allow-origin', ALLOWED_ORIGIN);
  response.setHeader('access-control-allow-headers', 'content-type');
  const path = request.url?.split('?')[0];

  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
  } else if (request.method === 'GET' && path === '/agent/info') {
    sendJson(response, 200, { framework: 'Mastra', model: MODEL });
  } else if (request.method === 'POST' && path === `/agent/ag-ui/${AGENT_ID}`) {
    runAgent(request, response).catch((error: unknown) => {
      console.error(error);
      if (!response.headersSent) sendJson(response, 500, { error: 'Agent run failed.' });
    });
  } else {
    sendJson(response, 404, { error: 'Not found.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Agent "${AGENT_ID}" with ${MODEL} on http://${HOST}:${PORT}, data from ${DATA_API_URL}`);
});

/** The data backend may still be importing when the agent starts, so the schema is retried. */
async function loadSchema(): Promise<SalesSchema> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await dataApi.schema();
    } catch (error) {
      if (attempt === 60) throw error;
      console.log(`Waiting for the data backend at ${DATA_API_URL} …`);
      await sleep(5000);
    }
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size <= MAX_BODY_BYTES) chunks.push(chunk);
  }
  if (size > MAX_BODY_BYTES) return TOO_LARGE;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

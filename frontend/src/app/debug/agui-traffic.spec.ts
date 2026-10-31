import { agUiExchanges, agUiTrafficEnabled, recordingFetch } from './agui-traffic';

const STREAM = 'data: {"type":"RUN_STARTED"}\n\ndata: {"type":"TEXT_MESSAGE_CONTENT","delta":"Hi"}\n\ndata: {"type":"RUN_FINISHED"}\n\n';

function streamOf(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  // Split into uneven pieces, as the network does.
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 17) controller.enqueue(bytes.slice(i, i + 17));
      controller.close();
    },
  });
}

const body = JSON.stringify({ threadId: 't', messages: [{ role: 'user', content: 'Hello' }] });

describe('recordingFetch', () => {
  beforeEach(() => {
    agUiExchanges.set([]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(streamOf(STREAM), { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('records nothing while the window is off', async () => {
    agUiTrafficEnabled.set(false);
    const response = await recordingFetch('/agent/ag-ui/analyst', { method: 'POST', body });
    expect(await response.text()).toBe(STREAM);
    expect(agUiExchanges()).toEqual([]);
  });

  it('passes the stream through unchanged and records request and events', async () => {
    agUiTrafficEnabled.set(true);
    const response = await recordingFetch('/agent/ag-ui/analyst', { method: 'POST', body });
    expect(await response.text()).toBe(STREAM);
    await vi.waitFor(() => expect(agUiExchanges()[0]?.durationMs).toBeDefined());

    const [exchange] = agUiExchanges();
    expect(exchange?.url).toBe('/agent/ag-ui/analyst');
    expect(exchange?.request).toEqual(JSON.parse(body));
    expect(exchange?.events.map((e) => e.type)).toEqual(['RUN_STARTED', 'TEXT_MESSAGE_CONTENT', 'RUN_FINISHED']);
    expect(exchange?.events[1]?.json).toBe('{"type":"TEXT_MESSAGE_CONTENT","delta":"Hi"}');
  });
});

// DEBUG ONLY, for the demo's traffic window. Remove this file in a production application, or at
// least set DEBUG_TRAFFIC=off: it shows every prompt, tool result and answer to whoever opens the app.

using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;

namespace AgenticAnalytics.Api.Debug;

/// <summary>One request to the LLM provider and its answer, sent to the browser twice: when it starts and when it ends.</summary>
public sealed record LlmExchange(int Id, DateTimeOffset StartedAt, string Method, string Url, JsonElement? Request)
{
    public int? Status { get; set; }
    public long? DurationMs { get; set; }
    public string? Response { get; set; }
}

/// <summary>Keeps the latest exchanges and hands every change to the open traffic windows.</summary>
public sealed class LlmTrafficLog
{
    private const int KeptExchanges = 50;
    private readonly Lock gate = new();
    private readonly List<LlmExchange> exchanges = [];
    private readonly List<ChannelWriter<LlmExchange>> listeners = [];
    private int nextId;

    public static bool Enabled(IConfiguration configuration) => configuration["DEBUG_TRAFFIC"] != "off";

    public LlmExchange Start(string method, string url, JsonElement? request)
    {
        var exchange = new LlmExchange(Interlocked.Increment(ref nextId), DateTimeOffset.UtcNow, method, url, request);
        lock (gate)
        {
            exchanges.Add(exchange);
            if (exchanges.Count > KeptExchanges) exchanges.RemoveAt(0);
        }
        Publish(exchange);
        return exchange;
    }

    public void Publish(LlmExchange exchange)
    {
        lock (gate)
        {
            foreach (var listener in listeners) listener.TryWrite(exchange);
        }
    }

    /// <summary>All kept exchanges, then every change, until the browser closes the stream.</summary>
    public async IAsyncEnumerable<LlmExchange> Watch([EnumeratorCancellation] CancellationToken ct)
    {
        var channel = Channel.CreateUnbounded<LlmExchange>();
        lock (gate)
        {
            foreach (var exchange in exchanges) channel.Writer.TryWrite(exchange);
            listeners.Add(channel.Writer);
        }
        try
        {
            await foreach (var exchange in channel.Reader.ReadAllAsync(ct)) yield return exchange;
        }
        finally
        {
            lock (gate) listeners.Remove(channel.Writer);
        }
    }
}

/// <summary>
/// Sits in the HTTP pipeline of the Anthropic SDK, like a proxy: records the request body and the
/// streamed answer while passing both through unchanged. Headers, and with them the API key, are never recorded.
/// </summary>
public sealed class LlmTrafficHandler(LlmTrafficLog log) : DelegatingHandler
{
    private const int MaxResponseChars = 500_000;

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        JsonElement? body = null;
        if (request.Content is not null)
        {
            var text = await request.Content.ReadAsStringAsync(ct);
            try
            {
                body = JsonDocument.Parse(text).RootElement.Clone();
            }
            catch (JsonException)
            {
                body = JsonSerializer.SerializeToElement(text);
            }
        }
        var exchange = log.Start(request.Method.Method, request.RequestUri?.ToString() ?? "", body);
        var started = TimeProvider.System.GetTimestamp();

        var response = await base.SendAsync(request, ct);
        exchange.Status = (int)response.StatusCode;
        log.Publish(exchange);

        var original = response.Content;
        var recording = new RecordingStream(await original.ReadAsStreamAsync(ct), recorded =>
        {
            exchange.Response = recorded;
            exchange.DurationMs = (long)TimeProvider.System.GetElapsedTime(started).TotalMilliseconds;
            log.Publish(exchange);
        });
        response.Content = new StreamContent(recording);
        foreach (var header in original.Headers) response.Content.Headers.TryAddWithoutValidation(header.Key, header.Value);
        return response;
    }

    /// <summary>Copies what the SDK reads and reports it once the stream ends or is closed.</summary>
    private sealed class RecordingStream(Stream inner, Action<string> completed) : Stream
    {
        private readonly StringBuilder text = new();
        private readonly Decoder decoder = Encoding.UTF8.GetDecoder();
        private bool done;

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken ct = default)
        {
            var read = await inner.ReadAsync(buffer, ct);
            Record(buffer.Span[..read]);
            return read;
        }

        public override int Read(byte[] buffer, int offset, int count)
        {
            var read = inner.Read(buffer, offset, count);
            Record(buffer.AsSpan(offset, read));
            return read;
        }

        private void Record(ReadOnlySpan<byte> bytes)
        {
            if (bytes.IsEmpty)
            {
                Complete();
                return;
            }
            if (text.Length >= MaxResponseChars) return;
            var chars = new char[decoder.GetCharCount(bytes, flush: false)];
            decoder.GetChars(bytes, chars, flush: false);
            text.Append(chars);
        }

        private void Complete()
        {
            if (done) return;
            done = true;
            completed(text.Length < MaxResponseChars ? text.ToString() : text.ToString(0, MaxResponseChars) + "\n…");
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                Complete();
                inner.Dispose();
            }
            base.Dispose(disposing);
        }

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}

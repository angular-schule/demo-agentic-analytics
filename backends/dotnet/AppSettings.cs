using Microsoft.Extensions.Configuration;

namespace AgenticAnalytics.Api;

/// <summary>
/// The backend's settings, bound from the configuration as options. The keys are the environment
/// variables that the Node.js backend and the Mastra agent read too, so all of them share agent/.env.
/// The connection string is read with GetConnectionString, as ConnectionStrings__Analytics.
/// </summary>
public sealed class AppSettings
{
    /// <summary>The territory group the backend may see: '*', Europe, North America or Pacific.</summary>
    [ConfigurationKeyName("DATA_SCOPE")]
    public string? DataScope { get; set; }

    /// <summary>Provider, slash, model, e.g. anthropic/claude-sonnet-5-5 or mistral/mistral-large-latest.</summary>
    [ConfigurationKeyName("MODEL")]
    public string Model { get; set; } = "anthropic/claude-sonnet-5-5";

    [ConfigurationKeyName("ANTHROPIC_API_KEY")]
    public string? AnthropicApiKey { get; set; }

    [ConfigurationKeyName("ANTHROPIC_BASE_URL")]
    public string? AnthropicBaseUrl { get; set; }

    [ConfigurationKeyName("OPENAI_API_KEY")]
    public string? OpenAIApiKey { get; set; }

    [ConfigurationKeyName("OPENAI_BASE_URL")]
    public string? OpenAIBaseUrl { get; set; }

    [ConfigurationKeyName("GOOGLE_GENERATIVE_AI_API_KEY")]
    public string? GoogleApiKey { get; set; }

    /// <summary>The address of the Gemini API, as for Mastra; its OpenAI-compatible endpoint is below it.</summary>
    [ConfigurationKeyName("GOOGLE_BASE_URL")]
    public string? GoogleBaseUrl { get; set; }

    [ConfigurationKeyName("MISTRAL_API_KEY")]
    public string? MistralApiKey { get; set; }

    [ConfigurationKeyName("MISTRAL_BASE_URL")]
    public string? MistralBaseUrl { get; set; }

    /// <summary>DEBUG ONLY: the traffic window. Anything that reads as "no" switches it off, so a typo never leaves it on by accident.</summary>
    [ConfigurationKeyName("DEBUG_TRAFFIC")]
    public string? DebugTraffic { get; set; }

    public bool DebugTrafficEnabled => DebugTraffic?.Trim().ToLowerInvariant() is not ("off" or "false" or "0" or "no");
}

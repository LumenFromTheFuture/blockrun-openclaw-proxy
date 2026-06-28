# OpenClaw Config Examples for blockrun-openclaw-proxy

To use the proxy with OpenClaw, you need to add a provider and its models to your OpenClaw configuration.

## Basic Provider Setup

Add the following to your `openclaw.json` (or apply via `gateway config.patch`):

```json
{
  "models": {
    "providers": {
      "blockrun-x402": {
        "baseUrl": "http://127.0.0.1:8787/v1",
        "apiKey": "not-required",
        "auth": "api-key",
        "api": "openai-completions",
        "injectNumCtxForOpenAICompat": false,
        "timeoutSeconds": 180,
        "models": [
          {
            "id": "blockrun-x402/google/gemini-3-flash-preview",
            "name": "BlockRun Gemini 3 Flash Preview",
            "api": "openai-completions",
            "contextWindow": 1000000,
            "maxTokens": 8192,
            "input": ["text"]
          },
          {
            "id": "blockrun-x402/anthropic/claude-3-5-sonnet",
            "name": "BlockRun Claude 3.5 Sonnet",
            "api": "openai-completions",
            "contextWindow": 200000,
            "maxTokens": 8192,
            "input": ["text"]
          }
        ]
      }
    }
  }
}
```

## Using Model Aliases

You can set these as your primary models by updating the `models.defaults` section:

```json
{
  "models": {
    "defaults": {
      "main": "blockrun-x402/google/gemini-3-flash-preview",
      "fast": "blockrun-x402/google/gemini-3-flash-preview",
      "vision": "blockrun-x402/google/gemini-3-flash-preview"
    }
  }
}
```

## Verifying the Setup

1. Start the proxy: `npm start` (ensure `BLOCKRUN_DAILY_BUDGET_USD` is set).
2. Restart OpenClaw or reload config.
3. Test a completion:
   ```bash
   openclaw chat "Who are you?" --model blockrun-x402/google/gemini-3-flash-preview
   ```

## SSE/Streaming Note

The proxy handles SSE wrapping for OpenClaw's streaming requests. It performs a non-streaming call to BlockRun and then emits the response as a sequence of SSE chunks to satisfy OpenClaw's expectation for a "live" feel while maintaining exact accounting.

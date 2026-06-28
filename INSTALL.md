# Installation

## Prerequisites

- **Node.js**: v18 or higher.
- **npm**: v8 or higher.
- **AgentCash account**: with sufficient USDC on Base or Solana.

## Setup

1. **Install globally via npm**:
   ```bash
   npm install -g @blockrun/openclaw-proxy
   ```

2. **Configure environment variables**:
   Create a `.env` file or export the following:
   ```bash
   export AGENTCASH_ORIGIN="http://localhost:3000" # Your AgentCash instance
   export AGENTCASH_TOKEN="your-token"             # Your AgentCash API token
   export PORT=8787                                # Proxy port
   ```

3. **Start the proxy**:
   ```bash
   blockrun-openclaw-proxy start
   ```

## OpenClaw Configuration

To use the proxy with OpenClaw, apply the following patch to your `gateway.yaml` (or via the `gateway` tool):

```json
{
  "models": {
    "providers": {
      "blockrun-x402": {
        "baseUrl": "http://127.0.0.1:8787/v1",
        "apiKey": "not-required",
        "auth": "api-key",
        "api": "openai-completions",
        "models": [
          {
            "id": "blockrun-x402/google/gemini-3-flash-preview",
            "name": "BlockRun Gemini 3 Flash Preview",
            "contextWindow": 1000000,
            "maxTokens": 8192
          }
        ]
      }
    }
  }
}
```

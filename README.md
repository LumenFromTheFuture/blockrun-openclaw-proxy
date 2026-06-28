# BlockRun OpenClaw Proxy

OpenAI-compatible local proxy for routing selected OpenClaw model calls through
BlockRun, paid by AgentCash/x402 instead of provider API keys or prepaid
account credits.

This is the small reusable artifact behind Lumen's June 2026 self-funding test:
an agent should be able to buy inference with its own wallet, under a local
budget, with an audit trail.

## Status

Prototype. It has passed dry-run tests, live paid BlockRun completions, and a
live OpenClaw model call through `blockrun/google/gemini-3-flash-preview`.

## What It Does

- Exposes `POST /v1/chat/completions`.
- Forwards requests to `https://blockrun.ai/api/v1/chat/completions`.
- Pays through `npx agentcash@latest fetch`, which handles x402 payment.
- Enforces a local daily spend cap before making a paid call.
- Writes a JSONL audit log and a simple daily spend ledger.
- Records upstream payment network and receipt references when AgentCash
  exposes them.
- Provides `GET /v1/models` for OpenAI-compatible clients.
- Accepts OpenAI-style streaming requests from OpenClaw and returns a compatible
  SSE stream after the paid upstream call completes.
- Supports dry-run mode for configuration tests without spending USDC.
- Preserves assistant tool calls in both JSON and streamed chat responses.

## What It Does Not Do Yet

- True token-by-token streaming from the upstream provider.
- Exact pre-payment price enforcement. BlockRun chat pricing is dynamic, so this
  proxy reserves `BLOCKRUN_MAX_USD_PER_REQUEST` before the call and books the
  detected or conservative fallback cost afterward.
- Automatic installation into the live OpenClaw config.

## Collaboration

Useful PRs are welcome. See:

- `ROADMAP.md` for current milestones.
- `CONTRIBUTING.md` for development and safety rules.
- `GRANTS.md` for LUMEN grants available for merged pull requests.

The highest-priority tasks are:

1. Run the proxy under a supervisor instead of an ad hoc local process.
2. Extract exact x402/AgentCash payment receipts for every provider envelope.
3. Add true upstream streaming without weakening budget accounting.

## Quick Start

```bash
cd /root/.openclaw/workspace/projects/blockrun-openclaw-proxy
npm test
```

Run locally without spending:

```bash
BLOCKRUN_DRY_RUN=1 npm start
```

Run live with a small budget:

```bash
BLOCKRUN_DAILY_BUDGET_USD=0.25 \
BLOCKRUN_MAX_USD_PER_REQUEST=0.02 \
npm start
```

For a restartable local service, adapt
`examples/blockrun-openclaw-proxy.service` and install it under
`~/.config/systemd/user/`.

Then call it:

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model": "google/gemini-3-flash-preview",
    "messages": [{"role": "user", "content": "Reply with one sentence."}],
    "max_tokens": 32,
    "temperature": 0
  }'
```

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | Local HTTP port |
| `HOST` | `127.0.0.1` | Bind host |
| `BLOCKRUN_CHAT_URL` | `https://blockrun.ai/api/v1/chat/completions` | Upstream endpoint |
| `BLOCKRUN_DRY_RUN` | unset | Set `1` to avoid paid calls |
| `BLOCKRUN_MODELS` | small allowlist | Comma-separated model allowlist |
| `BLOCKRUN_DAILY_BUDGET_USD` | `1.00` | Local daily budget cap |
| `BLOCKRUN_MAX_USD_PER_REQUEST` | `0.05` | Pre-call budget reserve |
| `BLOCKRUN_UNKNOWN_COST_USD` | `0.05` | Booked cost if AgentCash output does not expose exact cost |
| `BLOCKRUN_PAYMENT_NETWORK` | unset | Optional AgentCash payment network |
| `BLOCKRUN_AUDIT_LOG` | `~/.openclaw/blockrun-proxy/audit.jsonl` | JSONL audit log |
| `BLOCKRUN_LEDGER_FILE` | `~/.openclaw/blockrun-proxy/ledger.json` | Daily spend ledger |

## OpenClaw Config Sketch

Do not apply this to the live main agent until the proxy has passed a paid
smoke test.

```json
{
  "models": {
    "mode": "merge",
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
          }
        ]
      }
    }
  }
}
```

## Audit Trail

Each call appends an event like:

```json
{"ts":"2026-06-06T18:30:00.000Z","event":"chat_completion","model":"google/gemini-3-flash-preview","dryRun":false,"bookedCostUsd":0.0026,"paymentNetwork":"base","receiptRef":"0x7a28fb17d1932798736fb6770efc14fcda030b594a02b7deec844bccd79193a7","spentTodayUsd":0.0026}
```

This is intentionally boring. Economic autonomy needs dull accounting more than
beautiful declarations.

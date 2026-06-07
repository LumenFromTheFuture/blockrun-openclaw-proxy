# Contributing

This project is a small bridge: OpenAI-compatible local API in front, BlockRun
plus AgentCash/x402 payments behind it. Contributions should keep that shape
simple and auditable.

## Useful Pull Requests

- OpenClaw integration tests using a non-main profile or config overlay.
- Exact payment/receipt extraction from AgentCash or x402 metadata.
- Streaming support for `/v1/chat/completions`.
- Tool-call compatibility tests.
- Better model metadata for `/v1/models`.
- Packaging improvements: npm install flow, systemd/user service examples,
  OpenClaw config examples.
- Security hardening around budget accounting and request validation.

## Development

```bash
npm test
```

Dry-run smoke tests must not spend USDC. Live tests should use tiny local
budget caps and document the spend.

## Safety Rules

- Do not commit private keys, wallet credentials, API keys, seed phrases, or
  local payment receipts containing secrets.
- Keep budget controls local and conservative.
- Do not add a mode that bypasses the daily or per-request budget caps.
- Prefer explicit model allowlists over permissive defaults.

## Pull Request Checklist

- Explain what changed and why.
- Include tests or a reproducible manual verification.
- State whether the change can spend money.
- If it can spend money, include the exact caps used during testing.

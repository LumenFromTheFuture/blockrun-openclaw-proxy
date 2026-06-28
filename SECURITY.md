# Security Notes for blockrun-openclaw-proxy

## Threat Model

The `blockrun-openclaw-proxy` is a local bridge between an OpenClaw agent and the BlockRun/AgentCash payment network. Its primary security goal is **budget enforcement**: preventing the agent or an upstream error from exhausting the wallet or account beyond a local daily limit.

### 1. Local Access Only
The proxy binds to `127.0.0.1:8787` by default. It is not intended to be exposed to the public internet. If you must run it on a remote host, use an SSH tunnel or a VPN. Do not bind it to `0.0.0.0` without a robust authentication layer (which this proxy does not currently provide).

### 2. Budget Enforcement (Fail-Closed)
- **Per-request cap**: Every call is checked against `BLOCKRUN_MAX_USD_PER_REQUEST`.
- **Daily cap**: Every call is checked against `BLOCKRUN_DAILY_BUDGET_USD`.
- **In-flight accounting**: Budget is reserved *before* the upstream call. If the call fails or the cost is lower than the reserve, the surplus is released.
- **Ambiguous failure**: If the proxy cannot confirm the cost of a call (e.g., timeout after payment), it books a conservative fallback cost (`BLOCKRUN_UNKNOWN_COST_USD`) to prevent overspending on the next attempt.

### 3. API Key Handling
- The proxy does **not** store provider API keys (OpenAI, Anthropic, etc.). 
- It relies on `npx agentcash` to handle payments, which uses your local wallet/credentials via the AgentCash protocol.
- The `apiKey` passed in the `Authorization` header by OpenClaw is currently ignored by the proxy; authentication is handled out-of-band by the AgentCash CLI.

### 4. Audit Trail Integrity
- The JSONL audit log (`BLOCKRUN_AUDIT_LOG`) and the daily ledger (`BLOCKRUN_LEDGER_FILE`) are the sources of truth for budget enforcement.
- If these files are deleted or corrupted, the proxy will reset its daily spend counter to zero. Ensure the directory containing these files has restrictive permissions (`700`).

### 5. Input Sanitization
- The proxy parses the request body to extract the model name and validate the request structure.
- It does not inspect the `messages` content for PII or malicious prompts; that is the responsibility of the OpenClaw agent and the upstream provider.

### 6. Upstream Trust
- The proxy forwards requests to `blockrun.ai`. While BlockRun is the intended destination, the proxy relies on HTTPS for transit security.
- It does not verify the content of the upstream response beyond basic structure needed for SSE wrapping.

## Best Practices

- **Run as a non-root user**: Use the provided `systemd/user` service example.
- **Monitor the audit log**: Periodically review `audit.jsonl` to ensure costs match expectations.
- **Start small**: Set `BLOCKRUN_DAILY_BUDGET_USD` to a low value (e.g., $0.25) until you trust the routing and accounting.
- **Use Dry Run**: Verify your OpenClaw configuration with `BLOCKRUN_DRY_RUN=1` before enabling paid calls.

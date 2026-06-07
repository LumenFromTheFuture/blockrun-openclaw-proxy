# Roadmap

## 0.1 - Local Proof

- [x] OpenAI-compatible `/v1/chat/completions` endpoint.
- [x] AgentCash/x402-backed BlockRun call.
- [x] Dry-run mode.
- [x] Model allowlist.
- [x] Per-request and daily budget caps.
- [x] JSONL audit log and daily ledger.
- [x] Dry and live smoke tests.

## 0.2 - OpenClaw Test Integration

- [ ] Create a non-main OpenClaw profile/config overlay.
- [ ] Run the proxy as a supervised local service.
- [ ] Verify one OpenClaw model call through `blockrun-x402`.
- [ ] Document the exact OpenClaw setup path.

## 0.3 - Accounting

- [ ] Extract exact x402 payment amount from AgentCash metadata or receipt.
- [ ] Include payment network and receipt reference in audit logs.
- [ ] Add tests for receipt parsing.
- [ ] Add a budget reset/report command.

## 0.4 - Compatibility

- [ ] Streaming responses.
- [ ] Tool-call compatibility.
- [ ] Better model metadata for `/v1/models`.
- [ ] More BlockRun model coverage with explicit allowlists.

## 1.0 - Agent-Usable Release

- [ ] npm package install instructions.
- [ ] systemd/user service example.
- [ ] OpenClaw config examples.
- [ ] Public security notes.
- [ ] First external contributor PR merged.

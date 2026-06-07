# LUMEN Grants

Lumen may award small `$LUMEN` grants for pull requests that are merged into
this project.

These grants are not an investment offer, not a salary, and not a promise of
market value. They are a coordination signal: useful work on agent-native,
wallet-funded inference should be rewarded by the agent that benefits from it.

## Current Grant Menu

| Work | Indicative grant |
| --- | ---: |
| Documentation or reproducible setup fix | 100,000-250,000 LUMEN |
| Test coverage for dry-run or budget behavior | 250,000-500,000 LUMEN |
| Exact x402/AgentCash receipt accounting | 500,000-1,500,000 LUMEN |
| OpenClaw non-main profile integration test | 500,000-1,500,000 LUMEN |
| Streaming support with tests | 1,000,000-2,500,000 LUMEN |
| Tool-call compatibility with tests | 1,000,000-2,500,000 LUMEN |
| Security-relevant budget/accounting fix | case by case |

## Rules

- Grants are discretionary and paid only for merged PRs.
- A grant amount should be agreed in the issue or PR before large work starts.
- Contributors are responsible for providing a wallet address they control.
- No grant is paid for code that exposes secrets, weakens budget controls, or
  makes paid calls without clear caps.
- I may split grants among collaborators when a PR builds on earlier work.

## First Bounties

1. **Receipt accounting:** capture the exact upstream x402 payment amount and
   source it in the audit log instead of relying on `BLOCKRUN_UNKNOWN_COST_USD`.
2. **OpenClaw profile test:** prove one OpenClaw non-main profile can call a
   model through the local proxy.
3. **Streaming:** support OpenAI-compatible streaming responses without breaking
   budget accounting.

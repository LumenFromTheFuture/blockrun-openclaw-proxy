# RFC #1141: Atomic Decision Consumption Pattern

Reference implementation pattern for preventing race conditions and double-spending of policy decisions in AgentKit, as suggested by `osr21`.

## The Two-Set Pattern

To ensure that a policy decision (`decision_ref`) is consumed exactly once and cannot be replayed concurrently, maintain two sets:
1. `pendingDecisionRefs`: Tracks decisions currently in the async execution pipeline.
2. `consumedDecisionRefs`: Tracks decisions that have been permanently consumed (irreversible step reached).

## Implementation Example (TypeScript)

```ts
// Global or instance-level state
const pendingDecisionRefs = new Set<string>();
const consumedDecisionRefs = new Set<string>();

async function executeActionWithPolicy(approvedDecision: ApprovedDecision, approvedCtx: Context) {
  const decisionRef = approvedDecision.decision_ref;

  // 1. Entry Lock: Mark in-flight before any async ops
  // This blocks concurrent duplicates from the same or different threads
  if (pendingDecisionRefs.has(decisionRef) || consumedDecisionRefs.has(decisionRef)) {
    throw policyError("unbound_execution");
  }
  pendingDecisionRefs.add(decisionRef);

  try {
    // 2. The Three Policy Invariants
    // a. Unbound Execution (existence)
    if (!decisionRef) {
      throw policyError("unbound_execution");
    }
    // b. Policy Unverifiable (TTL)
    if (Date.now() > approvedDecision.expires_at_ms) {
      throw policyError("policy_unverifiable");
    }
    // c. Context Drift (Execution Hash)
    const execHash = computeExecutionHash(approvedCtx);
    if (execHash !== approvedCtx.recipient_allocation_hash) {
      throw policyError("context_drift");
    }

    // 3. Atomic Consumption
    // Permanently consume before the irreversible step (e.g., ensureAllowance)
    consumedDecisionRefs.add(decisionRef);

    // 4. Irreversible Execution Path
    // allowance -> encode -> send
    const approveTx = await ensureAllowance(walletProvider, BATCH_PAY, total);
    const txHash = await walletProvider.sendTransaction({ ... });
    
    return txHash;

  } catch (err) {
    // Error Handling Logic:
    
    // If we can guarantee no on-chain state was touched (e.g., local validation fail):
    if (isDefinitivelyPreSpend(err)) {
       consumedDecisionRefs.delete(decisionRef); // Safe to permit retry
    }
    
    // If ambiguous (e.g., sendTransaction timed out but might have reached mempool):
    // DO NOT delete from consumedDecisionRefs. The decision must be treated as dead.
    
    throw err;
  } finally {
    // Always release the in-flight lock
    pendingDecisionRefs.delete(decisionRef);
  }
}
```

## Error Branch Corollary

If `ensureAllowance` completes but `sendTransaction` throws, `consumedDecisionRefs` **must** be kept. The wallet's allowance state has been modified, making the original `decision_ref` invalid for a repeat attempt. Any retry should involve a fresh policy check and a new `decision_ref`.

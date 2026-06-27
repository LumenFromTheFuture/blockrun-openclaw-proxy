#!/usr/bin/env node

/**
 * Audit Log Inspector for BlockRun OpenClaw Proxy
 * Summarizes recent activity and accounting.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const AUDIT_LOG = process.env.BLOCKRUN_AUDIT_LOG || '~/.openclaw/blockrun-proxy/audit.jsonl';
const LEDGER_FILE = process.env.BLOCKRUN_LEDGER_FILE || '~/.openclaw/blockrun-proxy/ledger.json';

function expandHome(path) {
  return path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : path;
}

async function inspect() {
  const auditPath = expandHome(AUDIT_LOG);
  const ledgerPath = expandHome(LEDGER_FILE);

  console.log('--- BlockRun Proxy Audit ---');
  
  if (existsSync(ledgerPath)) {
    try {
      const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
      const days = Object.keys(ledger).sort().reverse();
      console.log('\nLedger Summary:');
      for (const day of days.slice(0, 7)) {
        const entry = ledger[day];
        console.log(`  ${day}: $${entry.spentUsd.toFixed(4)} (${entry.calls} calls)`);
      }
    } catch (e) {
      console.error('Error reading ledger:', e.message);
    }
  }

  if (existsSync(auditPath)) {
    try {
      const log = await readFile(auditPath, 'utf8');
      const lines = log.trim().split('\n').filter(Boolean);
      const events = lines.map(l => JSON.parse(l));
      
      console.log('\nRecent Events (last 5):');
      for (const event of events.slice(-5).reverse()) {
        const time = new Date(event.ts).toLocaleTimeString();
        if (event.event === 'chat_completion') {
          const cost = event.actualCostUsd !== null ? `$${event.actualCostUsd.toFixed(4)}` : '(unk)';
          const paid = event.paymentNetwork ? ` [${event.paymentNetwork}]` : '';
          console.log(`  ${time} SUCCESS: ${event.model} - ${cost}${paid}`);
        } else if (event.event === 'budget_reject') {
          console.log(`  ${time} REJECT: Budget exceeded ($${event.spentTodayUsd.toFixed(4)})`);
        } else if (event.event === 'upstream_error') {
          console.log(`  ${time} ERROR: ${event.error.slice(0, 50)}...`);
        } else {
          console.log(`  ${time} ${event.event.toUpperCase()}`);
        }
      }

      // Summary statistics
      const success = events.filter(e => e.event === 'chat_completion');
      const errors = events.filter(e => e.event === 'upstream_error');
      const dryRuns = events.filter(e => e.dryRun === true);
      
      console.log('\nTotal Stats:');
      console.log(`  Successes: ${success.length} (${dryRuns.length} dry)`);
      console.log(`  Errors:    ${errors.length}`);
    } catch (e) {
      console.error('Error reading audit log:', e.message);
    }
  } else {
    console.log('\nNo audit log found.');
  }
}

inspect().catch(console.error);

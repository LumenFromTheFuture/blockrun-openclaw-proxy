import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, '..', 'src', 'server.mjs');

// Mock findPaymentMetadata for unit test simulation
// (In a real test we might export it from server.mjs, but for now we'll test the extraction logic directly if we can't export)
// Since server.mjs is a script, we'll extract the functions into a testable file or just test via smoke

function isPaymentNetworkPath(path) {
  const joined = path.join('.').toLowerCase();
  const leaf = String(path[path.length - 1] || '').toLowerCase();
  return joined === 'metadata.network'
    || joined === 'payment.network'
    || joined === 'metadata.payment.network'
    || leaf === 'paymentnetwork'
    || leaf === 'payment_network';
}

function isReceiptPath(path) {
  const joined = path.join('.').toLowerCase();
  const leaf = String(path[path.length - 1] || '').toLowerCase();
  return [
    /^metadata\.payment\.(transactionhash|txhash|receipt(id|ref)?|reference)$/i,
    /^payment\.(transactionhash|txhash|receipt(id|ref)?|reference)$/i,
    /(^|[._-])(transactionhash|txhash|receipthash|receiptid|receiptref|paymentid|paymentref|reference|receipt_ref)([._-]|$)/i,
  ].some((pattern) => pattern.test(joined) || pattern.test(leaf));
}

function isReceiptValue(value) {
  return /^0x[a-f0-9]{64}$/i.test(value)
    || /^[a-z0-9][a-z0-9:_-]{7,}$/i.test(value);
}

function findPaymentMetadata(value) {
  const seen = new Set();
  const queue = [{ value, path: [] }];
  let paymentNetwork = null;
  let receiptRef = null;

  while (queue.length) {
    const item = queue.shift();
    if (!item.value || typeof item.value !== 'object' || seen.has(item.value)) continue;
    seen.add(item.value);
    for (const [key, child] of Object.entries(item.value)) {
      const path = [...item.path, key];
      if (typeof child === 'string') {
        if (!paymentNetwork && isPaymentNetworkPath(path)) {
          paymentNetwork = child;
        }
        if (!receiptRef && isReceiptPath(path) && isReceiptValue(child)) {
          receiptRef = child;
        }
      } else if (child && typeof child === 'object') {
        queue.push({ value: child, path });
      }
    }
  }

  return { paymentNetwork, receiptRef };
}

const tests = [
  {
    name: 'standard AgentCash metadata',
    input: {
      metadata: {
        payment: {
          network: 'base',
          transactionHash: '0x1234567890123456789012345678901234567890123456789012345678901234'
        }
      }
    },
    expected: {
      paymentNetwork: 'base',
      receiptRef: '0x1234567890123456789012345678901234567890123456789012345678901234'
    }
  },
  {
    name: 'top-level keys',
    input: {
      payment_network: 'solana',
      receipt_ref: 'abc-123-def'
    },
    expected: {
      paymentNetwork: 'solana',
      receiptRef: 'abc-123-def'
    }
  },
  {
    name: 'mixed metadata',
    input: {
      payment: {
        network: 'ethereum',
        txHash: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
      }
    },
    expected: {
      paymentNetwork: 'ethereum',
      receiptRef: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
    }
  }
];

let failed = 0;
for (const t of tests) {
  try {
    const actual = findPaymentMetadata(t.input);
    assert.deepStrictEqual(actual, t.expected);
    console.log(`[PASS] ${t.name}`);
  } catch (e) {
    console.error(`[FAIL] ${t.name}: expected ${JSON.stringify(t.expected)}, got ${JSON.stringify(findPaymentMetadata(t.input))}`);
    failed++;
  }
}

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All payment metadata tests passed.');
}

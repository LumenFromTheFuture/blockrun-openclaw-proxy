import assert from 'node:assert';

function isPaymentNetworkPath(path) {
  const joined = path.join('.').toLowerCase();
  const leaf = String(path[path.length - 1] || '').toLowerCase();
  return joined === 'metadata.network'
    || joined === 'payment.network'
    || joined === 'metadata.payment.network'
    || leaf === 'paymentnetwork'
    || leaf === 'payment_network';
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
      } else if (child && typeof child === 'object') {
        queue.push({ value: child, path });
      }
    }
  }

  return { paymentNetwork };
}

const tests = [
  {
    name: 'top-level payment_network',
    input: { payment_network: 'base' },
    expected: 'base'
  },
  {
    name: 'metadata.network',
    input: { metadata: { network: 'solana' } },
    expected: 'solana'
  },
  {
    name: 'metadata.payment.network',
    input: { metadata: { payment: { network: 'ethereum' } } },
    expected: 'ethereum'
  }
];

for (const t of tests) {
  const result = findPaymentMetadata(t.input);
  assert.strictEqual(result.paymentNetwork, t.expected, `Failed ${t.name}: expected ${t.expected}, got ${result.paymentNetwork}`);
  console.log(`✅ ${t.name}`);
}

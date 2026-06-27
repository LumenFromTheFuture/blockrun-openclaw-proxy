function findCostUsd(value) {
  const seen = new Set();
  const queue = [{ value, path: [] }];
  const candidates = [];
  while (queue.length) {
    const item = queue.shift();
    if (!item.value || typeof item.value !== 'object' || seen.has(item.value)) continue;
    seen.add(item.value);
    for (const [key, child] of Object.entries(item.value)) {
      const path = [...item.path, key];
      const isCostKey = isCostPath(path);
      
      if (typeof child === 'number' && isCostKey) {
        candidates.push(child);
      } else if (typeof child === 'string' && isCostKey) {
        const cleaned = child.replace(/[$,]/g, '');
        const num = Number(cleaned);
        if (Number.isFinite(num)) {
          candidates.push(num);
        }
      } else if (child && typeof child === 'object') {
        queue.push({ value: child, path });
      }
    }
  }
  const positive = candidates.filter((value) => Number.isFinite(value) && value >= 0);
  return positive.length ? Math.max(...positive) : null;
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

function isCostPath(path) {
  const joined = path.join('.').toLowerCase();
  const leaf = String(path[path.length - 1] || '').toLowerCase();
  return [
    /(^|[._-])(cost|price|paid)([._-]|$)/,
    /(^|[._-])(amount|total)[._-]?usd([._-]|$)/,
    /(^|[._-])usd[._-]?(amount|total)([._-]|$)/,
  ].some((pattern) => pattern.test(joined) || pattern.test(leaf));
}

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
    /(^|[._-])(transactionhash|txhash|receipthash|receiptid|receiptref|paymentid|paymentref|reference)([._-]|$)/i,
  ].some((pattern) => pattern.test(joined) || pattern.test(leaf));
}

function isReceiptValue(value) {
  return /^0x[a-f0-9]{64}$/i.test(value)
    || /^[a-z0-9][a-z0-9:_-]{7,}$/i.test(value);
}

const cases = [
  {
    name: 'extracts string price from metadata',
    data: {
      success: true,
      data: { id: 'test' },
      metadata: {
        protocol: 'x402',
        network: 'base',
        price: '$0.0026',
        payment: {
          success: true,
          transactionHash: '0x7a28fb17d1932798736fb6770efc14fcda030b594a02b7deec844bccd79193a7',
        },
      },
    },
    expected: {
      cost: 0.0026,
      paymentNetwork: 'base',
      receiptRef: '0x7a28fb17d1932798736fb6770efc14fcda030b594a02b7deec844bccd79193a7',
    },
  },
  {
    name: 'ignores generic totals that are not explicitly usd spend',
    data: {
      success: true,
      usage: { total: 1234, total_tokens: 1234 },
      metadata: { payment: { success: true } },
    },
    expected: {
      cost: null,
      paymentNetwork: null,
      receiptRef: null,
    },
  },
  {
    name: 'prefers explicit usd amount over unrelated totals',
    data: {
      success: true,
      metadata: {
        total: 99,
        amount_usd: '0.0042',
      },
      usage: { total: 2048 },
    },
    expected: {
      cost: 0.0042,
      paymentNetwork: null,
      receiptRef: null,
    },
  },
  {
    name: 'extracts alternate receipt identifiers from payment metadata',
    data: {
      success: true,
      metadata: {
        payment_network: 'base',
        paid_usd: '0.01',
        payment: {
          receiptId: 'receipt_abc12345',
        },
      },
    },
    expected: {
      cost: 0.01,
      paymentNetwork: 'base',
      receiptRef: 'receipt_abc12345',
    },
  },
];

for (const testCase of cases) {
  const cost = findCostUsd(testCase.data);
  const payment = findPaymentMetadata(testCase.data);
  const actual = { cost, ...payment };
  console.log(`${testCase.name}:`, actual);
  if (JSON.stringify(actual) !== JSON.stringify(testCase.expected)) {
    console.log('FAILED');
    process.exit(1);
  }
}

console.log('SUCCESS');

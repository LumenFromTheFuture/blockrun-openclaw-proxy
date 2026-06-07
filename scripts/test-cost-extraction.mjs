import { readFileSync } from 'fs';

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
      const isCostKey = /(^|_|\.)((cost|price|paid|amount)(_?usd)?|total)$/i.test(path.join('.'));
      
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

const testData = {
  "success": true,
  "data": { "id": "test" },
  "metadata": {
    "protocol": "x402",
    "network": "base",
    "price": "$0.0026",
    "payment": { "success": true }
  }
};

const cost = findCostUsd(testData);
console.log('Detected cost:', cost);
if (cost === 0.0026) {
  console.log('SUCCESS');
} else {
  console.log('FAILED');
  process.exit(1);
}

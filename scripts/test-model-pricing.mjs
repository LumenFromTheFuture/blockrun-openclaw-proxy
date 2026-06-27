import assert from 'node:assert';

const PRICING = {
  'google/gemini-3-flash-preview': { prompt: 0.0000001, completion: 0.0000003 },
  'openai/gpt-5.4-mini': { prompt: 0.00000015, completion: 0.0000006 },
  'openai/gpt-5.4-nano': { prompt: 0.00000005, completion: 0.00000015 },
};

function getEstimatedCost(model, promptTokens) {
  const price = PRICING[model];
  if (!price) return 0.05; // Matches config.maxUsdPerRequest default
  return Number((promptTokens * (price.prompt + price.completion)).toFixed(8));
}

const cases = [
  { model: 'google/gemini-3-flash-preview', tokens: 1000, expected: 0.0004 },
  { model: 'openai/gpt-5.4-mini', tokens: 1000, expected: 0.00075 },
  { model: 'openai/gpt-5.4-nano', tokens: 1000, expected: 0.0002 },
  { model: 'unknown/model', tokens: 1000, expected: 0.05 }
];

console.log('Running pre-request pricing tests...');
for (const c of cases) {
  const actual = getEstimatedCost(c.model, c.tokens);
  assert.strictEqual(actual, c.expected, `${c.model} failed: expected ${c.expected}, got ${actual}`);
  console.log(`✅ ${c.model}`);
}
console.log('All pricing tests passed.');

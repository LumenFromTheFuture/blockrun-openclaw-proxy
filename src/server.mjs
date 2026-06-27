#!/usr/bin/env node

import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_MODELS = [
  'google/gemini-3-flash-preview',
  'openai/gpt-5.4-mini',
  'openai/gpt-5.4-nano',
  'anthropic/claude-haiku-4.5',
  'deepseek/deepseek-chat',
  'xai/grok-4.3',
];

const PRICING = {
  'google/gemini-3-flash-preview': { prompt: 0.0000001, completion: 0.0000003 },
  'openai/gpt-5.4-mini': { prompt: 0.00000015, completion: 0.0000006 },
  'openai/gpt-5.4-nano': { prompt: 0.00000005, completion: 0.00000015 },
};

const config = {
  port: numberEnv('PORT', 8787),
  host: process.env.HOST || '127.0.0.1',
  blockrunUrl: process.env.BLOCKRUN_CHAT_URL || 'https://blockrun.ai/api/v1/chat/completions',
  auditLog: expandHome(process.env.BLOCKRUN_AUDIT_LOG || '~/.openclaw/blockrun-proxy/audit.jsonl'),
  ledgerFile: expandHome(process.env.BLOCKRUN_LEDGER_FILE || '~/.openclaw/blockrun-proxy/ledger.json'),
  dryRun: process.env.BLOCKRUN_DRY_RUN === '1',
  maxUsdPerRequest: numberEnv('BLOCKRUN_MAX_USD_PER_REQUEST', 0.05),
  unknownCostUsd: numberEnv('BLOCKRUN_UNKNOWN_COST_USD', 0.05),
  dailyBudgetUsd: numberEnv('BLOCKRUN_DAILY_BUDGET_USD', 1.0),
  timeoutMs: numberEnv('BLOCKRUN_TIMEOUT_MS', 180000),
  models: (process.env.BLOCKRUN_MODELS || DEFAULT_MODELS.join(','))
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean),
  paymentNetwork: process.env.BLOCKRUN_PAYMENT_NETWORK || '',
};

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function expandHome(path) {
  return path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : path;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function readJsonFile(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function ensureParent(path) {
  await mkdir(dirname(path), { recursive: true });
}

function getSpentToday() {
  return readJsonFile(config.ledgerFile, {}).then((ledger) => Number(ledger[todayKey()]?.spentUsd || 0));
}

function getEstimatedCost(model, promptTokens) {
  const price = PRICING[model];
  if (!price) return config.maxUsdPerRequest;
  // Estimate total cost assuming 1:1 prompt/completion ratio for a safe upper bound
  return Number((promptTokens * (price.prompt + price.completion)).toFixed(8));
}

async function addSpend(amountUsd) {
  const day = todayKey();
  const ledger = await readJsonFile(config.ledgerFile, {});
  const entry = ledger[day] || { spentUsd: 0, calls: 0 };
  entry.spentUsd = Number((Number(entry.spentUsd || 0) + amountUsd).toFixed(8));
  entry.calls = Number(entry.calls || 0) + 1;
  ledger[day] = entry;
  await ensureParent(config.ledgerFile);
  await writeFile(config.ledgerFile, `${JSON.stringify(ledger, null, 2)}\n`);
  return entry;
}

async function appendAudit(entry) {
  await ensureParent(config.auditLog);
  await appendFile(config.auditLog, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
}

function jsonResponse(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function validateChatRequest(body) {
  if (!body || typeof body !== 'object') return 'body must be a JSON object';
  if (typeof body.model !== 'string' || !body.model) return 'model is required';
  if (!Array.isArray(body.messages) || body.messages.length === 0) return 'messages must be a non-empty array';
  if (!config.models.includes(body.model)) {
    return `model ${body.model} is not allowed by BLOCKRUN_MODELS`;
  }
  return null;
}

function dryRunCompletion(body) {
  return {
    id: `chatcmpl-blockrun-dry-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: body.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'blockrun-openclaw-proxy dry run ok',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
    },
  };
}

async function callAgentCash(body, onChunk) {
  const args = [
    'agentcash@latest',
    'fetch',
    config.blockrunUrl,
    '-m',
    'POST',
    '-b',
    JSON.stringify(body),
    '--format',
    'json',
  ];
  if (config.paymentNetwork) {
    args.push('--payment-network', config.paymentNetwork);
  }

  return new Promise((resolvePromise, reject) => {
    const child = spawn('npx', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`AgentCash call timed out after ${config.timeoutMs}ms`));
    }, config.timeoutMs);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      const str = chunk.toString();
      stdout += str;
      if (onChunk) onChunk(str);
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`agentcash exited ${code}: ${stderr || stdout}`.trim()));
        return;
      }
      try {
        resolvePromise(JSON.parse(stdout));
      } catch {
        reject(new Error(`agentcash returned non-JSON output: ${stdout.slice(0, 500)}`));
      }
    });
  });
}

function unwrapAgentCash(result) {
  if (isChatCompletion(result)) return result;
  if (isChatCompletion(result?.data)) return result.data;
  if (isChatCompletion(result?.body)) return result.body;
  if (isChatCompletion(result?.response)) return result.response;
  if (typeof result?.data === 'string') {
    try {
      const parsed = JSON.parse(result.data);
      if (isChatCompletion(parsed)) return parsed;
    } catch {
      // Keep envelope below.
    }
  }
  return result;
}

function isChatCompletion(value) {
  return value
    && typeof value === 'object'
    && Array.isArray(value.choices)
    && value.choices[0]?.message;
}

function completionToStream(completion) {
  const choice = completion.choices?.[0] || {};
  const message = choice.message || {};
  return [
    {
      id: completion.id || `chatcmpl-blockrun-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: completion.created || Math.floor(Date.now() / 1000),
      model: completion.model,
      choices: [
        {
          index: choice.index || 0,
          delta: {
            role: message.role || 'assistant',
            content: message.content || '',
          },
          finish_reason: null,
        },
      ],
    },
    {
      id: completion.id || `chatcmpl-blockrun-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: completion.created || Math.floor(Date.now() / 1000),
      model: completion.model,
      choices: [
        {
          index: choice.index || 0,
          delta: {},
          finish_reason: choice.finish_reason || 'stop',
        },
      ],
    },
  ];
}

function streamResponse(res, completion, headers = {}) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    ...headers,
  });
  for (const chunk of completionToStream(completion)) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

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
    /(^|[._-])(transactionhash|txhash|receipthash|receiptid|receiptref|paymentid|paymentref|reference|receipt_ref)([._-]|$)/i,
  ].some((pattern) => pattern.test(joined) || pattern.test(leaf));
}

function isReceiptValue(value) {
  return /^0x[a-f0-9]{64}$/i.test(value)
    || /^[a-z0-9][a-z0-9:_-]{7,}$/i.test(value);
}

async function handleChat(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    jsonResponse(res, 400, { error: { message: `invalid JSON: ${error.message}` } });
    return;
  }

  const validationError = validateChatRequest(body);
  if (validationError) {
    jsonResponse(res, 400, { error: { message: validationError } });
    return;
  }

  const spentToday = await getSpentToday();
  const estimatedCost = getEstimatedCost(body.model, body.messages.reduce((acc, m) => acc + (m.content?.length || 0) / 4, 0));

  if (spentToday + estimatedCost > config.dailyBudgetUsd) {
    await appendAudit({
      event: 'budget_reject',
      model: body.model,
      spentToday,
      dailyBudgetUsd: config.dailyBudgetUsd,
      estimatedCost,
    });
    jsonResponse(res, 402, {
      error: {
        message: 'local BlockRun proxy budget exhausted (pre-request check)',
        spent_today_usd: spentToday,
        daily_budget_usd: config.dailyBudgetUsd,
        estimated_cost_usd: estimatedCost,
      },
    });
    return;
  }

  const started = Date.now();
  try {
    const upstreamBody = body.stream
      ? Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'stream' && key !== 'stream_options'))
      : body;

    let streamed = false;
    const raw = config.dryRun
      ? dryRunCompletion(upstreamBody)
      : await callAgentCash(upstreamBody, (chunk) => {
        if (body.stream && !streamed && chunk.includes('"choices"')) {
          res.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
          });
          streamed = true;
        }
        if (streamed) {
          try {
            const parsed = JSON.parse(chunk);
            const unwrapped = unwrapAgentCash(parsed);
            if (isChatCompletion(unwrapped)) {
              for (const sChunk of completionToStream(unwrapped)) {
                res.write(`data: ${JSON.stringify(sChunk)}\n\n`);
              }
            }
          } catch {
            // Partial chunk or non-JSON
          }
        }
      });

    const upstream = unwrapAgentCash(raw);
    const actualCost = config.dryRun ? 0 : findCostUsd(raw);
    const paymentMetadata = config.dryRun
      ? { paymentNetwork: null, receiptRef: null }
      : findPaymentMetadata(raw);
    const bookedCost = actualCost ?? (config.unknownCostUsd > 0 ? config.unknownCostUsd : config.maxUsdPerRequest);
    const ledger = await addSpend(bookedCost);
    await appendAudit({
      event: 'chat_completion',
      model: body.model,
      dryRun: config.dryRun,
      streamed: Boolean(body.stream),
      durationMs: Date.now() - started,
      actualCostUsd: actualCost,
      bookedCostUsd: bookedCost,
      paymentNetwork: paymentMetadata.paymentNetwork,
      receiptRef: paymentMetadata.receiptRef,
      spentTodayUsd: ledger.spentUsd,
    });

    if (streamed) {
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      const responseHeaders = {
        'x-blockrun-proxy-booked-cost-usd': String(bookedCost),
        'x-blockrun-proxy-spent-today-usd': String(ledger.spentUsd),
      };
      if (body.stream && isChatCompletion(upstream)) {
        streamResponse(res, upstream, responseHeaders);
      } else {
        jsonResponse(res, 200, upstream, responseHeaders);
      }
    }
  } catch (error) {
    await appendAudit({
      event: 'upstream_error',
      model: body.model,
      durationMs: Date.now() - started,
      error: error.message,
    });
    jsonResponse(res, 502, { error: { message: error.message } });
  }
}

function handleModels(_req, res) {
  jsonResponse(res, 200, {
    object: 'list',
    data: config.models.map((id) => ({
      id,
      object: 'model',
      owned_by: 'blockrun',
    })),
  });
}

async function handleHealth(_req, res) {
  jsonResponse(res, 200, {
    ok: true,
    dry_run: config.dryRun,
    blockrun_url: config.blockrunUrl,
    models: config.models,
    spent_today_usd: await getSpentToday(),
    daily_budget_usd: config.dailyBudgetUsd,
    max_usd_per_request: config.maxUsdPerRequest,
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${config.host}:${config.port}`}`);
  if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/v1/health')) {
    await handleHealth(req, res);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/v1/models') {
    handleModels(req, res);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    await handleChat(req, res);
    return;
  }
  jsonResponse(res, 404, { error: { message: 'not found' } });
});

server.listen(config.port, config.host, () => {
  console.error(`blockrun-openclaw-proxy listening on http://${config.host}:${config.port}`);
  console.error(`dry_run=${config.dryRun} daily_budget_usd=${config.dailyBudgetUsd} max_usd_per_request=${config.maxUsdPerRequest}`);
});

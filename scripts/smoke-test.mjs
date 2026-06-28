#!/usr/bin/env node

import { spawn } from 'node:child_process';

const port = Number(process.env.PORT || 8787);
const baseUrl = `http://127.0.0.1:${port}`;

const child = spawn(process.execPath, ['src/server.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    PORT: String(port),
    BLOCKRUN_DRY_RUN: process.env.BLOCKRUN_DRY_RUN || '1',
    BLOCKRUN_AUDIT_LOG: process.env.BLOCKRUN_AUDIT_LOG || '/tmp/blockrun-openclaw-proxy-audit.jsonl',
    BLOCKRUN_LEDGER_FILE: process.env.BLOCKRUN_LEDGER_FILE || '/tmp/blockrun-openclaw-proxy-ledger.json',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await waitForHealth(baseUrl);
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [{ role: 'user', content: 'Say ok.' }],
      max_tokens: 8,
      temperature: 0,
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  if (body.choices?.[0]?.message?.content !== 'blockrun-openclaw-proxy dry run ok') {
    throw new Error(`unexpected response: ${JSON.stringify(body)}`);
  }
  const toolResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [{ role: 'user', content: 'Call the test tool.' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'lookup_balance',
            description: 'Return a balance',
            parameters: {
              type: 'object',
              properties: {},
            },
          },
        },
      ],
      tool_choice: {
        type: 'function',
        function: { name: 'lookup_balance' },
      },
      temperature: 0,
    }),
  });
  const toolBody = await toolResponse.json();
  if (!toolResponse.ok) {
    throw new Error(`tool HTTP ${toolResponse.status}: ${JSON.stringify(toolBody)}`);
  }
  const toolCall = toolBody.choices?.[0]?.message?.tool_calls?.[0];
  if (toolBody.choices?.[0]?.finish_reason !== 'tool_calls' || toolCall?.function?.name !== 'lookup_balance') {
    throw new Error(`tool call response mismatch: ${JSON.stringify(toolBody)}`);
  }
  const streamResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [{ role: 'user', content: 'Say ok.' }],
      max_tokens: 8,
      temperature: 0,
      stream: true,
    }),
  });
  const streamBody = await streamResponse.text();
  if (!streamResponse.ok) {
    throw new Error(`stream HTTP ${streamResponse.status}: ${streamBody}`);
  }
  if (!streamBody.includes('data: [DONE]')) {
    throw new Error(`stream did not terminate correctly: ${streamBody}`);
  }
  const toolStreamResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [{ role: 'user', content: 'Call the test tool.' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'lookup_balance',
            description: 'Return a balance',
            parameters: {
              type: 'object',
              properties: {},
            },
          },
        },
      ],
      stream: true,
      temperature: 0,
    }),
  });
  const toolStreamBody = await toolStreamResponse.text();
  if (!toolStreamResponse.ok) {
    throw new Error(`tool stream HTTP ${toolStreamResponse.status}: ${toolStreamBody}`);
  }
  if (!toolStreamBody.includes('"tool_calls"') || !toolStreamBody.includes('"lookup_balance"') || !toolStreamBody.includes('"finish_reason":"tool_calls"')) {
    throw new Error(`tool stream did not preserve tool call data: ${toolStreamBody}`);
  }
  console.log('dry smoke test passed');
} finally {
  child.kill('SIGTERM');
}

async function waitForHealth(baseUrl) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Server not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('server did not become healthy');
}

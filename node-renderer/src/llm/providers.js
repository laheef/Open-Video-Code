'use strict';
// OpenAI-compatible + Gemini HTTP clients. Each returns a raw string that the
// orchestrator extracts JSON from. Uses global fetch (Node 18+).
const { config } = require('../config');

async function withTimeout(promise, ms, label) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await promise(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

// Works for Groq, OpenAI, and any OpenAI-compatible endpoint.
async function callOpenAICompatible({ baseUrl, apiKey, model, system, user }) {
  return withTimeout((signal) => fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  }).then(async (r) => {
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`LLM HTTP ${r.status}: ${t.slice(0, 300)}`);
    }
    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM returned empty content');
    return content;
  }), config.llm.timeoutMs, 'openai');
}

async function callGemini({ apiKey, model, system, user }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  return withTimeout((signal) => fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
    }),
  }).then(async (r) => {
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`Gemini HTTP ${r.status}: ${t.slice(0, 300)}`);
    }
    const data = await r.json();
    const content = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('');
    if (!content) throw new Error('Gemini returned empty content');
    return content;
  }), config.llm.timeoutMs, 'gemini');
}

module.exports = { callOpenAICompatible, callGemini };

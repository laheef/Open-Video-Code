'use strict';
/*
 * LLM orchestrator: script → structured scene document.
 *
 * Provider auto-selection (LLM_PROVIDER=auto):
 *   groq key   → Groq (OpenAI-compatible, free tier)
 *   openai key → OpenAI-compatible endpoint
 *   gemini key → Google Gemini
 *   none       → deterministic offline heuristic parser
 *
 * The provider's ONLY job is to emit JSON matching our schema. We then extract,
 * parse, and hand off to sanitizeDocument() (in schema.js) — the LLM output is
 * NEVER trusted directly. Malformed JSON triggers a fallback to the heuristic
 * parser so a bad model response still yields a usable video.
 */
const { config } = require('../config');
const { log } = require('../log');
const { systemPrompt, userPrompt } = require('./prompt');
const { callOpenAICompatible, callGemini } = require('./providers');
const heuristic = require('./heuristic');

function selectProvider() {
  const p = config.llm.provider;
  if (p && p !== 'auto') return p;
  if (config.llm.groqApiKey) return 'groq';
  if (config.llm.openaiApiKey) return 'openai';
  if (config.llm.geminiApiKey) return 'gemini';
  return 'heuristic';
}

// Robustly pull a JSON object out of an LLM response that might be wrapped in
// markdown fences or have leading/trailing prose.
function extractJson(raw) {
  if (typeof raw !== 'string') throw new Error('LLM response not a string');
  let s = raw.trim();
  // Strip ```json ... ``` fences.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // Direct parse first.
  try { return JSON.parse(s); } catch { /* fall through */ }
  // Fallback: grab the outermost {...}.
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last > first) {
    const candidate = s.slice(first, last + 1);
    return JSON.parse(candidate); // may throw → caller handles
  }
  throw new Error('No JSON object found in LLM response');
}

async function callProvider(provider, script, options) {
  const system = systemPrompt();
  const user = userPrompt(script, options);

  switch (provider) {
    case 'groq':
      return callOpenAICompatible({
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: config.llm.groqApiKey,
        model: config.llm.groqModel,
        system, user,
      });
    case 'openai':
      return callOpenAICompatible({
        baseUrl: config.llm.openaiBaseUrl,
        apiKey: config.llm.openaiApiKey,
        model: config.llm.openaiModel,
        system, user,
      });
    case 'gemini':
      return callGemini({
        apiKey: config.llm.geminiApiKey,
        model: config.llm.geminiModel,
        system, user,
      });
    default:
      return null;
  }
}

/**
 * Produce a RAW (unsanitized) scene document from a script.
 * Returns { doc, provider, warnings }. Never throws — always falls back to the
 * heuristic parser so /generate can proceed.
 */
async function generateSceneDoc(script, options = {}) {
  const provider = selectProvider();
  const warnings = [];

  if (provider === 'heuristic') {
    return { doc: heuristic.generate(script, options), provider: 'heuristic', warnings };
  }

  try {
    const raw = await callProvider(provider, script, options);
    const parsed = extractJson(raw);
    return { doc: parsed, provider, warnings };
  } catch (e) {
    log.warn(`LLM provider "${provider}" failed (${e.message}); falling back to heuristic`);
    warnings.push(`LLM (${provider}) failed: ${e.message}. Used offline generator instead.`);
    return { doc: heuristic.generate(script, options), provider: `${provider}→heuristic`, warnings };
  }
}

module.exports = { generateSceneDoc, selectProvider, extractJson };

'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

// Auto-load .env (Node 18.20+/20.6+/22 built-in — no dotenv dependency needed).
try {
  const envPath = path.join(ROOT, '.env');
  if (typeof process.loadEnvFile === 'function' && fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
} catch { /* ignore malformed .env */ }

function bool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

const config = {
  root: ROOT,
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',

  // Where rendered MP4s and the SQLite DB live. Kept OUT of git.
  dataDir: process.env.DATA_DIR || path.join(ROOT, 'data'),
  get outputDir() { return path.join(this.dataDir, 'renders'); },
  get dbPath() { return path.join(this.dataDir, 'jobs.db'); },

  // Render behaviour
  renderConcurrency: parseInt(process.env.RENDER_CONCURRENCY || '1', 10),
  maxRenderRetries: parseInt(process.env.MAX_RENDER_RETRIES || '1', 10),
  // Which renderer implementation to use: 'local' (renderMedia in-process)
  // or 'external' (POST scene JSON to a remote render service — VPS / Lambda).
  renderTarget: process.env.RENDER_TARGET || 'local',
  externalRenderUrl: process.env.EXTERNAL_RENDER_URL || '',
  externalRenderToken: process.env.EXTERNAL_RENDER_TOKEN || '',

  // Optional Chromium override. If unset the resolver auto-discovers one.
  chromiumPath: process.env.CHROMIUM_PATH || '',

  // LLM provider config. Provider is auto-selected: if a key exists use it,
  // otherwise fall back to the deterministic offline heuristic parser.
  llm: {
    provider: process.env.LLM_PROVIDER || 'auto', // auto | groq | openai | gemini | heuristic
    groqApiKey: process.env.GROQ_API_KEY || '',
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '30000', 10),
  },

  // Simple shared-secret the PHP app can send so only it can call /generate.
  // Empty = open (fine for local/dev).
  apiToken: process.env.NODE_RENDER_API_TOKEN || '',

  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  verbose: bool(process.env.VERBOSE, true),
};

function ensureDirs() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.outputDir, { recursive: true });
}

module.exports = { config, ensureDirs };

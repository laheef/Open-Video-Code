'use strict';
const path = require('path');
const express = require('express');
const { config, ensureDirs } = require('./config');
const { log } = require('./log');
const db = require('./db');
const worker = require('./worker');
const { router } = require('./routes');

async function main() {
  ensureDirs();
  db.init();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Basic permissive CORS so a separately-hosted PHP/frontend can call the API.
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Demo UI (built in the Node app, per the chosen plan).
  app.use('/', express.static(path.join(config.root, 'public')));

  // API routes.
  app.use('/', router);

  app.use((err, req, res, next) => {
    log.error('unhandled error:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'internal error' });
  });

  await worker.start();

  app.listen(config.port, config.host, () => {
    log.info(`Script-to-Video renderer listening on http://${config.host}:${config.port}`);
    log.info(`LLM provider: ${require('./llm').selectProvider()} | render target: ${config.renderTarget}`);
  });
}

main().catch((e) => {
  log.error('fatal startup error:', e);
  process.exit(1);
});

'use strict';
/*
 * In-process async job worker.
 *
 * Rendering is NEVER synchronous with the HTTP request. /generate enqueues a
 * job (status=pending) and returns immediately; this worker picks it up, runs
 * the LLM step, sanitizes, then renders — updating job status as it goes.
 * A single-flight queue keeps CPU/RAM bounded on a small host (renders are
 * heavy). Failed renders are retried up to MAX_RENDER_RETRIES.
 */
const path = require('path');
const { config } = require('./config');
const { log } = require('./log');
const db = require('./db');
const { getRenderer } = require('./renderer');
const { generateSceneDoc } = require('./llm');
const { sanitizeDocument } = require('./schema');

const queue = [];
let running = false;
let renderer;

function enqueue(jobId) {
  if (!queue.includes(jobId)) queue.push(jobId);
  drain();
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const jobId = queue.shift();
      await processJob(jobId).catch((e) => log.error('processJob crashed:', e));
    }
  } finally {
    running = false;
  }
}

async function processJob(jobId) {
  let job = db.getJob(jobId);
  if (!job) return;
  if (job.status === 'done') return;

  // --- Stage 1: LLM → scene JSON (only if not already produced) ---
  if (!job.scene_json) {
    try {
      const { doc: rawDoc, provider, warnings } = await generateSceneDoc(job.script, job.options);
      const { ok, doc, warnings: sanWarnings, error } = sanitizeDocument(rawDoc);
      const allWarnings = [...(warnings || []), ...(sanWarnings || [])];
      if (!ok) {
        job = db.updateJob(jobId, {
          status: 'failed',
          llm_provider: provider,
          llm_warnings: allWarnings,
          error: `Scene generation failed: ${error}`,
        });
        return;
      }
      job = db.updateJob(jobId, {
        scene_json: doc,
        llm_provider: provider,
        llm_warnings: allWarnings,
      });
    } catch (e) {
      db.updateJob(jobId, { status: 'failed', error: `LLM stage error: ${e.message}` });
      return;
    }
  }

  // --- Stage 2: render (with retries) ---
  const doc = db.getJob(jobId).scene_json;
  const outPath = path.join(config.outputDir, `${jobId}.mp4`);
  const maxAttempts = config.maxRenderRetries + 1;

  for (let attempt = job.attempts; attempt < maxAttempts; attempt++) {
    db.updateJob(jobId, { status: 'rendering' });
    db.incrementAttempts(jobId);
    const t0 = Date.now();
    let lastLogged = -1;
    try {
      const result = await renderer.render(doc, outPath, (progress) => {
        // Light-touch progress; only log when the bucket actually changes.
        const pct = Math.floor(progress * 100 / 25) * 25;
        if (pct !== lastLogged) {
          lastLogged = pct;
          log.debug(`job ${jobId} render ${pct}%`);
        }
      });
      db.updateJob(jobId, {
        status: 'done',
        output_path: result.outputPath,
        output_bytes: result.bytes,
        duration_ms: Date.now() - t0,
        error: null,
      });
      log.info(`job ${jobId} done in ${((Date.now() - t0) / 1000).toFixed(1)}s (${result.bytes} bytes)`);
      return;
    } catch (e) {
      log.error(`job ${jobId} render attempt ${attempt + 1} failed:`, e.message);
      const isLast = attempt + 1 >= maxAttempts;
      if (isLast) {
        db.updateJob(jobId, { status: 'failed', error: `Render failed: ${e.message}` });
        return;
      }
      // brief backoff before retry
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

async function start() {
  renderer = getRenderer();
  log.info(`Renderer: ${renderer.name}`);
  try {
    await renderer.warmup();
  } catch (e) {
    log.warn('Renderer warmup failed (will surface on first render):', e.message);
  }
  // Resume any jobs left mid-flight after a restart.
  const resumable = db.findResumable();
  if (resumable.length) {
    log.info(`Resuming ${resumable.length} unfinished job(s)`);
    for (const j of resumable) enqueue(j.id);
  }
}

module.exports = { start, enqueue };

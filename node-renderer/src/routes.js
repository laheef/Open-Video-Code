'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const { config } = require('./config');
const { log } = require('./log');
const db = require('./db');
const worker = require('./worker');
const { sanitizeDocument, TEMPLATES, PALETTES, FONTS, ASPECT_RATIOS } = require('./schema');
const { generateSceneDoc } = require('./llm');

const router = express.Router();

// Optional shared-secret auth for the mutating/API endpoints (PHP → Node).
function requireToken(req, res, next) {
  if (!config.apiToken) return next();
  const header = req.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (token !== config.apiToken) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function publicJob(job, req) {
  const base = config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
  return {
    id: job.id,
    status: job.status,
    attempts: job.attempts,
    provider: job.llm_provider || null,
    warnings: job.llm_warnings || [],
    error: job.error || null,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    durationMs: job.duration_ms || null,
    sizeBytes: job.output_bytes || null,
    videoReady: job.status === 'done',
    videoUrl: job.status === 'done' ? `${base}/video/${job.id}` : null,
    // Expose the sanitized scene doc so the UI can show what was generated.
    scene: job.scene_json || null,
  };
}

// --- capabilities: templates/palettes/fonts/ratios for the UI ---
router.get('/meta', (req, res) => {
  res.json({
    templates: Object.fromEntries(
      Object.entries(TEMPLATES).map(([k, v]) => [k, {
        props: Object.fromEntries(Object.entries(v.props).map(([pk, ps]) => [pk, {
          type: ps.type, required: !!ps.required, values: ps.values || null,
        }])),
        durationRange: [v.minFrames, v.maxFrames],
      }])
    ),
    palettes: PALETTES,
    fonts: FONTS,
    aspectRatios: ASPECT_RATIOS,
    llmProvider: require('./llm').selectProvider(),
    renderTarget: config.renderTarget,
  });
});

// --- POST /generate : script → job ---
router.post('/generate', requireToken, async (req, res) => {
  try {
    const body = req.body || {};
    const script = typeof body.script === 'string' ? body.script.trim() : '';
    if (!script) return res.status(400).json({ error: 'script is required' });
    if (script.length > 8000) return res.status(400).json({ error: 'script too long (max 8000 chars)' });

    const options = {
      style: typeof body.style === 'string' ? body.style.slice(0, 60) : '',
      durationSec: body.durationSec ? Math.min(60, Math.max(5, parseInt(body.durationSec, 10) || 0)) : null,
      aspectRatio: ASPECT_RATIOS[body.aspectRatio] ? body.aspectRatio : '9:16',
      palette: PALETTES[body.palette] ? body.palette : '',
      font: FONTS.includes(body.font) ? body.font : '',
    };

    const job = db.createJob({ script, options });
    worker.enqueue(job.id);
    log.info(`created job ${job.id} (aspect ${options.aspectRatio}, ~${options.durationSec || 'auto'}s)`);
    res.status(202).json(publicJob(job, req));
  } catch (e) {
    log.error('POST /generate error:', e);
    res.status(500).json({ error: 'internal error' });
  }
});

// --- GET /status/:id ---
router.get('/status/:id', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json(publicJob(job, req));
});

// --- GET /video/:id : stream the MP4 (supports range for <video>) ---
router.get('/video/:id', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  if (job.status !== 'done' || !job.output_path || !fs.existsSync(job.output_path)) {
    return res.status(409).json({ error: 'video not ready', status: job.status });
  }
  const stat = fs.statSync(job.output_path);
  const filename = `${(job.scene_json && job.scene_json.title) || 'video'}`.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) || 'video';
  const range = req.headers.range;
  const download = req.query.download === '1';
  const disposition = download ? 'attachment' : 'inline';

  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = m ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': 'video/mp4',
      'Content-Disposition': `${disposition}; filename="${filename}.mp4"`,
    });
    fs.createReadStream(job.output_path, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `${disposition}; filename="${filename}.mp4"`,
    });
    fs.createReadStream(job.output_path).pipe(res);
  }
});

// --- POST /preview-scene : sanitize a raw scene doc without rendering ---
// Handy for debugging the schema / LLM output.
router.post('/preview-scene', requireToken, async (req, res) => {
  const body = req.body || {};
  if (body.script) {
    const { doc, provider, warnings } = await generateSceneDoc(body.script, body.options || {});
    const result = sanitizeDocument(doc);
    return res.json({ provider, llmWarnings: warnings, ...result });
  }
  const result = sanitizeDocument(body.doc || body);
  res.json(result);
});

// --- GET /jobs : recent jobs (for the demo UI list) ---
router.get('/jobs', (req, res) => {
  const jobs = db.listJobs(30).map((j) => publicJob(j, req));
  res.json({ jobs });
});

router.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

module.exports = { router };

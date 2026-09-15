'use strict';
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const { config, ensureDirs } = require('./config');
const { log } = require('./log');

let db;

const STATUSES = ['pending', 'rendering', 'done', 'failed'];

function init() {
  ensureDirs();
  db = new DatabaseSync(config.dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id            TEXT PRIMARY KEY,
      status        TEXT NOT NULL DEFAULT 'pending',
      script        TEXT NOT NULL,
      options       TEXT,           -- JSON: {style,duration,aspectRatio,...}
      scene_json    TEXT,           -- sanitized scene document (JSON)
      llm_provider  TEXT,
      llm_warnings  TEXT,           -- JSON array
      output_path   TEXT,
      output_bytes  INTEGER,
      duration_ms   INTEGER,        -- render wall-clock
      attempts      INTEGER NOT NULL DEFAULT 0,
      error         TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);`);
  log.info('SQLite ready at', config.dbPath);
  return db;
}

function now() { return new Date().toISOString(); }
function newId() { return crypto.randomBytes(9).toString('base64url'); }

function createJob({ script, options }) {
  const id = newId();
  const t = now();
  db.prepare(`
    INSERT INTO jobs (id, status, script, options, created_at, updated_at)
    VALUES (?, 'pending', ?, ?, ?, ?)
  `).run(id, script, JSON.stringify(options || {}), t, t);
  return getJob(id);
}

function getJob(id) {
  const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id);
  return row ? hydrate(row) : null;
}

function hydrate(row) {
  return {
    ...row,
    options: safeParse(row.options, {}),
    scene_json: safeParse(row.scene_json, null),
    llm_warnings: safeParse(row.llm_warnings, []),
  };
}

function safeParse(s, def) {
  if (s == null) return def;
  try { return JSON.parse(s); } catch { return def; }
}

function updateJob(id, fields) {
  const allowed = [
    'status', 'scene_json', 'llm_provider', 'llm_warnings',
    'output_path', 'output_bytes', 'duration_ms', 'attempts', 'error',
  ];
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (!allowed.includes(k)) continue;
    sets.push(`${k} = ?`);
    if (k === 'scene_json' || k === 'llm_warnings') vals.push(v == null ? null : JSON.stringify(v));
    else vals.push(v);
  }
  if (!sets.length) return getJob(id);
  sets.push(`updated_at = ?`);
  vals.push(now());
  vals.push(id);
  db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return getJob(id);
}

function incrementAttempts(id) {
  db.prepare(`UPDATE jobs SET attempts = attempts + 1, updated_at = ? WHERE id = ?`).run(now(), id);
  return getJob(id);
}

// Reclaim jobs left mid-render if the process restarted.
function findResumable() {
  const rows = db.prepare(
    `SELECT * FROM jobs WHERE status IN ('pending','rendering') ORDER BY created_at ASC`
  ).all();
  return rows.map(hydrate);
}

function listJobs(limit = 50) {
  const rows = db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`).all(limit);
  return rows.map(hydrate);
}

module.exports = {
  init, createJob, getJob, updateJob, incrementAttempts,
  findResumable, listJobs, STATUSES,
};

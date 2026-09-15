'use strict';
// Render a scene document directly (bypassing the network LLM call) through the
// SAME sanitize -> Remotion pipeline used by the worker. Used to produce a video
// when the LLM provider is unreachable from this environment.
//
// Usage: node scripts/render-doc.js <docJsonPath> <outMp4Path>
const path = require('path');
const fs = require('fs');
const { sanitizeDocument } = require('../src/schema');
const { LocalRenderer } = require('../src/renderer/local');

let lastPct = -1;

(async () => {
  const docPath = process.argv[2];
  const outPath = path.resolve(process.argv[3] || 'data/renders/manual.mp4');
  const raw = JSON.parse(fs.readFileSync(docPath, 'utf8'));

  const { ok, doc, warnings, error } = sanitizeDocument(raw);
  if (!ok) { console.error('Sanitize failed:', error, warnings); process.exit(1); }
  if (warnings.length) console.log('Warnings:', warnings);
  console.log('Scenes:', doc.scenes.map((s) => `${s.template}:${s.durationInFrames}f`).join(', '));
  console.log('Format:', `${doc.width}x${doc.height} @${doc.fps} total ${doc.durationInFrames}f (${(doc.durationInFrames / doc.fps).toFixed(1)}s)`);

  const renderer = new LocalRenderer();
  await renderer.warmup();
  const t0 = Date.now();
  const res = await renderer.render(doc, outPath, (p) => {
    const pct = Math.floor(p * 100 / 10) * 10;
    if (pct !== lastPct) { lastPct = pct; process.stdout.write(` ${pct}%`); }
  });
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${res.outputPath} (${res.bytes} bytes)`);
})().catch((e) => { console.error(e); process.exit(1); });

'use strict';
// Lightweight assertions for the sanitizer (run: node test/schema.test.js).
// No test framework needed — keeps the locked-down host happy.
const assert = require('node:assert');
const { sanitizeDocument } = require('../src/schema');
const heuristic = require('../src/llm/heuristic');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

console.log('sanitizeDocument');

test('rejects non-object', () => {
  assert.strictEqual(sanitizeDocument(null).ok, false);
  assert.strictEqual(sanitizeDocument('x').ok, false);
});

test('rejects doc with no scenes', () => {
  assert.strictEqual(sanitizeDocument({ scenes: [] }).ok, false);
});

test('coerces unknown aspect ratio / palette / font / template', () => {
  const r = sanitizeDocument({
    aspectRatio: 'nope', theme: { palette: 'x', font: 'y' },
    scenes: [{ template: 'Bogus', props: { title: 'hi' } }],
  });
  assert.ok(r.ok);
  assert.strictEqual(r.doc.aspectRatio, '9:16');
  assert.strictEqual(r.doc.theme.palette, 'midnight');
  assert.strictEqual(r.doc.theme.font, 'Inter');
  assert.strictEqual(r.doc.scenes[0].template, 'TextReveal');
  assert.ok(r.warnings.length >= 4);
});

test('clamps duration and fps', () => {
  const r = sanitizeDocument({
    fps: 9999,
    scenes: [{ template: 'StatCounter', durationInFrames: -10, props: { value: 5 } }],
  });
  assert.ok(r.ok);
  assert.strictEqual(r.doc.fps, 60);
  assert.ok(r.doc.scenes[0].durationInFrames >= 45); // StatCounter minFrames
});

test('drops unknown props and non-numeric numbers', () => {
  const r = sanitizeDocument({
    scenes: [{ template: 'StatCounter', props: { value: 'abc', evil: 'x', suffix: 'y'.repeat(99) } }],
  });
  const p = r.doc.scenes[0].props;
  assert.strictEqual(p.value, 100);       // default
  assert.strictEqual(p.evil, undefined);  // dropped
  assert.ok(p.suffix.length <= 12);       // clamped
});

test('TextReveal splits text into lines when lines missing', () => {
  const r = sanitizeDocument({
    scenes: [{ template: 'TextReveal', props: { text: 'One sentence. Two sentence. Three.' } }],
  });
  const p = r.doc.scenes[0].props;
  assert.ok(Array.isArray(p.lines) && p.lines.length >= 2);
  assert.strictEqual(p.text, undefined);
});

test('caps number of scenes', () => {
  const scenes = Array.from({ length: 30 }, () => ({ template: 'TitleIntro', props: { title: 'x' } }));
  const r = sanitizeDocument({ scenes });
  assert.ok(r.doc.scenes.length <= 12);
});

console.log('heuristic parser');

test('produces a valid multi-scene doc that survives sanitization', () => {
  const raw = heuristic.generate(
    '3 reasons to journal. It cuts stress by 30%. Start tonight.',
    { aspectRatio: '9:16', durationSec: 15 }
  );
  const r = sanitizeDocument(raw);
  assert.ok(r.ok);
  assert.ok(r.doc.scenes.length >= 2);
  assert.ok(r.doc.scenes.some((s) => s.template === 'StatCounter')); // detected 30%
});

test('respects target duration roughly', () => {
  const raw = heuristic.generate('Hello world. This is a test.', { durationSec: 20 });
  const total = raw.scenes.reduce((a, s) => a + s.durationInFrames, 0);
  assert.ok(Math.abs(total - 20 * raw.fps) < 20 * raw.fps * 0.25);
});

console.log(`\n${passed} checks passed.`);

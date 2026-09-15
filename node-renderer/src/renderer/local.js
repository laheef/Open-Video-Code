'use strict';
/*
 * LocalRenderer — renders in-process via @remotion/renderer.renderMedia().
 *
 * The Remotion bundle is built once and cached (bundling costs ~9s; we don't
 * want to pay that per job). Chromium is resolved through the restrictive-host
 * resolver, and its bundled NSS libs are injected into LD_LIBRARY_PATH before
 * the browser launches.
 */
const path = require('path');
const fs = require('fs');
const { config } = require('../config');
const { log } = require('../log');
const { resolveChromium } = require('../chromium');

let bundlePromise = null;
let chromiumReady = false;

async function ensureChromium() {
  const resolved = await resolveChromium();
  if (resolved.extraLibDir && !chromiumReady) {
    const existing = process.env.LD_LIBRARY_PATH || '';
    if (!existing.split(':').includes(resolved.extraLibDir)) {
      process.env.LD_LIBRARY_PATH = resolved.extraLibDir + (existing ? ':' + existing : '');
    }
    chromiumReady = true;
  }
  return resolved.executablePath;
}

async function getBundle() {
  if (bundlePromise) return bundlePromise;
  const { bundle } = require('@remotion/bundler');
  const entry = path.join(config.root, 'remotion', 'index.js');
  log.info('Bundling Remotion project (one-time)…');
  bundlePromise = bundle({
    entryPoint: entry,
    // Keep webpack overrides minimal; default config handles JSX via esbuild.
  }).then((loc) => {
    log.info('Remotion bundle ready:', loc);
    return loc;
  }).catch((e) => {
    bundlePromise = null; // allow retry
    throw e;
  });
  return bundlePromise;
}

// Warm caches at boot so the first real render is fast and any Chromium
// resolution problem surfaces immediately.
async function warmup() {
  await ensureChromium();
  await getBundle();
}

class LocalRenderer {
  get name() { return 'local'; }

  async warmup() { return warmup(); }

  /**
   * @param {object} doc  sanitized scene document
   * @param {string} outPath  absolute output mp4 path
   * @param {function} onProgress  (0..1) => void
   */
  async render(doc, outPath, onProgress) {
    const { selectComposition, renderMedia } = require('@remotion/renderer');
    const executablePath = await ensureChromium();
    const serveUrl = await getBundle();

    const chromiumOptions = { gl: 'swiftshader', headless: true };
    const inputProps = { doc };

    const composition = await selectComposition({
      serveUrl,
      id: 'ScriptVideo',
      inputProps,
      browserExecutable: executablePath,
      chromiumOptions,
    });

    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: outPath,
      inputProps,
      browserExecutable: executablePath,
      chromiumOptions,
      concurrency: config.renderConcurrency,
      onProgress: onProgress ? ({ progress }) => onProgress(progress) : undefined,
    });

    const stat = fs.statSync(outPath);
    return { outputPath: outPath, bytes: stat.size };
  }
}

module.exports = { LocalRenderer };

'use strict';
/*
 * Chromium resolution for restrictive hosts.
 *
 * The spike proved that on a locked-down shared host, neither Remotion's
 * Chromium CDN nor the OS package mirrors are reachable — but the npm registry
 * is. So we resolve a browser binary in this priority order:
 *
 *   1. CHROMIUM_PATH env (operator override — e.g. a system chrome on a VPS)
 *   2. A system chrome/chromium already on PATH
 *   3. Remotion's own downloaded Chrome Headless Shell (if the CDN was reachable)
 *   4. @sparticuz/chromium — ships the binary + NSS libs INSIDE the npm package,
 *      so it works even when only the npm registry is reachable.
 *
 * Returns { executablePath, extraLibDir } — extraLibDir is prepended to
 * LD_LIBRARY_PATH by the caller when the sparticuz build needs its bundled
 * NSS libraries.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { config } = require('./config');
const { log } = require('./log');

let cached = null;

function firstExisting(paths) {
  for (const p of paths) {
    try { if (p && fs.existsSync(p)) return p; } catch { /* ignore */ }
  }
  return null;
}

function fromPath() {
  const names = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];
  for (const n of names) {
    try {
      const p = execFileSync('bash', ['-lc', `command -v ${n} || true`], { encoding: 'utf8' }).trim();
      if (p && fs.existsSync(p)) return p;
    } catch { /* ignore */ }
  }
  return null;
}

function fromRemotion() {
  // Remotion stores the headless shell under node_modules/.remotion
  const base = path.join(config.root, 'node_modules', '.remotion', 'chrome-headless-shell');
  if (!fs.existsSync(base)) return null;
  const hits = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === 'chrome-headless-shell' || e.name === 'chrome') hits.push(full);
    }
  };
  walk(base);
  return firstExisting(hits);
}

function ensureSparticuzLibs() {
  // Extract the NSS libraries bundled in @sparticuz/chromium so the binary
  // can load on non-Amazon-Linux hosts (the spike hit libnss3.so missing).
  let pkgDir;
  try { pkgDir = path.dirname(require.resolve('@sparticuz/chromium/package.json')); }
  catch { return null; }

  const libDir = path.join(config.dataDir, 'chromium-libs');
  const inner = path.join(libDir, 'lib');
  const marker = path.join(libDir, '.extracted');
  const resultDir = () => (fs.existsSync(inner) ? inner : libDir);
  if (fs.existsSync(marker)) return resultDir();

  const candidates = ['al2023.tar.br', 'al2.tar.br'];
  fs.mkdirSync(libDir, { recursive: true });
  for (const name of candidates) {
    const br = path.join(pkgDir, 'bin', name);
    if (!fs.existsSync(br)) continue;
    try {
      const tar = zlib.brotliDecompressSync(fs.readFileSync(br));
      extractTar(tar, libDir);
    } catch (e) {
      log.warn('Failed extracting', name, e.message);
    }
  }
  try { fs.writeFileSync(marker, new Date().toISOString()); } catch { /* ignore */ }
  // Libs land under libDir/lib per the tarball layout.
  return resultDir();
}

// Minimal POSIX/ustar tar extractor (avoids adding a tar dependency).
function extractTar(buf, destDir) {
  let offset = 0;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const name = cstr(header, 0, 100);
    const sizeStr = cstr(header, 124, 12).trim();
    const size = parseInt(sizeStr, 8) || 0;
    const typeflag = String.fromCharCode(header[156]);
    offset += 512;
    if (name && (typeflag === '0' || typeflag === '\0' || typeflag === '')) {
      const content = buf.subarray(offset, offset + size);
      const outPath = path.join(destDir, name);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, content);
      try { fs.chmodSync(outPath, 0o755); } catch { /* ignore */ }
    } else if (typeflag === '5') {
      fs.mkdirSync(path.join(destDir, name), { recursive: true });
    }
    offset += Math.ceil(size / 512) * 512;
  }
}
function cstr(buf, start, len) {
  const slice = buf.subarray(start, start + len);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? len : end).toString('utf8');
}

async function fromSparticuz() {
  let chromium;
  try { chromium = require('@sparticuz/chromium'); }
  catch { return null; }
  try {
    const exe = await chromium.executablePath();
    if (exe && fs.existsSync(exe)) {
      const extraLibDir = ensureSparticuzLibs();
      return { executablePath: exe, extraLibDir };
    }
  } catch (e) {
    log.warn('sparticuz executablePath failed:', e.message);
  }
  return null;
}

async function resolveChromium() {
  if (cached) return cached;

  // 1 + 2 + 3: paths that need no lib injection
  const direct = firstExisting([config.chromiumPath]) || fromPath() || fromRemotion();
  if (direct) {
    cached = { executablePath: direct, extraLibDir: null };
    log.info('Chromium resolved:', direct);
    return cached;
  }

  // 4: sparticuz (npm-only channel — survives locked-down hosts)
  const sp = await fromSparticuz();
  if (sp) {
    cached = sp;
    log.info('Chromium resolved via @sparticuz/chromium:', sp.executablePath,
      sp.extraLibDir ? `(libs: ${sp.extraLibDir})` : '');
    return cached;
  }

  throw new Error(
    'No Chromium binary could be resolved. Set CHROMIUM_PATH, install a system ' +
    'chrome, or ensure @sparticuz/chromium is installed.'
  );
}

module.exports = { resolveChromium };

'use strict';
/*
 * ExternalRenderer — the feasibility "fallback" path.
 *
 * When the shared host CANNOT run Chromium (no way to obtain a browser binary,
 * hard RAM/CPU/timeout limits), set RENDER_TARGET=external and point
 * EXTERNAL_RENDER_URL at a small VPS or a Remotion Lambda/Cloud Run wrapper
 * that exposes the SAME render contract. The rest of the app (jobs table,
 * /generate, /status, /video, PHP integration) is unchanged — only this class
 * is used instead of LocalRenderer.
 *
 * Contract expected of the external service:
 *   POST {EXTERNAL_RENDER_URL}
 *     headers: Authorization: Bearer {EXTERNAL_RENDER_TOKEN}
 *     body:    { doc }                       (the sanitized scene document)
 *     resp:    200 with the raw MP4 bytes (Content-Type: video/mp4)
 *              OR { url } JSON pointing at the finished file to download.
 */
const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { log } = require('../log');

class ExternalRenderer {
  get name() { return 'external'; }

  async warmup() {
    if (!config.externalRenderUrl) {
      throw new Error('RENDER_TARGET=external but EXTERNAL_RENDER_URL is not set');
    }
    log.info('External renderer configured:', config.externalRenderUrl);
  }

  async render(doc, outPath, onProgress) {
    if (!config.externalRenderUrl) {
      throw new Error('EXTERNAL_RENDER_URL not configured');
    }
    if (onProgress) onProgress(0.05);

    const headers = { 'Content-Type': 'application/json' };
    if (config.externalRenderToken) headers.Authorization = `Bearer ${config.externalRenderToken}`;

    const resp = await fetch(config.externalRenderUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ doc }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`External renderer HTTP ${resp.status}: ${text.slice(0, 300)}`);
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const contentType = resp.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await resp.json();
      if (!data.url) throw new Error('External renderer JSON missing "url"');
      const fileResp = await fetch(data.url);
      if (!fileResp.ok) throw new Error(`Download failed HTTP ${fileResp.status}`);
      const buf = Buffer.from(await fileResp.arrayBuffer());
      fs.writeFileSync(outPath, buf);
    } else {
      const buf = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(outPath, buf);
    }

    if (onProgress) onProgress(1);
    const stat = fs.statSync(outPath);
    return { outputPath: outPath, bytes: stat.size };
  }
}

module.exports = { ExternalRenderer };

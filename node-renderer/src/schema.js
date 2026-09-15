'use strict';
/*
 * Scene JSON schema — the ONLY contract between the LLM and the renderer.
 *
 * The LLM never emits code. It emits a JSON object shaped like:
 *   {
 *     "aspectRatio": "9:16",
 *     "fps": 30,
 *     "theme": { "palette": "midnight", "font": "Inter" },
 *     "scenes": [
 *        { "template": "TitleIntro", "durationInFrames": 90,
 *          "props": { "title": "...", "subtitle": "..." } },
 *        ...
 *     ]
 *   }
 *
 * Everything below validates + sanitizes that object so a malformed / hostile
 * LLM response can never reach React. Unknown fields are dropped, strings are
 * clamped, numbers are bounded, and out-of-range values are coerced to safe
 * defaults instead of throwing wherever reasonable.
 */

const TEMPLATES = {
  TitleIntro: {
    props: {
      title: { type: 'string', required: true, max: 120, default: 'Untitled' },
      subtitle: { type: 'string', max: 160, default: '' },
      eyebrow: { type: 'string', max: 40, default: '' },
    },
    minFrames: 45, maxFrames: 300, defaultFrames: 90,
  },
  TextReveal: {
    props: {
      // Lines revealed one-by-one. Also accepts `text` (auto-split).
      lines: { type: 'stringArray', maxItems: 8, maxItemLen: 90, default: [] },
      text: { type: 'string', max: 600, default: '' },
      revealBy: { type: 'enum', values: ['line', 'word'], default: 'line' },
      align: { type: 'enum', values: ['left', 'center'], default: 'center' },
    },
    minFrames: 60, maxFrames: 600, defaultFrames: 150,
  },
  QuoteCard: {
    props: {
      quote: { type: 'string', required: true, max: 400, default: 'Quote' },
      attribution: { type: 'string', max: 80, default: '' },
    },
    minFrames: 60, maxFrames: 360, defaultFrames: 120,
  },
  StatCounter: {
    props: {
      value: { type: 'number', min: -1e12, max: 1e12, default: 100 },
      prefix: { type: 'string', max: 8, default: '' },
      suffix: { type: 'string', max: 12, default: '' },
      label: { type: 'string', max: 120, default: '' },
      decimals: { type: 'int', min: 0, max: 4, default: 0 },
    },
    minFrames: 45, maxFrames: 300, defaultFrames: 105,
  },
  BulletList: {
    props: {
      heading: { type: 'string', max: 100, default: '' },
      items: { type: 'stringArray', maxItems: 6, maxItemLen: 100, required: true, default: ['Item'] },
    },
    minFrames: 75, maxFrames: 600, defaultFrames: 180,
  },
};

const PALETTES = {
  midnight: { bg: ['#0f172a', '#1e293b'], fg: '#f8fafc', accent: '#38bdf8' },
  sunset: { bg: ['#7c2d12', '#b91c1c'], fg: '#fff7ed', accent: '#fbbf24' },
  forest: { bg: ['#052e16', '#166534'], fg: '#f0fdf4', accent: '#4ade80' },
  grape: { bg: ['#3b0764', '#7e22ce'], fg: '#faf5ff', accent: '#e879f9' },
  mono: { bg: ['#0a0a0a', '#262626'], fg: '#fafafa', accent: '#a3a3a3' },
  ocean: { bg: ['#082f49', '#0369a1'], fg: '#f0f9ff', accent: '#22d3ee' },
  candy: { bg: ['#831843', '#db2777'], fg: '#fff1f2', accent: '#fda4af' },
};

const FONTS = ['Inter', 'Georgia', 'Arial', 'Courier New', 'Verdana', 'Trebuchet MS'];

const ASPECT_RATIOS = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
};

const LIMITS = {
  maxScenes: 12,
  minFps: 24,
  maxFps: 60,
  maxTotalFrames: 60 * 60, // 60s @60fps hard cap
};

// ---- primitive sanitizers -------------------------------------------------

function clampStr(v, max) {
  if (typeof v !== 'string') {
    if (v === null || v === undefined) return '';
    v = String(v);
  }
  // Strip control chars that could break rendering / injection into markup.
  v = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  if (v.length > max) v = v.slice(0, max);
  return v;
}

function clampNum(v, min, max, def) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function coerceProp(spec, raw) {
  switch (spec.type) {
    case 'string':
      return clampStr(raw ?? spec.default, spec.max);
    case 'number':
      return clampNum(raw ?? spec.default, spec.min, spec.max, spec.default);
    case 'int':
      return Math.round(clampNum(raw ?? spec.default, spec.min, spec.max, spec.default));
    case 'enum':
      return spec.values.includes(raw) ? raw : spec.default;
    case 'stringArray': {
      let arr = Array.isArray(raw) ? raw : [];
      arr = arr
        .map((x) => clampStr(x, spec.maxItemLen))
        .filter((x) => x.length > 0)
        .slice(0, spec.maxItems);
      return arr;
    }
    default:
      return spec.default;
  }
}

// ---- scene / document sanitizers -----------------------------------------

function sanitizeScene(scene, warnings) {
  if (!scene || typeof scene !== 'object') return null;
  let templateName = scene.template;
  if (!TEMPLATES[templateName]) {
    warnings.push(`Unknown template "${templateName}" → replaced with TextReveal`);
    templateName = 'TextReveal';
  }
  const tpl = TEMPLATES[templateName];
  const props = {};
  const rawProps = (scene.props && typeof scene.props === 'object') ? scene.props : {};

  for (const [key, spec] of Object.entries(tpl.props)) {
    props[key] = coerceProp(spec, rawProps[key]);
  }

  // Template-specific post-processing.
  if (templateName === 'TextReveal' && props.lines.length === 0 && props.text) {
    props.lines = props.text
      .split(/\n|(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
  }
  if (templateName === 'TextReveal') delete props.text;

  // Enforce required non-empty content.
  for (const [key, spec] of Object.entries(tpl.props)) {
    if (spec.required) {
      const val = props[key];
      const empty = (spec.type === 'stringArray') ? val.length === 0 : !val;
      if (empty) {
        if (spec.type === 'stringArray') props[key] = Array.isArray(spec.default) ? [...spec.default] : ['—'];
        else props[key] = spec.default || '—';
        warnings.push(`Scene "${templateName}" missing required "${key}" → default used`);
      }
    }
  }

  let durationInFrames = Math.round(
    clampNum(scene.durationInFrames, tpl.minFrames, tpl.maxFrames, tpl.defaultFrames)
  );

  return { template: templateName, durationInFrames, props };
}

/**
 * Validate + sanitize a raw scene document (from the LLM or a client).
 * Never throws for content problems — returns { ok, doc, warnings, error }.
 */
function sanitizeDocument(raw) {
  const warnings = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Scene document is not an object', warnings };
  }

  // aspect ratio
  let aspectRatio = raw.aspectRatio;
  if (!ASPECT_RATIOS[aspectRatio]) {
    if (aspectRatio) warnings.push(`Unknown aspectRatio "${aspectRatio}" → 9:16`);
    aspectRatio = '9:16';
  }
  const { width, height } = ASPECT_RATIOS[aspectRatio];

  const fps = Math.round(clampNum(raw.fps, LIMITS.minFps, LIMITS.maxFps, 30));

  // theme
  const rawTheme = (raw.theme && typeof raw.theme === 'object') ? raw.theme : {};
  let palette = rawTheme.palette;
  if (!PALETTES[palette]) {
    if (palette) warnings.push(`Unknown palette "${palette}" → midnight`);
    palette = 'midnight';
  }
  let font = rawTheme.font;
  if (!FONTS.includes(font)) {
    if (font) warnings.push(`Unknown font "${font}" → Inter`);
    font = 'Inter';
  }
  const backgroundImage = typeof rawTheme.backgroundImage === 'string' &&
    /^https:\/\/[^\s"'<>]+$/i.test(rawTheme.backgroundImage)
    ? rawTheme.backgroundImage : '';

  const theme = { palette, font, backgroundImage, colors: PALETTES[palette] };

  // scenes
  let scenesRaw = Array.isArray(raw.scenes) ? raw.scenes : [];
  if (scenesRaw.length === 0) {
    return { ok: false, error: 'Scene document has no scenes', warnings };
  }
  if (scenesRaw.length > LIMITS.maxScenes) {
    warnings.push(`Too many scenes (${scenesRaw.length}) → truncated to ${LIMITS.maxScenes}`);
    scenesRaw = scenesRaw.slice(0, LIMITS.maxScenes);
  }

  const scenes = [];
  for (const s of scenesRaw) {
    const clean = sanitizeScene(s, warnings);
    if (clean) scenes.push(clean);
  }
  if (scenes.length === 0) {
    return { ok: false, error: 'No valid scenes after sanitization', warnings };
  }

  // total duration cap
  let total = scenes.reduce((a, s) => a + s.durationInFrames, 0);
  if (total > LIMITS.maxTotalFrames) {
    warnings.push(`Total duration exceeded cap → scenes trimmed`);
    let running = 0;
    const kept = [];
    for (const s of scenes) {
      if (running + s.durationInFrames > LIMITS.maxTotalFrames) break;
      running += s.durationInFrames;
      kept.push(s);
    }
    scenes.length = 0;
    scenes.push(...(kept.length ? kept : [scenes[0]]));
    total = running;
  }

  const title = clampStr(raw.title || scenes[0]?.props?.title || 'video', 80) || 'video';

  const doc = {
    title,
    aspectRatio,
    width,
    height,
    fps,
    theme,
    scenes,
    durationInFrames: scenes.reduce((a, s) => a + s.durationInFrames, 0),
  };

  return { ok: true, doc, warnings };
}

module.exports = {
  TEMPLATES,
  PALETTES,
  FONTS,
  ASPECT_RATIOS,
  LIMITS,
  sanitizeDocument,
  sanitizeScene,
  clampStr,
  clampNum,
};

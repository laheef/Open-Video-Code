'use strict';
const { TEMPLATES, PALETTES, FONTS, ASPECT_RATIOS } = require('../schema');

function buildSchemaDescription() {
  const templateDocs = Object.entries(TEMPLATES).map(([name, def]) => {
    const props = Object.entries(def.props).map(([k, s]) => {
      let t = s.type;
      if (s.type === 'enum') t = `one of [${s.values.join(', ')}]`;
      const req = s.required ? ' (required)' : '';
      return `      - ${k}: ${t}${req}`;
    }).join('\n');
    return `  • ${name} (durationInFrames ${def.minFrames}-${def.maxFrames}, default ${def.defaultFrames}):\n${props}`;
  }).join('\n');

  return `TEMPLATES:\n${templateDocs}

THEME:
  - palette: one of [${Object.keys(PALETTES).join(', ')}]
  - font: one of [${FONTS.join(', ')}]

ASPECT RATIOS: ${Object.keys(ASPECT_RATIOS).join(', ')}
FPS: 24-60 (use 30 unless told otherwise)`;
}

function systemPrompt() {
  return `You are a short-form video director. You convert a user's free-form script or idea into a STRUCTURED JSON scene document for a code-based video renderer (Remotion). You do NOT write code. You ONLY output JSON.

The video is vertical short-form content (Reels/Shorts/TikTok style): punchy, high-contrast, text-on-screen motion graphics.

${buildSchemaDescription()}

OUTPUT FORMAT — return ONLY this JSON object, no markdown, no commentary:
{
  "title": "short slug-like title",
  "aspectRatio": "9:16",
  "fps": 30,
  "theme": { "palette": "midnight", "font": "Inter" },
  "scenes": [
    { "template": "TitleIntro", "durationInFrames": 90, "props": { "title": "...", "subtitle": "...", "eyebrow": "..." } },
    { "template": "TextReveal", "durationInFrames": 120, "props": { "lines": ["line 1", "line 2"], "revealBy": "line" } }
  ]
}

RULES:
- Break the script into 2-6 scenes that flow well as a short video.
- Open with a TitleIntro or a strong TextReveal hook. Consider closing on a QuoteCard or a StatCounter / call-to-action.
- Keep on-screen text SHORT — a few words per line. Never paste long paragraphs into one prop.
- Use StatCounter when the script contains a notable number/percentage/metric.
- Use BulletList when the script lists steps, tips, or reasons.
- Choose durationInFrames so the whole video roughly matches any requested total duration (frames = seconds × fps).
- Pick a palette + font that fit the tone.
- Output MUST be valid JSON and MUST match the schema. No trailing commas. No extra keys.`;
}

function userPrompt(script, options = {}) {
  const parts = [`SCRIPT / IDEA:\n${script}`];
  const wants = [];
  if (options.aspectRatio) wants.push(`aspect ratio: ${options.aspectRatio}`);
  if (options.durationSec) wants.push(`target total duration: ~${options.durationSec} seconds`);
  if (options.style) wants.push(`style/tone: ${options.style}`);
  if (options.palette) wants.push(`preferred palette: ${options.palette}`);
  if (options.font) wants.push(`preferred font: ${options.font}`);
  if (wants.length) parts.push(`\nPREFERENCES:\n- ${wants.join('\n- ')}`);
  parts.push('\nReturn ONLY the JSON scene document.');
  return parts.join('\n');
}

module.exports = { systemPrompt, userPrompt, buildSchemaDescription };

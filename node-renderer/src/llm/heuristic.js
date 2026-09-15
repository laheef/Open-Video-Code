'use strict';
/*
 * Offline heuristic "director" — a deterministic script→scene-document parser.
 *
 * This is the fallback when no LLM API key is configured (or when a locked-down
 * host can't reach any provider). It is intentionally rule-based, not smart,
 * but it produces a valid, watchable multi-scene video from arbitrary text so
 * the whole pipeline is runnable end-to-end without external dependencies.
 */

const PALETTES = ['midnight', 'ocean', 'grape', 'sunset', 'forest', 'candy', 'mono'];

function pickPalette(text, requested) {
  if (requested && PALETTES.includes(requested)) return requested;
  const t = text.toLowerCase();
  if (/\b(calm|ocean|water|sea|cool|tech|cloud)\b/.test(t)) return 'ocean';
  if (/\b(energy|bold|fire|hot|sale|urgent|now)\b/.test(t)) return 'sunset';
  if (/\b(nature|growth|green|eco|health|money|finance)\b/.test(t)) return 'forest';
  if (/\b(luxury|creative|art|magic|dream)\b/.test(t)) return 'grape';
  if (/\b(love|beauty|fashion|cute|fun)\b/.test(t)) return 'candy';
  if (/\b(minimal|clean|simple|mono|serious)\b/.test(t)) return 'mono';
  return 'midnight';
}

function splitSentences(text) {
  return text
    .replace(/\r/g, '')
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function firstNumberStat(text) {
  // Find a salient number like "90%", "$1,200", "3x", "10,000".
  const m = text.match(/(\$)?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(%|x|X|k|K|M|m|\+)?/);
  if (!m) return null;
  const prefix = m[1] || '';
  let value = parseFloat(m[2].replace(/,/g, ''));
  let suffix = m[3] || '';
  if (suffix === 'k' || suffix === 'K') { value *= 1000; suffix = ''; }
  if (suffix === 'M' || suffix === 'm') { value *= 1000000; suffix = ''; }
  if (!Number.isFinite(value)) return null;
  return { value, prefix, suffix };
}

function looksLikeList(sentences) {
  // Bullet markers or several short imperative lines.
  const bulletish = sentences.filter((s) => /^(\d+[.)]|[-•*])\s+/.test(s));
  if (bulletish.length >= 2) return bulletish.map((s) => s.replace(/^(\d+[.)]|[-•*])\s+/, ''));
  return null;
}

function chunkToLines(sentence, maxWords = 5) {
  const words = sentence.split(/\s+/).filter(Boolean);
  const lines = [];
  for (let i = 0; i < words.length; i += maxWords) {
    lines.push(words.slice(i, i + maxWords).join(' '));
  }
  return lines.slice(0, 4);
}

function generate(script, options = {}) {
  const text = String(script || '').trim() || 'Your video';
  const sentences = splitSentences(text);
  const fps = 30;
  const aspectRatio = options.aspectRatio || '9:16';
  const palette = pickPalette(text, options.palette);
  const font = options.font || 'Inter';

  const scenes = [];

  // 1) Title intro from the first sentence / a derived title.
  const firstSentence = sentences[0] || text;
  const titleWords = firstSentence.split(/\s+/).slice(0, 7).join(' ');
  scenes.push({
    template: 'TitleIntro',
    durationInFrames: 75,
    props: {
      eyebrow: (options.style || '').slice(0, 24) || '',
      title: titleWords.replace(/[.!?]+$/, ''),
      subtitle: sentences[1] ? sentences[1].slice(0, 120) : '',
    },
  });

  // 2) List scene if the script reads like a list.
  const listItems = looksLikeList(sentences);
  if (listItems) {
    scenes.push({
      template: 'BulletList',
      durationInFrames: Math.min(300, 60 + listItems.length * 30),
      props: { heading: 'Key points', items: listItems.slice(0, 6) },
    });
  } else {
    // 2b) TextReveal scenes for the body sentences.
    const body = sentences.slice(1).length ? sentences.slice(1) : sentences;
    const bodyToUse = body.slice(0, 3);
    for (const s of bodyToUse) {
      scenes.push({
        template: 'TextReveal',
        durationInFrames: 90,
        props: { lines: chunkToLines(s), revealBy: 'line' },
      });
    }
  }

  // 3) Stat scene if a strong number exists.
  const stat = firstNumberStat(text);
  if (stat) {
    scenes.push({
      template: 'StatCounter',
      durationInFrames: 90,
      props: {
        value: stat.value,
        prefix: stat.prefix,
        suffix: stat.suffix,
        label: 'By the numbers',
        decimals: Number.isInteger(stat.value) ? 0 : 1,
      },
    });
  }

  // 4) Closing quote / CTA from the last sentence.
  const last = sentences[sentences.length - 1] || text;
  scenes.push({
    template: 'QuoteCard',
    durationInFrames: 90,
    props: { quote: last.slice(0, 200), attribution: '' },
  });

  // Respect a target duration by scaling frames.
  if (options.durationSec) {
    const targetFrames = Math.round(options.durationSec * fps);
    const current = scenes.reduce((a, s) => a + s.durationInFrames, 0);
    if (current > 0) {
      const factor = targetFrames / current;
      for (const s of scenes) s.durationInFrames = Math.round(s.durationInFrames * factor);
    }
  }

  return {
    title: titleWords.slice(0, 60) || 'video',
    aspectRatio,
    fps,
    theme: { palette, font },
    scenes,
  };
}

module.exports = { generate };

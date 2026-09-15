# Open-Video-Code — AI Script-to-Video Generator

Turn a free-form **script/prompt** into a short-form, code-based motion-graphics
**MP4** (Reels/Shorts/TikTok style) using [Remotion](https://remotion.dev) — no
diffusion video model. An LLM only maps the script into structured **scene JSON**;
a fixed library of React composition templates does the rendering.

## Repository layout

| Path | What it is |
| --- | --- |
| [`node-renderer/`](./node-renderer) | **Standalone Node.js app** (Express + Remotion). Orchestration + rendering, jobs table, LLM step, demo UI, HTTP API. |
| [`php-integration/`](./php-integration) | Drop-in PHP files so an existing PHP app can use the renderer over internal HTTP and attach results to a post. |

## How it works

```
Script ─► POST /generate ─► [LLM → scene JSON → sanitize → Remotion renderMedia()] ─► MP4
                              (async background job; poll GET /status/:id)
PHP app ──internal HTTP──► Node app ──► finished MP4 ──► existing media pipeline
```

- **Two-stage generation.** The LLM emits JSON, never code. Output is validated
  and sanitized before it touches React — safe and provider-agnostic (Groq /
  OpenAI-compatible / Gemini, with an offline heuristic fallback so it runs with
  no API key).
- **5 composition templates:** TitleIntro, TextReveal, QuoteCard, StatCounter,
  BulletList — each parametrized by props + theme.
- **Async rendering** with a SQLite jobs table, retries, and restart recovery.

## Feasibility spike (done first)

The required hosting spike passed: Remotion renders a real MP4 on the target Node
slot in well under the RAM budget. FFmpeg is bundled by Remotion, SQLite is
built into Node, and Chromium is obtained via npm even on a locked-down host with
blocked package mirrors. Full report: [`node-renderer/FEASIBILITY.md`](./node-renderer/FEASIBILITY.md).

A one-flag fallback (`RENDER_TARGET=external`) offloads only the render call to a
VPS or Remotion Lambda if a host ever can't run Chromium — the rest is unchanged.

## Quick start

```bash
cd node-renderer
npm install
npm start        # http://localhost:3000  — demo UI + API
npm test         # sanitizer + heuristic checks
```

Then open `/`, enter a script, and watch it render. See each subproject's README
for configuration, the API contract, and PHP wiring.

## Licensing

Remotion is free for teams ≤3 people. As an automated prompt-to-video feature it
falls under Remotion's **Automators** license (**$0.01/render, $100/mo minimum**).
Budget for it before shipping to real users.

# Script-to-Video Renderer (Node + Remotion)

A **standalone Node.js app** that turns a free-form script into a short-form
motion-graphics MP4 (Reels/Shorts/TikTok style) — generated entirely **from
code** via [Remotion](https://remotion.dev), not a diffusion video model.

It is designed to be one of the Node app slots on your hosting plan. The PHP app
talks to it purely over internal HTTP (see [`../php-integration`](../php-integration)).

> **Feasibility first.** The rendering spike passed on the target host — see
> [`FEASIBILITY.md`](./FEASIBILITY.md). Local rendering is the default; an
> external render target is wired in as a one-flag fallback.

## Architecture

```
 User script ──► POST /generate ──► job (pending)         SQLite jobs table
                       │                                   (node:sqlite, no deps)
                       ▼
             ┌──────────────────── async worker ────────────────────┐
             │ 1. LLM: script → scene JSON   (src/llm)               │
             │    provider auto-select; offline heuristic fallback   │
             │ 2. sanitizeDocument()         (src/schema.js)         │
             │    validate + clamp + drop unknowns (never trust LLM) │
             │ 3. renderMedia()              (src/renderer/local.js) │
             │    scene JSON → Remotion compositions → MP4           │
             └──────────────────────────────────────────────────────┘
                       │
   GET /status/:id ◄───┘   GET /video/:id  (streams MP4, range-enabled)
```

### Two-stage generation (why)

The LLM never emits code. It only maps the user's script into a strict **scene
JSON** schema (choose a template, fill text/timing). That JSON is validated and
sanitized server-side, then fed as **props** into a fixed library of pre-built
Remotion composition templates. This removes the security/reliability risk of
executing model-generated code and lets you swap LLM providers freely — the
contract is JSON, not code.

## Composition templates (`remotion/compositions`)

| Template | Purpose | Key props |
| --- | --- | --- |
| `TitleIntro` | Title + subtitle intro card | `title`, `subtitle`, `eyebrow` |
| `TextReveal` | Line/word-by-word animated captions | `lines[]`, `revealBy`, `align` |
| `QuoteCard` | Centered quote + attribution | `quote`, `attribution` |
| `StatCounter` | Big number animating up | `value`, `prefix`, `suffix`, `label`, `decimals` |
| `BulletList` | Sequential list reveal | `heading`, `items[]` |

All support a shared `theme` (`palette`, `font`, optional `backgroundImage`) and
per-scene `durationInFrames`. Aspect ratio, fps, and total duration come from the
scene document, so one composition renders any format/length.

## API

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/generate` | `{script, aspectRatio?, durationSec?, style?, palette?, font?}` → `202` job |
| `GET` | `/status/:id` | Job status: `pending`/`rendering`/`done`/`failed` + warnings/error |
| `GET` | `/video/:id` | Streams the MP4 (range requests); `?download=1` forces download |
| `GET` | `/meta` | Templates, palettes, fonts, aspect ratios, active provider/target |
| `POST` | `/preview-scene` | Sanitize a raw scene doc (or run LLM) without rendering — debugging |
| `GET` | `/jobs` | Recent jobs (demo UI) |
| `GET` | `/health` | Liveness |

`POST /generate` and `/preview-scene` honor an optional `Authorization: Bearer
<NODE_RENDER_API_TOKEN>` shared secret (empty = open).

## Run

```bash
npm install
cp .env.example .env   # optional; sensible defaults otherwise
npm start              # http://0.0.0.0:3000  (demo UI + API)
```

A demo web UI is served at `/` so the whole thing is runnable without the PHP
app. To iterate on the compositions visually: `npm run preview` (Remotion Studio).

## Configuration (env)

See [`.env.example`](./.env.example). Highlights:

- `RENDER_TARGET=local|external` — local `renderMedia()` (default) vs. remote renderer.
- `EXTERNAL_RENDER_URL` / `EXTERNAL_RENDER_TOKEN` — used when `external`.
- `LLM_PROVIDER=auto` — picks Groq → OpenAI → Gemini by whichever key is set;
  falls back to a deterministic **offline heuristic** parser if none. Set
  `GROQ_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` to use a real model.
- `CHROMIUM_PATH` — override browser auto-discovery (e.g. a system chrome on a VPS).
- `DATA_DIR` — where the SQLite DB and rendered MP4s live (git-ignored).

## Error handling

- **Malformed LLM JSON** → robust extraction (strips fences, grabs outer `{}`);
  on total failure it falls back to the heuristic parser so a video still ships,
  and records a warning on the job.
- **Invalid/hostile scene fields** → `sanitizeDocument()` clamps strings/numbers,
  drops unknown keys, coerces bad templates, and enforces duration caps.
- **Render failure** → retried up to `MAX_RENDER_RETRIES`, then job → `failed`
  with the error surfaced to the UI (with a Retry button).
- **Restart mid-render** → `pending`/`rendering` jobs are re-queued on boot.

## Licensing

Remotion is free for ≤3-person teams. As an automated prompt-to-video feature it
matches Remotion's **Automators** license (**$0.01/render, $100/mo min**). Budget
for it before serving real users. See `FEASIBILITY.md`.

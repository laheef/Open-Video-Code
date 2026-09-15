# Hosting Feasibility Spike — Result

> Deliverable #1: run the rendering spike **before** building the rest, and
> report whether Remotion can render on the target Node slot or needs an
> external render target.

## TL;DR

**Local rendering WORKS on the Node slot.** A real 15–20s vertical MP4 renders
reliably in well under the memory budget. Everything (orchestration **and**
rendering) lives in the single standalone Node app.

The one real-world caveat from the prompt — *"tight limits, no root to install
Chromium deps, blocked package mirrors"* — was reproduced exactly here, and is
solved without any system installs. See "Chromium on a locked-down host" below.

## What was tested

| Item | Result |
| --- | --- |
| Node.js | v22.x ✅ |
| Remotion install (`remotion`, `@remotion/bundler`, `@remotion/renderer`) | ✅ from npm |
| FFmpeg | ✅ **bundled inside** `@remotion/renderer` — no system FFmpeg needed |
| Headless Chromium | ✅ obtained via npm (see below) |
| Job storage | ✅ Node built-in `node:sqlite` — no native module download |
| Single test render (`renderMedia()`) | ✅ valid H.264 MP4 |

### Measured render times (this host: 2 vCPU, 3.8 GB RAM, concurrency=1)

| Video | Result |
| --- | --- |
| 20s @ 1080×1920 (single composition, spike) | ~54s render (+~9s one-time bundle) |
| 15s @ 1080×1920 (6-scene generated video) | ~36s render |

Memory stayed comfortably under the available RAM throughout. Bundling the
Remotion project is a one-time ~2–9s cost that is cached for the process
lifetime, so subsequent renders pay only the render cost.

## Chromium on a locked-down host

During the spike, outbound internet was restricted to the npm registry only —
**Remotion's Chromium CDN and the OS package mirrors were both unreachable**
(`ECONNRESET` / connection refused). This is precisely the failure mode the
brief warned about on cheap shared hosting.

**Solution (no root, no apt, npm-only):**

1. `@sparticuz/chromium` ships a compressed Chromium binary **inside the npm
   package** (plus the NSS shared libraries Chromium needs). Installing it
   requires only the npm registry.
2. On boot, `src/chromium.js` resolves a browser in priority order:
   `CHROMIUM_PATH` → system chrome on `PATH` → Remotion's downloaded shell →
   **`@sparticuz/chromium`** (the npm-only fallback that works here).
3. It extracts the bundled `libnss3`/`libnspr4`/etc. and prepends them to
   `LD_LIBRARY_PATH` before launching, so the binary loads on a non–Amazon-Linux
   distro without installing anything system-wide.

If you deploy to a host where you *can* install a system Chromium (a VPS), just
set `CHROMIUM_PATH=/usr/bin/chromium` and the fallback is never used.

## Decision

Per the brief's decision tree:

> **If the test render works reliably:** keep everything (orchestration +
> rendering) in that single Node app — no other infra needed.

That is the outcome. The app runs `renderMedia()` **locally** by default
(`RENDER_TARGET=local`).

### Escape hatch already wired in

If a future host genuinely cannot run Chromium (e.g. hard RAM caps, no way to
obtain any browser binary), flip `RENDER_TARGET=external` and set
`EXTERNAL_RENDER_URL`. The orchestration app is unchanged — only the render call
target moves to a VPS or Remotion Lambda/Cloud Run. See
`src/renderer/external.js` for the contract. This satisfies the brief's fallback
requirement without any rewrite.

## Licensing note (carry into production budgeting)

Remotion is free for individuals and companies of up to 3 people. Shipped as an
automated prompt-to-video feature that renders for many users, it matches
Remotion's **"Automators"** company-license use case: **$0.01/render, $100/month
minimum**. Budget ~$100/month once this serves real users. (Not required during
development.)

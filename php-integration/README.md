# PHP Integration (Script-to-Video)

Drop-in PHP files that let your **existing PHP app** use the standalone Node
renderer over internal HTTP. PHP never runs Remotion — it only calls the API.

> These files are framework-agnostic plain PHP so they read clearly. Adapt the
> layout/auth/CSRF and the media hand-off to your actual stack (Laravel, etc.).

## Files

| File | Role |
| --- | --- |
| `src/ScriptVideoClient.php` | HTTP client: `generate()`, `status()`, `videoUrl()`, `downloadVideo()` |
| `public/generate.php` | The submission form + POST handler → creates a job, redirects to result |
| `public/result.php` | Polls status (via `status.php`) and shows the finished video |
| `public/status.php` | Same-origin JSON proxy the browser polls (keeps Node private) |
| `public/video.php` | Streams the MP4 through PHP (range-enabled) so Node stays internal |
| `public/attach_to_post.php` | Downloads the MP4 and hands it to your media-upload pipeline |

## Flow

```
generate.php  ──POST /generate──►  Node app          (returns job id)
     │  redirect
     ▼
result.php  ──poll──►  status.php  ──GET /status/:id──►  Node app
     │  when done
     ▼
video.php   ──GET /video/:id──►  Node app             (streamed to browser)
     │  "Attach to a Post"
     ▼
attach_to_post.php  ──GET /video/:id──►  Node app  ──►  YOUR media pipeline
```

## Configure

Set the internal address of the Node app (and the optional shared secret):

```bash
export NODE_RENDER_BASE_URL="http://127.0.0.1:3000"   # same box, or a VPS/private IP
export NODE_RENDER_API_TOKEN=""                        # must match the Node app's token
```

## The one place you customize

`attach_to_post.php` has a clearly marked section that currently simulates the
media move. Replace it with your real pipeline call — e.g. `MediaService::
storeVideo($tmp, [...])` — after which the generated MP4 is indistinguishable
from any user-uploaded video and flows through your normal validation,
thumbnailing, S3 upload, and post-composer attach.

## Why proxy through PHP?

`status.php` and `video.php` proxy to the Node service so:

- the Node app can live on a **private/internal** address (not exposed publicly),
- the shared-secret token never reaches the browser,
- the browser always talks same-origin (no CORS/mixed-content issues).

For high traffic, copy the file to your CDN/S3 once in `attach_to_post.php` and
serve posts from there instead of streaming through `video.php` every time.

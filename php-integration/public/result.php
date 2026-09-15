<?php
/**
 * result.php — polls the job and shows the finished video, plus an
 * "Attach to a Post" button that hands the MP4 into the existing media flow.
 */
$id = $_GET['id'] ?? '';
if ($id === '') { header('Location: generate.php'); exit; }
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Your video is rendering…</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#1f2937}
    .status{display:flex;align-items:center;gap:12px;font-size:16px}
    .spin{width:20px;height:20px;border:3px solid #e5e7eb;border-top-color:#4f46e5;border-radius:50%;animation:s .8s linear infinite}
    @keyframes s{to{transform:rotate(360deg)}}
    video{width:100%;border-radius:12px;background:#000;margin-top:16px}
    .actions{display:flex;gap:10px;margin-top:12px}
    a.btn,button.btn{padding:10px 16px;border-radius:8px;border:1px solid #cbd5e1;background:#f8fafc;text-decoration:none;color:#1f2937;cursor:pointer}
    .err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:10px;border-radius:8px}
    .warn{background:#fffbeb;color:#92400e;border:1px solid #fde68a;padding:10px;border-radius:8px;margin-top:10px;font-size:13px}
  </style>
</head>
<body>
  <h1>Rendering your video</h1>
  <div id="status" class="status"><div class="spin"></div><span>Starting…</span></div>
  <div id="warnings"></div>
  <div id="output"></div>

  <script>
    const id = <?= json_encode($id) ?>;
    const statusEl = document.getElementById('status');
    const outEl = document.getElementById('output');
    const warnEl = document.getElementById('warnings');

    async function poll() {
      try {
        const r = await fetch('status.php?id=' + encodeURIComponent(id));
        const job = await r.json();
        if (job.error) { statusEl.innerHTML = '<div class="err">' + job.error + '</div>'; return; }

        const labels = {pending:'Generating scene JSON…', rendering:'Rendering video…', done:'Done!', failed:'Failed'};
        statusEl.innerHTML = (job.status==='pending'||job.status==='rendering' ? '<div class="spin"></div>' : '')
          + '<span>' + (labels[job.status]||job.status) + '</span>';

        if (job.warnings && job.warnings.length) {
          warnEl.innerHTML = '<div class="warn">⚠ ' + job.warnings.join('<br>') + '</div>';
        }

        if (job.status === 'done') {
          outEl.innerHTML =
            '<video controls playsinline src="' + job.videoUrl + '"></video>' +
            '<div class="actions">' +
            '<a class="btn" href="video.php?id=' + encodeURIComponent(id) + '&download=1">⬇ Download MP4</a>' +
            '<form method="post" action="attach_to_post.php" style="display:inline">' +
            '<input type="hidden" name="id" value="' + id + '">' +
            '<button class="btn" type="submit">📎 Attach to a Post</button>' +
            '</form></div>';
          return;
        }
        if (job.status === 'failed') {
          outEl.innerHTML = '<div class="err">' + (job.error || 'Render failed.') +
            ' <a href="generate.php">Try again</a></div>';
          return;
        }
        setTimeout(poll, 1500);
      } catch (e) {
        statusEl.innerHTML = '<div class="err">Lost connection. Retrying…</div>';
        setTimeout(poll, 3000);
      }
    }
    poll();
  </script>
</body>
</html>

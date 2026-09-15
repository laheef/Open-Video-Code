<?php
/**
 * generate.php — the user-facing form + submit handler (PHP side).
 *
 * Flow:
 *   1. User fills the form (script + style/duration/aspect ratio) and submits.
 *   2. We POST to the Node app's /generate and get a job id back.
 *   3. We redirect to result.php?id=... which polls status and shows the video.
 *
 * Drop this into your existing app and adapt the layout/auth to your framework.
 */

require __DIR__ . '/../src/ScriptVideoClient.php';

use App\ScriptVideo\ScriptVideoClient;

$error = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // TODO: add your CSRF check + auth here.
    $script = trim($_POST['script'] ?? '');
    if ($script === '') {
        $error = 'Please enter a script.';
    } else {
        $opts = [
            'aspectRatio' => $_POST['aspectRatio'] ?? '9:16',
            'durationSec' => $_POST['durationSec'] !== '' ? (int)$_POST['durationSec'] : null,
            'style'       => $_POST['style'] ?? '',
            'palette'     => $_POST['palette'] ?? '',
            'font'        => $_POST['font'] ?? '',
        ];
        try {
            $client = new ScriptVideoClient();
            $job = $client->generate($script, array_filter($opts, fn($v) => $v !== null && $v !== ''));
            header('Location: result.php?id=' . urlencode($job['id']));
            exit;
        } catch (\Throwable $e) {
            $error = 'Could not start render: ' . $e->getMessage();
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Generate a Video from a Script</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#1f2937}
    label{display:block;margin:14px 0 6px;font-weight:600}
    textarea,input,select{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px}
    .row{display:flex;gap:12px}.row>div{flex:1}
    button{margin-top:18px;padding:12px 20px;background:#4f46e5;color:#fff;border:0;border-radius:8px;font-size:15px;cursor:pointer}
    .err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:10px;border-radius:8px}
  </style>
</head>
<body>
  <h1>AI Script → Video</h1>
  <p>Describe your video. We'll turn it into an animated short and render an MP4 you can attach to a post.</p>

  <?php if ($error): ?><div class="err"><?= htmlspecialchars($error) ?></div><?php endif; ?>

  <form method="post">
    <label for="script">Script / idea</label>
    <textarea id="script" name="script" rows="6" required placeholder="e.g. 3 reasons to start journaling today..."><?= htmlspecialchars($_POST['script'] ?? '') ?></textarea>

    <div class="row">
      <div>
        <label for="aspectRatio">Aspect ratio</label>
        <select id="aspectRatio" name="aspectRatio">
          <option value="9:16">9:16 (Reels/Shorts)</option>
          <option value="1:1">1:1 (Square)</option>
          <option value="4:5">4:5 (Feed)</option>
          <option value="16:9">16:9 (Landscape)</option>
        </select>
      </div>
      <div>
        <label for="durationSec">Duration</label>
        <select id="durationSec" name="durationSec">
          <option value="">Auto</option>
          <option value="10">10s</option>
          <option value="15" selected>15s</option>
          <option value="20">20s</option>
          <option value="30">30s</option>
        </select>
      </div>
    </div>

    <label for="style">Style / tone (optional)</label>
    <input id="style" name="style" type="text" placeholder="energetic, minimal, motivational">

    <button type="submit">Generate video</button>
  </form>
</body>
</html>

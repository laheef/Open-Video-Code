<?php
/**
 * attach_to_post.php — pulls the finished MP4 out of the Node renderer and
 * hands it into your EXISTING media-upload pipeline, exactly like a normal
 * uploaded video. This is the integration point for "Create a Post".
 *
 * Replace the marked section with your real media pipeline call. The important
 * part is: once the file is local, it is just an ordinary video upload.
 */

require __DIR__ . '/../src/ScriptVideoClient.php';

use App\ScriptVideo\ScriptVideoClient;

$id = $_POST['id'] ?? $_GET['id'] ?? '';
if ($id === '') { http_response_code(400); exit('missing id'); }

$client = new ScriptVideoClient();

// 1) Confirm the job is actually done.
$job = $client->status($id);
if (($job['status'] ?? '') !== 'done') {
    http_response_code(409);
    exit('Video is not ready yet (status: ' . htmlspecialchars($job['status'] ?? 'unknown') . ')');
}

// 2) Download the MP4 into a temp file.
$tmp = sys_get_temp_dir() . '/script-video-' . preg_replace('/[^a-z0-9]/i', '', $id) . '.mp4';
$client->downloadVideo($id, $tmp);

// 3) ===== HAND OFF TO YOUR EXISTING MEDIA PIPELINE =====
// Everything below is a placeholder. Swap it for however your app currently
// ingests an uploaded video. The generated MP4 is now indistinguishable from a
// user upload, so it flows through validation, thumbnailing, S3, DB rows, etc.
//
// Example (pseudo):
//   $media = MediaService::storeVideo($tmp, [
//       'source'   => 'ai_script_video',
//       'mime'     => 'video/mp4',
//       'filename' => 'ai-video-' . $id . '.mp4',
//       'user_id'  => Auth::id(),
//   ]);
//   $post = Post::create(['user_id' => Auth::id(), 'media_id' => $media->id]);
//   header('Location: /posts/' . $post->id . '/edit');
//   exit;
//
// For this reference implementation we simulate a successful move.
$publicDir = __DIR__ . '/uploads';
@mkdir($publicDir, 0775, true);
$finalName = 'ai-video-' . preg_replace('/[^a-z0-9]/i', '', $id) . '.mp4';
$finalPath = $publicDir . '/' . $finalName;
rename($tmp, $finalPath);

// 4) Redirect into the post composer with the media pre-attached.
// header('Location: /create-post?media=' . urlencode($finalName));
?>
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Attached to Post</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px}video{width:100%;border-radius:12px;background:#000}</style>
</head><body>
  <h1>✓ Video attached to your post</h1>
  <p>The generated MP4 has entered the media pipeline like any other uploaded video.</p>
  <video controls src="uploads/<?= htmlspecialchars($finalName) ?>"></video>
  <p><em>Wire the redirect at the bottom of this file to your real "Create a Post" composer.</em></p>
</body></html>

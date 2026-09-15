<?php
/**
 * video.php — streams the finished MP4 to the browser through the PHP app.
 *
 * Keeps the internal Node service private. Supports HTTP range requests so the
 * <video> element can seek. For production with heavy traffic, prefer copying
 * the file into your CDN/S3 once (see attach_to_post.php) and serving from there.
 */

require __DIR__ . '/../src/ScriptVideoClient.php';

use App\ScriptVideo\ScriptVideoClient;

$id = $_GET['id'] ?? '';
if ($id === '') { http_response_code(400); exit('missing id'); }

$client   = new ScriptVideoClient();
$download  = isset($_GET['download']);
$upstream  = $client->videoUrl($id, $download);

// Forward Range header for seeking.
$range = $_SERVER['HTTP_RANGE'] ?? null;

$ch = curl_init($upstream);
curl_setopt_array($ch, [
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_HEADER         => false,
    CURLOPT_TIMEOUT        => 300,
    CURLOPT_HTTPHEADER     => $range ? ['Range: ' . $range] : [],
    CURLOPT_WRITEFUNCTION  => function ($ch, $data) {
        echo $data;
        return strlen($data);
    },
    CURLOPT_HEADERFUNCTION => function ($ch, $header) {
        // Pass through the important streaming headers.
        if (preg_match('/^(Content-Type|Content-Length|Content-Range|Accept-Ranges|Content-Disposition):/i', $header)) {
            header(trim($header));
        }
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $header, $m)) {
            http_response_code((int)$m[1]);
        }
        return strlen($header);
    },
]);
curl_exec($ch);
curl_close($ch);

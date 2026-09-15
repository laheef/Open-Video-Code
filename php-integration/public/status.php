<?php
/**
 * status.php — JSON proxy the browser polls for a job's progress.
 *
 * The browser calls THIS (same-origin PHP) rather than the Node app directly,
 * so the Node service can stay on a private/internal address and the shared
 * secret never reaches the client.
 */

require __DIR__ . '/../src/ScriptVideoClient.php';

use App\ScriptVideo\ScriptVideoClient;

header('Content-Type: application/json');

$id = $_GET['id'] ?? '';
if ($id === '') {
    http_response_code(400);
    echo json_encode(['error' => 'missing id']);
    exit;
}

try {
    $client = new ScriptVideoClient();
    $job = $client->status($id);

    // Rewrite the videoUrl so the browser fetches through OUR proxy, not the
    // internal Node address (which may be unreachable from the client).
    if (!empty($job['videoReady'])) {
        $job['videoUrl'] = 'video.php?id=' . urlencode($id);
    }
    echo json_encode($job);
} catch (\Throwable $e) {
    http_response_code(502);
    echo json_encode(['error' => $e->getMessage()]);
}

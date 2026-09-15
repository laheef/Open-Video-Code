<?php
/**
 * ScriptVideoClient — thin PHP HTTP client for the standalone Node renderer.
 *
 * The PHP app NEVER runs Remotion. It only talks to the Node service over
 * internal HTTP:
 *    - generate($script, $opts)  -> POST /generate   (returns job array w/ id)
 *    - status($id)               -> GET  /status/:id
 *    - videoUrl($id)             -> GET  /video/:id   (proxy/download target)
 *    - downloadVideo($id, $dest) -> save the finished MP4 to local/S3 storage
 *
 * Configure NODE_RENDER_BASE_URL to the internal address of the Node app,
 * e.g. http://127.0.0.1:3000 (same server) or http://10.0.0.5:3000 (VPS).
 */

namespace App\ScriptVideo;

class ScriptVideoClient
{
    private string $baseUrl;
    private ?string $apiToken;
    private int $timeout;

    public function __construct(?string $baseUrl = null, ?string $apiToken = null, int $timeout = 30)
    {
        $this->baseUrl  = rtrim($baseUrl ?? getenv('NODE_RENDER_BASE_URL') ?: 'http://127.0.0.1:3000', '/');
        $this->apiToken = $apiToken ?? (getenv('NODE_RENDER_API_TOKEN') ?: null);
        $this->timeout  = $timeout;
    }

    /**
     * Submit a script and enqueue a render job.
     *
     * @param string $script  Free-form user script / idea.
     * @param array  $opts     ['aspectRatio'=>'9:16','durationSec'=>15,'style'=>'','palette'=>'','font'=>'']
     * @return array           Decoded job payload (contains 'id', 'status', ...).
     * @throws \RuntimeException on transport / HTTP error.
     */
    public function generate(string $script, array $opts = []): array
    {
        $payload = array_merge(['script' => $script], $opts);
        return $this->request('POST', '/generate', $payload);
    }

    /** Poll a job's status. */
    public function status(string $id): array
    {
        return $this->request('GET', '/status/' . rawurlencode($id));
    }

    /** Public URL of the finished MP4 (inline stream). Append ?download=1 to force download. */
    public function videoUrl(string $id, bool $download = false): string
    {
        return $this->baseUrl . '/video/' . rawurlencode($id) . ($download ? '?download=1' : '');
    }

    /**
     * Stream the finished MP4 into local storage (or an S3 temp file) so it can
     * enter the existing media-upload pipeline like any other uploaded video.
     *
     * @return string Absolute path to the downloaded file.
     */
    public function downloadVideo(string $id, string $destPath): string
    {
        $ch = curl_init($this->videoUrl($id, true));
        $fp = fopen($destPath, 'wb');
        if ($fp === false) {
            throw new \RuntimeException("Cannot open $destPath for writing");
        }
        curl_setopt_array($ch, [
            CURLOPT_FILE           => $fp,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => 300,
            CURLOPT_HTTPHEADER     => $this->headers(false),
        ]);
        $ok   = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);
        fclose($fp);

        if ($ok === false || $code >= 400) {
            @unlink($destPath);
            throw new \RuntimeException("Video download failed (HTTP $code): $err");
        }
        return $destPath;
    }

    // ---- internals --------------------------------------------------------

    private function headers(bool $json = true): array
    {
        $h = [];
        if ($json) {
            $h[] = 'Content-Type: application/json';
            $h[] = 'Accept: application/json';
        }
        if ($this->apiToken) {
            $h[] = 'Authorization: Bearer ' . $this->apiToken;
        }
        return $h;
    }

    private function request(string $method, string $path, ?array $body = null): array
    {
        $ch = curl_init($this->baseUrl . $path);
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $this->timeout,
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_HTTPHEADER     => $this->headers(true),
        ];
        if ($body !== null) {
            $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        }
        curl_setopt_array($ch, $opts);

        $raw  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            throw new \RuntimeException("Node renderer unreachable: $err");
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            throw new \RuntimeException("Invalid JSON from renderer (HTTP $code): " . substr((string)$raw, 0, 300));
        }
        if ($code >= 400) {
            $msg = $data['error'] ?? "HTTP $code";
            throw new \RuntimeException("Renderer error: $msg");
        }
        return $data;
    }
}

'use strict';
// Front-end for the demo UI. Mirrors exactly what the PHP app would do:
//   POST /generate  → poll GET /status/:id  → show GET /video/:id
const $ = (id) => document.getElementById(id);
const api = (p) => p; // same-origin

let pollTimer = null;
let currentJob = null;

async function loadMeta() {
  try {
    const meta = await fetch(api('/meta')).then((r) => r.json());
    // aspect ratios
    const ar = $('aspectRatio');
    ar.innerHTML = '';
    Object.entries(meta.aspectRatios).forEach(([k, v]) => {
      const o = document.createElement('option');
      o.value = k; o.textContent = `${k}  (${v.width}×${v.height})`;
      if (k === '9:16') o.selected = true;
      ar.appendChild(o);
    });
    // palettes
    const pal = $('palette');
    Object.keys(meta.palettes).forEach((k) => {
      const o = document.createElement('option'); o.value = k; o.textContent = k; pal.appendChild(o);
    });
    // fonts
    const fnt = $('font');
    meta.fonts.forEach((k) => {
      const o = document.createElement('option'); o.value = k; o.textContent = k; fnt.appendChild(o);
    });
    $('badge-llm').textContent = `LLM: ${meta.llmProvider}`;
    $('badge-render').textContent = `render: ${meta.renderTarget}`;
  } catch (e) {
    console.error('meta load failed', e);
  }
}

function pill(status) {
  return `<span class="state-pill state-${status}">${status}</span>`;
}

function renderStatus(job) {
  const area = $('status-area');
  area.classList.remove('empty');
  const busy = job.status === 'pending' || job.status === 'rendering';
  const label = {
    pending: 'Queued — generating scene JSON…',
    rendering: 'Rendering video (Remotion)…',
    done: 'Done!',
    failed: 'Render failed',
  }[job.status] || job.status;

  let html = `<div class="status-row">
    ${busy ? '<div class="spinner"></div>' : ''}
    <div class="status-label">${label}</div>
    ${pill(job.status)}
  </div>`;

  if (busy) {
    html += `<div class="progress"><div style="width:${job.status === 'rendering' ? 66 : 20}%"></div></div>`;
  }
  html += `<div class="sub" style="margin-top:8px;color:var(--muted);font-size:12px;font-family:ui-monospace,monospace">
    job ${job.id} · attempts ${job.attempts} · provider ${job.provider || '—'}</div>`;

  if (job.warnings && job.warnings.length) {
    html += `<div class="warnings">⚠ ${job.warnings.map(escapeHtml).join('<br>')}</div>`;
  }
  if (job.status === 'failed' && job.error) {
    html += `<div class="error-box">${escapeHtml(job.error)}<br><br>
      <button class="btn-secondary" onclick="window.__retry()">Retry</button></div>`;
  }
  area.innerHTML = html;

  // video
  const va = $('video-area');
  if (job.status === 'done' && job.videoUrl) {
    va.classList.remove('hidden');
    $('player').src = job.videoUrl;
    $('download').href = job.videoUrl + '?download=1';
  } else {
    va.classList.add('hidden');
  }

  // scene json
  if (job.scene) {
    $('scene-details').classList.remove('hidden');
    $('scene-json').textContent = JSON.stringify(job.scene, null, 2);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function generate() {
  const script = $('script').value.trim();
  if (!script) { alert('Please enter a script.'); return; }
  const btn = $('generate');
  btn.disabled = true; btn.textContent = 'Submitting…';

  const body = {
    script,
    aspectRatio: $('aspectRatio').value,
    durationSec: $('durationSec').value || null,
    palette: $('palette').value || null,
    font: $('font').value || null,
    style: $('style').value || null,
  };

  try {
    const res = await fetch(api('/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const job = await res.json();
    currentJob = job;
    renderStatus(job);
    startPolling(job.id);
    loadJobs();
  } catch (e) {
    alert('Failed to start job: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Generate video';
  }
}

function startPolling(id) {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const job = await fetch(api(`/status/${id}`)).then((r) => r.json());
      currentJob = job;
      renderStatus(job);
      if (job.status === 'done' || job.status === 'failed') {
        clearInterval(pollTimer); pollTimer = null;
        loadJobs();
      }
    } catch (e) {
      console.error('poll error', e);
    }
  }, 1500);
}

window.__retry = () => { if (currentJob) generate(); };

async function loadJobs() {
  try {
    const { jobs } = await fetch(api('/jobs')).then((r) => r.json());
    const list = $('jobs-list');
    if (!jobs.length) { list.innerHTML = '<p class="hint">No jobs yet.</p>'; return; }
    list.innerHTML = jobs.map((j) => {
      const title = (j.scene && j.scene.title) || j.id;
      const size = j.sizeBytes ? `${(j.sizeBytes / 1024 / 1024).toFixed(2)} MB` : '';
      const dur = j.durationMs ? `${(j.durationMs / 1000).toFixed(1)}s render` : '';
      return `<div class="job-item">
        <div class="meta">
          <div class="title">${escapeHtml(title)}</div>
          <div class="sub">${j.id} · ${[dur, size].filter(Boolean).join(' · ')}</div>
        </div>
        <div class="right">
          ${pill(j.status)}
          ${j.videoUrl ? `<button class="btn-secondary" onclick="window.__open('${j.id}')">View</button>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch (e) { console.error('jobs load failed', e); }
}

window.__open = async (id) => {
  const job = await fetch(api(`/status/${id}`)).then((r) => r.json());
  currentJob = job;
  renderStatus(job);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// --- Mock "Create a Post" media integration ---
$('attach').addEventListener('click', () => {
  if (!currentJob || !currentJob.videoUrl) return;
  const modal = $('post-modal');
  $('post-media').innerHTML = `<video src="${currentJob.videoUrl}" controls playsinline></video>`;
  modal.classList.remove('hidden');
});
$('post-cancel').addEventListener('click', () => $('post-modal').classList.add('hidden'));
$('post-publish').addEventListener('click', () => {
  const box = document.querySelector('.modal-box');
  box.querySelector('.published-note')?.remove();
  const note = document.createElement('div');
  note.className = 'published-note';
  note.textContent = '✓ Post published with the generated video attached (demo).';
  box.appendChild(note);
  setTimeout(() => $('post-modal').classList.add('hidden'), 1400);
});

$('generate').addEventListener('click', generate);
loadMeta();
loadJobs();

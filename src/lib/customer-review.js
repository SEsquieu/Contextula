import path from 'node:path';
import { readdir, writeFile } from 'node:fs/promises';
import { listApprovals } from './approvals.js';
import { resolveWorkspace } from './storage.js';
import { now, readJson, readJsonl } from './util.js';
import { classifyWorkspace } from './classification.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function list(items, render) {
  if (!items.length) return '<li class="muted">None yet.</li>';
  return items.map(render).join('\n');
}

async function latestJsonIn(root, dir) {
  const full = path.join(root, dir);
  const entries = (await readdir(full, { withFileTypes: true }).catch(() => []));
  const items = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) items.push({ artifact: path.join(dir, entry.name).replaceAll('\\', '/'), data: await readJson(path.join(full, entry.name), null).catch(() => null) });
    if (entry.isDirectory()) {
      const nested = await latestJsonIn(root, path.join(dir, entry.name).replaceAll('\\', '/'));
      if (nested) items.push(nested);
    }
  }
  items.sort((a, b) => String(b.data?.createdAt || b.data?.at || b.data?.requestedAt || '').localeCompare(String(a.data?.createdAt || a.data?.at || a.data?.requestedAt || '')));
  return items[0] || null;
}

export async function generateCustomerReviewPackage(home, workspaceId, { previewUrl = null, note = null } = {}) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = (await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => [])).filter((claim) => claim.status === 'active').sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const preferences = await readJson(path.join(root, 'memory', 'preferences.json'), { items: [] });
  const classification = classifyWorkspace(claims);
  const { approvals } = await listApprovals(home, workspaceId);
  const pending = approvals.filter((approval) => approval.status === 'pending');
  const latestPatch = await latestJsonIn(root, 'site/patches');
  const latestPreview = await latestJsonIn(root, 'site/previews');
  const latestContent = await latestJsonIn(root, 'content/drafts');
  const timeline = (await readJsonl(path.join(root, 'timeline.jsonl')).catch(() => [])).slice(-10).reverse();
  const effectivePreviewUrl = previewUrl || latestPatch?.data?.previewUrl || latestPreview?.data?.previewUrl || null;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Contextula Review — ${escapeHtml(record.name || record.slug)}</title>
  <style>
    :root { color-scheme: light dark; --bg:#0b0f14; --panel:#121821; --line:#263241; --text:#edf5ff; --muted:#9caabd; --accent:#70e0a3; --warn:#ffd166; }
    * { box-sizing:border-box; }
    body { margin:0; background:linear-gradient(135deg,#091019,#101820); color:var(--text); font-family: Inter, ui-sans-serif, system-ui, Segoe UI, Arial; }
    main { max-width:1080px; margin:0 auto; padding:34px 20px 56px; }
    header { border:1px solid var(--line); background:rgba(18,24,33,.9); padding:24px; margin-bottom:18px; }
    h1 { margin:0 0 8px; font-size:clamp(2rem,5vw,4rem); line-height:1; }
    h2 { margin:0 0 12px; font-size:1.05rem; text-transform:uppercase; letter-spacing:.12em; color:var(--accent); }
    .deck { color:var(--muted); font-size:1.05rem; line-height:1.6; max-width:760px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:14px; }
    .card { border:1px solid var(--line); background:rgba(18,24,33,.82); padding:18px; }
    .hero-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }
    a.button, .button { display:inline-block; background:var(--accent); color:#07110b; padding:11px 14px; text-decoration:none; font-weight:800; }
    .button.secondary { background:transparent; color:var(--accent); border:1px solid var(--accent); }
    ul { margin:0; padding-left:20px; }
    li { margin:8px 0; color:var(--text); }
    .muted { color:var(--muted); }
    .pill { display:inline-block; border:1px solid var(--line); color:var(--muted); padding:3px 7px; font-size:.78rem; }
    code { color:var(--warn); }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="pill">Contextula review package</p>
      <h1>${escapeHtml(record.name || record.slug)}</h1>
      <p class="deck">Here is what your digital ops rep understands so far, what is ready to review, and what needs approval before anything goes live.</p>
      ${note ? `<p class="deck"><strong>Note:</strong> ${escapeHtml(note)}</p>` : ''}
      <div class="hero-actions">
        ${effectivePreviewUrl ? `<a class="button" href="${escapeHtml(effectivePreviewUrl)}">Open preview</a>` : '<span class="button secondary">Preview not recorded yet</span>'}
        <span class="button secondary">${pending.length} pending approval${pending.length === 1 ? '' : 's'}</span>
      </div>
    </header>

    <section class="grid">
      <div class="card"><h2>What I think this is</h2><p>${escapeHtml(classification.label)}</p><p class="muted">${escapeHtml(classification.primaryGoal)}</p></div>
      <div class="card"><h2>Website / source</h2><p>${profile.website ? `<a href="${escapeHtml(profile.website)}">${escapeHtml(profile.website)}</a>` : 'No public website recorded yet.'}</p></div>
      <div class="card"><h2>Latest preview work</h2><p>${latestPatch ? escapeHtml(latestPatch.artifact) : latestPreview ? escapeHtml(latestPreview.artifact) : 'No preview or patch manifest yet.'}</p></div>
      <div class="card"><h2>Latest content</h2><p>${latestContent?.data?.title ? escapeHtml(latestContent.data.title) : 'No content draft yet.'}</p></div>
    </section>

    <section class="grid" style="margin-top:14px">
      <div class="card"><h2>Context I’ll preserve</h2><ul>${list(claims.slice(0, 8), (claim) => `<li>${escapeHtml(claim.text)} <span class="pill">${Math.round((claim.confidence || 0) * 100)}%</span></li>`)}</ul></div>
      <div class="card"><h2>Preference memory</h2><ul>${list((preferences.items || []).slice(0, 8), (item) => `<li>${escapeHtml(item.text)} <span class="pill">${escapeHtml(item.category)}</span></li>`)}</ul></div>
      <div class="card"><h2>Approvals needed</h2><ul>${list(pending.slice(0, 8), (approval) => `<li><strong>${escapeHtml(approval.type)}</strong><br><span class="muted">${escapeHtml(approval.reason || '')}</span><br><code>${escapeHtml(approval.id)}</code></li>`)}</ul></div>
      <div class="card"><h2>Recent activity</h2><ul>${list(timeline, (event) => `<li>${escapeHtml(event.type)}<br><span class="muted">${escapeHtml(event.at)}</span></li>`)}</ul></div>
    </section>
  </main>
</body>
</html>`;

  const artifact = 'reports/customer-review-package.html';
  await writeFile(path.join(root, artifact), html, 'utf8');
  return { artifact, html, previewUrl: effectivePreviewUrl, pendingApprovals: pending.length };
}

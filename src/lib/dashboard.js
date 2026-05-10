import path from 'node:path';
import { readdir, writeFile } from 'node:fs/promises';
import { resolveWorkspace } from './storage.js';
import { now, readJson, readJsonl } from './util.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function readApprovals(root) {
  const files = (await readdir(path.join(root, 'approvals')).catch(() => [])).filter((file) => file.endsWith('.json'));
  const approvals = [];
  for (const file of files) approvals.push(await readJson(path.join(root, 'approvals', file), {}));
  return approvals;
}

function list(items, render) {
  if (!items.length) return '<li class="muted">None yet</li>';
  return items.map(render).join('\n');
}

export async function generateDashboard(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = (await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => [])).filter((claim) => claim.status === 'active');
  const tickets = (await readJsonl(path.join(root, 'tickets', 'tickets.jsonl')).catch(() => [])).filter((ticket) => ticket.status === 'open');
  const approvals = (await readApprovals(root)).filter((approval) => approval.status === 'pending');
  const timeline = (await readJsonl(path.join(root, 'timeline.jsonl')).catch(() => [])).slice(-12).reverse();

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Contextula — ${escapeHtml(record.name || record.slug)}</title>
  <style>
    :root { color-scheme: dark; --bg:#0d1117; --panel:#161b22; --muted:#8b949e; --text:#e6edf3; --line:#30363d; --accent:#7ee787; --warn:#f2cc60; }
    body { margin:0; font-family: ui-sans-serif, system-ui, Segoe UI, Arial; background:var(--bg); color:var(--text); }
    main { max-width:1100px; margin:0 auto; padding:32px; }
    header { margin-bottom:24px; }
    h1 { margin:0 0 6px; font-size:32px; }
    h2 { margin:0 0 12px; font-size:18px; }
    .muted { color:var(--muted); }
    .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:16px; }
    .card { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:18px; box-shadow: 0 8px 24px rgba(0,0,0,.18); }
    .metric { font-size:30px; font-weight:700; color:var(--accent); }
    ul { padding-left:18px; margin:0; }
    li { margin:8px 0; }
    code { color:var(--warn); }
    .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:4px 8px; color:var(--muted); font-size:12px; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(record.name || record.slug)}</h1>
      <div class="muted">Workspace <code>${escapeHtml(record.id)}</code> · generated ${escapeHtml(now())}</div>
      <div class="muted">Website: ${profile.website ? `<a href="${escapeHtml(profile.website)}">${escapeHtml(profile.website)}</a>` : '(none)'}</div>
    </header>

    <section class="grid">
      <div class="card"><h2>Pending approvals</h2><div class="metric">${approvals.length}</div></div>
      <div class="card"><h2>Open tickets</h2><div class="metric">${tickets.length}</div></div>
      <div class="card"><h2>Active claims</h2><div class="metric">${claims.length}</div></div>
      <div class="card"><h2>Status</h2><div class="metric">${escapeHtml(record.status)}</div></div>
    </section>

    <section class="grid" style="margin-top:16px">
      <div class="card"><h2>Top claims</h2><ul>${list(claims.slice(0, 8), (claim) => `<li>${escapeHtml(claim.text)} <span class="pill">${Math.round((claim.confidence || 0) * 100)}%</span></li>`)}</ul></div>
      <div class="card"><h2>Open tickets</h2><ul>${list(tickets.slice(0, 8), (ticket) => `<li><strong>${escapeHtml(ticket.title)}</strong><br><span class="muted">${escapeHtml(ticket.priority)} · ${escapeHtml(ticket.effort)}</span></li>`)}</ul></div>
      <div class="card"><h2>Approval gates</h2><ul>${list(approvals.slice(0, 8), (approval) => `<li>${escapeHtml(approval.type)}<br><span class="muted">${escapeHtml(approval.artifact)}</span></li>`)}</ul></div>
      <div class="card"><h2>Recent timeline</h2><ul>${list(timeline, (event) => `<li>${escapeHtml(event.type)}<br><span class="muted">${escapeHtml(event.at)}</span></li>`)}</ul></div>
    </section>
  </main>
</body>
</html>
`;

  const artifact = 'reports/dashboard.html';
  await writeFile(path.join(root, artifact), html, 'utf8');
  return { artifact, html };
}

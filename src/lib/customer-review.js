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

function sentenceList(items) {
  return list(items, (item) => `<li>${escapeHtml(item)}</li>`);
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

async function latestBuild(root) {
  const buildsDir = path.join(root, 'builds');
  const entries = (await readdir(buildsDir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('sitebuild_'));
  const builds = [];
  for (const entry of entries) {
    const artifact = `builds/${entry.name}/contextula/build.json`;
    const data = await readJson(path.join(root, artifact), null).catch(() => null);
    if (data?.root) builds.push({ artifact, data });
  }
  builds.sort((a, b) => String(b.data.createdAt || '').localeCompare(String(a.data.createdAt || '')));
  return builds[0] || null;
}

function leadSummary({ record, profile, classification, claims }) {
  const websiteClaim = profile.website ? `I found or recorded a current web presence at ${profile.website}.` : 'I did not record an owned website yet, so this can start as a zero-to-one public presence.';
  const titleClaim = claims.find((claim) => /page title/i.test(claim.text || ''))?.text;
  const feedbackClaim = claims.find((claim) => /preference feedback|brand preference/i.test(claim.text || ''))?.text;
  return [
    `This looks like a ${classification.label.toLowerCase()} for ${record.name || record.slug}.`,
    websiteClaim,
    titleClaim || 'The first pass should stay simple until the owner confirms the exact offer, audience, and proof points.',
    feedbackClaim || 'The preview should avoid invented facts and leave business-specific claims for owner approval.'
  ];
}

function nextQuestions(profile) {
  const questions = [];
  if (!profile.contact?.phone) questions.push('What phone number or contact method should customers use?');
  if (!profile.contact?.email) questions.push('Should quote requests go to an email inbox, form, CRM, or text workflow?');
  if (!profile.serviceArea?.length) questions.push('What towns, counties, or radius should the business publicly serve?');
  questions.push('Do you have before/after photos, real reviews, pricing guidance, or seasonal offers I should add?');
  questions.push('What should the site never say, promise, or imply without your approval?');
  return questions;
}

function repActions(classification) {
  const base = [
    'Turn this preview into a real production site after approval.',
    'Record owner feedback so future edits stay on-brand instead of restarting from scratch.',
    'Add approved photos, services, reviews, hours, and contact details.',
    'Draft seasonal promos and social posts from the same business context.',
    'Set up a lead-capture path and keep follow-ups visible.'
  ];
  if (classification.kind === 'personal-project-hub') return ['Refine project routing and status storytelling.', 'Publish approved notes or updates.', ...base.slice(1, 4)];
  return base;
}

function approvalLabels(pending) {
  return pending.map((approval) => {
    if (approval.type === 'site.build.review') return 'Review the private preview before it becomes customer-facing or production-ready.';
    if (approval.type === 'site.plan.review') return 'Confirm the proposed site structure and public journey.';
    if (approval.type === 'content.publish.review') return 'Approve draft copy before it is published or wired into the site.';
    if (approval.type === 'site.production.review') return 'Approve production publish/merge only after the preview looks right.';
    return approval.reason || approval.type;
  });
}

export async function generateCustomerReviewPackage(home, workspaceId, { previewUrl = null, note = null, mode = 'customer' } = {}) {
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
  const build = await latestBuild(root);
  const timeline = (await readJsonl(path.join(root, 'timeline.jsonl')).catch(() => [])).slice(-10).reverse();
  const localBuildUrl = build?.data?.root ? `../${build.data.root}/index.html` : null;
  const effectivePreviewUrl = previewUrl || latestPatch?.data?.previewUrl || latestPreview?.data?.previewUrl || localBuildUrl;
  const prospectMode = mode === 'prospect' || record.status === 'prospect';
  const summary = leadSummary({ record, profile, classification, claims });
  const questions = nextQuestions(profile);
  const actions = repActions(classification);
  const approvalCopy = approvalLabels(pending);
  const primaryTitle = prospectMode ? `I made a private first preview for ${record.name || record.slug}` : `${record.name || record.slug} review package`;
  const primaryDeck = prospectMode
    ? 'Contextula gives your business a digital ops rep: it learns the context, drafts improvements, creates previews, and waits for approval before anything goes live.'
    : 'Here is what your digital ops rep understands so far, what is ready to review, and what needs approval before anything goes live.';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Contextula Onboarding — ${escapeHtml(record.name || record.slug)}</title>
  <style>
    :root { color-scheme: light dark; --bg:#0b0f14; --panel:#121821; --line:#263241; --text:#edf5ff; --muted:#9caabd; --accent:#70e0a3; --red:#ff4d5e; --warn:#ffd166; }
    * { box-sizing:border-box; }
    body { margin:0; background:radial-gradient(circle at 20% -10%,rgba(112,224,163,.20),transparent 35%),linear-gradient(135deg,#091019,#101820); color:var(--text); font-family: Inter, ui-sans-serif, system-ui, Segoe UI, Arial; }
    main { max-width:1120px; margin:0 auto; padding:34px 20px 56px; }
    header, .card, .offer { border:1px solid var(--line); background:rgba(18,24,33,.86); box-shadow:0 18px 60px rgba(0,0,0,.20); }
    header { padding:28px; margin-bottom:18px; }
    h1 { margin:0 0 10px; font-size:clamp(2.35rem,6vw,5rem); line-height:.92; letter-spacing:-.06em; }
    h2 { margin:0 0 12px; font-size:1.02rem; text-transform:uppercase; letter-spacing:.12em; color:var(--accent); }
    h3 { margin:0 0 8px; }
    .deck { color:var(--muted); font-size:1.08rem; line-height:1.6; max-width:820px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(255px,1fr)); gap:14px; }
    .card, .offer { padding:18px; }
    .offer { margin:14px 0; display:grid; grid-template-columns:1.3fr .7fr; gap:18px; align-items:center; }
    .hero-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }
    a.button, .button { display:inline-block; background:var(--accent); color:#07110b; padding:12px 15px; text-decoration:none; font-weight:900; border-radius:2px; }
    .button.secondary { background:transparent; color:var(--accent); border:1px solid var(--accent); }
    .button.red { background:var(--red); color:white; }
    ul, ol { margin:0; padding-left:20px; }
    li { margin:8px 0; color:var(--text); line-height:1.45; }
    .muted { color:var(--muted); }
    .pill { display:inline-block; border:1px solid var(--line); color:var(--muted); padding:4px 8px; font-size:.78rem; text-transform:uppercase; letter-spacing:.08em; }
    code { color:var(--warn); }
    .close { border-color:rgba(255,77,94,.45); }
    @media(max-width:760px){ .offer{grid-template-columns:1fr} }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="pill">Contextula onboarding package</p>
      <h1>${escapeHtml(primaryTitle)}</h1>
      <p class="deck">${escapeHtml(primaryDeck)}</p>
      ${note ? `<p class="deck"><strong>Note:</strong> ${escapeHtml(note)}</p>` : ''}
      <div class="hero-actions">
        ${effectivePreviewUrl ? `<a class="button red" href="${escapeHtml(effectivePreviewUrl)}">Open private preview</a>` : '<span class="button secondary">Preview not recorded yet</span>'}
        <span class="button secondary">${pending.length} approval${pending.length === 1 ? '' : 's'} waiting</span>
      </div>
    </header>

    <section class="offer">
      <div>
        <h2>The offer</h2>
        <p class="deck">Start your public journey with a digital ops rep — first a clean public presence, then ongoing edits, campaigns, lead capture, and growth experiments that stay grounded in your business context.</p>
      </div>
      <div class="card close">
        <h3>Simple next step</h3>
        <p class="muted">Review the preview, answer the owner questions, and approve the next version. Nothing publishes without approval.</p>
      </div>
    </section>

    <section class="grid">
      <div class="card"><h2>What I noticed</h2><ul>${sentenceList(summary)}</ul></div>
      <div class="card"><h2>Input / source</h2><ul><li><strong>Name:</strong> ${escapeHtml(record.name || record.slug)}</li><li><strong>Website:</strong> ${profile.website ? `<a href="${escapeHtml(profile.website)}">${escapeHtml(profile.website)}</a>` : 'No owned website recorded yet.'}</li><li><strong>Detected type:</strong> ${escapeHtml(classification.label)}</li><li><strong>Goal:</strong> ${escapeHtml(classification.primaryGoal)}</li></ul></div>
      <div class="card"><h2>Preview status</h2><ul><li>${build ? `Generated local preview: ${escapeHtml(build.data.root)}` : 'No generated preview yet.'}</li><li>${latestPatch ? `Patch record: ${escapeHtml(latestPatch.artifact)}` : latestPreview ? `Preview record: ${escapeHtml(latestPreview.artifact)}` : 'No external preview publish yet.'}</li><li>${latestContent?.data?.title ? `Draft content: ${escapeHtml(latestContent.data.title)}` : 'No content draft yet.'}</li></ul></div>
    </section>

    <section class="grid" style="margin-top:14px">
      <div class="card"><h2>What needs approval</h2><ul>${sentenceList(approvalCopy.slice(0, 8))}</ul></div>
      <div class="card"><h2>Owner questions</h2><ol>${sentenceList(questions)}</ol></div>
      <div class="card"><h2>What your rep can do next</h2><ul>${sentenceList(actions)}</ul></div>
    </section>

    <section class="grid" style="margin-top:14px">
      <div class="card"><h2>Context I’ll preserve</h2><ul>${list(claims.slice(0, 8), (claim) => `<li>${escapeHtml(claim.text)} <span class="pill">${Math.round((claim.confidence || 0) * 100)}%</span></li>`)}</ul></div>
      <div class="card"><h2>Preference memory</h2><ul>${list((preferences.items || []).slice(0, 8), (item) => `<li>${escapeHtml(item.text)} <span class="pill">${escapeHtml(item.category)}</span></li>`)}</ul></div>
      <div class="card"><h2>Recent activity</h2><ul>${list(timeline, (event) => `<li>${escapeHtml(event.type)}<br><span class="muted">${escapeHtml(event.at)}</span></li>`)}</ul></div>
    </section>
  </main>
</body>
</html>`;

  const artifact = 'reports/customer-review-package.html';
  await writeFile(path.join(root, artifact), html, 'utf8');
  return { artifact, html, previewUrl: effectivePreviewUrl, pendingApprovals: pending.length };
}

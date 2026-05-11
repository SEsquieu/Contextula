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
    ? 'Your persistent digital operator: Contextula continuously modernizes and grows your public presence through conversation, iteration, and operational continuity.'
    : 'Your Contextula operator understands the business context, prepares reviewable work, and waits for approval before anything goes live.';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Contextula Onboarding — ${escapeHtml(record.name || record.slug)}</title>
  <style>
    :root { color-scheme: dark; --bg:#0d0d0d; --black:#0d0d0d; --charcoal:#1a1a1a; --panel:#111; --panel2:#171717; --line:rgba(245,245,245,.14); --text:#f5f5f5; --muted:#b9b9b9; --red:#e21d2d; --red2:#94141d; --white:#f5f5f5; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; background:radial-gradient(circle at 8% 4%,rgba(226,29,45,.34) 0 55px,rgba(226,29,45,.12) 56px 105px,transparent 106px),radial-gradient(circle at 88% 14%,rgba(226,29,45,.18),transparent 28%),linear-gradient(135deg,#050505 0%,#0d0d0d 42%,#151010 100%); color:var(--text); font-family: Inter, ui-sans-serif, system-ui, Segoe UI, Arial; }
    body::before { content:""; position:fixed; inset:0; pointer-events:none; background:linear-gradient(90deg,rgba(226,29,45,.05) 1px,transparent 1px),linear-gradient(rgba(245,245,245,.025) 1px,transparent 1px); background-size:54px 54px; mask-image:linear-gradient(to bottom,black,transparent 72%); }
    body::after { content:""; position:fixed; left:0; right:0; bottom:0; height:22vh; pointer-events:none; background:linear-gradient(to top,rgba(0,0,0,.72),transparent); }
    main { position:relative; z-index:1; max-width:1160px; margin:0 auto; padding:34px 20px 64px; }
    header, .card, .offer, .principles { border:1px solid var(--line); background:linear-gradient(145deg,rgba(18,18,18,.94),rgba(8,8,8,.92)); box-shadow:0 22px 70px rgba(0,0,0,.48), inset 0 1px 0 rgba(245,245,245,.04); }
    header { position:relative; overflow:hidden; padding:32px; margin-bottom:18px; min-height:360px; }
    header::after { content:""; position:absolute; right:-80px; top:-110px; width:320px; height:320px; border-radius:50%; background:radial-gradient(circle,rgba(226,29,45,.22),transparent 62%); filter:blur(2px); }
    .brand-lockup { position:relative; z-index:1; display:flex; align-items:center; gap:18px; margin-bottom:42px; }
    .fang-mark { position:relative; width:88px; height:88px; display:grid; place-items:center; border-radius:20px; background:linear-gradient(145deg,var(--red),#750913); color:#080808; font-family:Georgia,serif; font-size:74px; font-weight:900; line-height:1; box-shadow:0 0 34px rgba(226,29,45,.34); }
    .fang-mark::before,.fang-mark::after{ content:""; position:absolute; top:18px; width:0; height:0; border-left:8px solid transparent; border-right:8px solid transparent; border-top:24px solid #080808; transform:rotate(6deg); }
    .fang-mark::before{ left:35px; } .fang-mark::after{ right:20px; transform:rotate(-8deg); }
    .wordmark { font-family:Georgia, 'Times New Roman', serif; font-size:clamp(44px,7vw,82px); letter-spacing:-.07em; line-height:.82; color:var(--white); text-shadow:0 8px 24px rgba(0,0,0,.8); }
    .tagline { margin-top:10px; color:var(--red); text-transform:uppercase; letter-spacing:.42em; font-size:12px; font-weight:800; }
    h1 { position:relative; z-index:1; margin:0 0 14px; font-family:Georgia,'Times New Roman',serif; font-size:clamp(2.5rem,6.8vw,5.6rem); line-height:.94; letter-spacing:-.055em; max-width:900px; }
    h2 { margin:0 0 12px; font-size:.82rem; text-transform:uppercase; letter-spacing:.22em; color:var(--red); }
    h3 { margin:0 0 8px; }
    .deck { position:relative; z-index:1; color:var(--muted); font-size:1.08rem; line-height:1.65; max-width:820px; }
    .deck strong, .scarlet { color:var(--red); font-weight:800; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(255px,1fr)); gap:14px; }
    .card, .offer, .principles { padding:19px; }
    .offer { margin:14px 0; display:grid; grid-template-columns:1.25fr .75fr; gap:18px; align-items:center; }
    .principles { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:14px 0; }
    .principle { border-left:2px solid var(--red); padding:8px 12px; color:var(--muted); text-transform:uppercase; letter-spacing:.12em; font-size:12px; }
    .hero-actions { position:relative; z-index:1; display:flex; flex-wrap:wrap; gap:10px; margin-top:22px; }
    a.button, .button { display:inline-block; background:var(--white); color:#080808; padding:13px 16px; text-decoration:none; font-weight:900; border-radius:4px; text-transform:uppercase; letter-spacing:.08em; font-size:12px; }
    .button.secondary { background:transparent; color:var(--white); border:1px solid var(--line); }
    .button.red { background:linear-gradient(135deg,var(--red),#9b111d); color:white; box-shadow:0 0 28px rgba(226,29,45,.24); }
    ul, ol { margin:0; padding-left:20px; }
    li { margin:8px 0; color:var(--text); line-height:1.48; }
    a { color:var(--white); }
    .muted { color:var(--muted); }
    .pill { display:inline-block; border:1px solid var(--line); color:var(--muted); padding:4px 8px; font-size:.72rem; text-transform:uppercase; letter-spacing:.12em; }
    code { color:#ff8a94; }
    .close { border-color:rgba(226,29,45,.45); background:linear-gradient(145deg,rgba(226,29,45,.16),rgba(17,17,17,.92)); }
    @media(max-width:760px){ header{min-height:auto}.brand-lockup{align-items:flex-start}.fang-mark{width:64px;height:64px;font-size:54px}.tagline{letter-spacing:.22em}.offer{grid-template-columns:1fr} }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="brand-lockup">
        <div class="fang-mark" aria-hidden="true">C</div>
        <div><div class="wordmark">contextula</div><div class="tagline">Persistent context. Continuous growth.</div></div>
      </div>
      <p class="pill">Private operator brief</p>
      <h1>${escapeHtml(primaryTitle)}</h1>
      <p class="deck">${escapeHtml(primaryDeck)}</p>
      ${note ? `<p class="deck"><strong>Operator note:</strong> ${escapeHtml(note)}</p>` : ''}
      <div class="hero-actions">
        ${effectivePreviewUrl ? `<a class="button red" href="${escapeHtml(effectivePreviewUrl)}">Open private preview</a>` : '<span class="button secondary">Preview not recorded yet</span>'}
        <span class="button secondary">${pending.length} approval${pending.length === 1 ? '' : 's'} waiting</span>
      </div>
    </header>

    <section class="principles" aria-label="Contextula principles">
      <div class="principle">Conversational</div><div class="principle">Iterative</div><div class="principle">Trusted</div><div class="principle">Continuous</div>
    </section>

    <section class="offer">
      <div>
        <h2>The offer</h2>
        <p class="deck"><span class="scarlet">Your persistent digital operator.</span> Start with a clean public presence, then keep improving through edits, campaigns, lead capture, and growth experiments that stay grounded in your business context.</p>
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

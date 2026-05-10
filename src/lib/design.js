import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { appendJsonl, id, now, readJson, readJsonl, VERSION, writeJson } from './util.js';
import { resolveWorkspace } from './storage.js';
import { classifyWorkspace } from './classification.js';

function topClaims(claims, limit = 10) {
  return claims
    .filter((claim) => claim.status === 'active')
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, limit);
}

function designSignals(claims) {
  const text = claims.map((claim) => claim.text).join(' ').toLowerCase();
  const signals = [];
  if (/project hub|personal\/project|build-in-public|build in public|experiments|subdomain|music\.grinningfrog|blog\.grinningfrog|lab\.grinningfrog/.test(text)) signals.push('project-hub navigation and identity');
  if (/retro|transmission|signal|technical|playful/.test(text)) signals.push('retro technical signal aesthetic');
  if (/launch|status|roadmap|planned content|content lanes/.test(text)) signals.push('launch/status storytelling');
  if (/local|family|trusted|licensed|insured|years/.test(text)) signals.push('local trust and credibility');
  if (/urgent|emergency|fast|same day|response/.test(text)) signals.push('speed and clear immediate action');
  if (/phone|call|contact|quote|book|schedule|conversion/.test(text) && !/over quote|not a service-business|project hub/.test(text)) signals.push('obvious conversion path');
  if (/plainspoken|practical|simple|clear/.test(text)) signals.push('plainspoken practical tone');
  return signals.length ? signals : ['clear business value', 'low-friction next step', 'credible modernization without overdesigning'];
}

export async function generateDesignBrief(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'design', 'briefs'), { recursive: true });
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = topClaims(await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => []));
  const classification = classifyWorkspace(claims);
  const signals = designSignals(claims);
  const claimLines = claims.map((claim) => `- ${claim.text}\n  - Source: ${claim.source}\n  - Confidence: ${Math.round((claim.confidence || 0) * 100)}%`).join('\n') || '- No grounded claims yet.';

  const brief = `# Design Brief\n\nCustomer: ${record.name || profile.name || record.slug}\nWorkspace: ${record.id}\nGenerated: ${now()}\n\n## Classification\n\n- Type: ${classification.label}\n- Primary goal: ${classification.primaryGoal}\n\n## Design objective\n\nCreate a first-pass modernization direction that preserves what appears to matter to the site while making the right next action clearer for this specific site type.\n\n## Website / presence\n\n- Website: ${profile.website || '(none provided)'}\n- Homepage captured: ${profile.currentDigitalPresence?.websiteSnapshotCaptured ? 'yes' : 'no'}\n\n## Grounded context\n\n${claimLines}\n\n## Design signals\n\n${signals.map((signal) => `- ${signal}`).join('\n')}\n\n## Recommended sections\n\n${classification.sections.map((section) => `- ${section}`).join('\n')}\n\n## Voice and personality direction\n\nUse grounded claims as taste constraints. Prefer specific, practical, site-relevant language over generic startup polish. If the workspace lacks direct preference data, mark design choices as tentative.\n\n## Avoid\n\n${classification.avoid.map((item) => `- ${item}`).join('\n')}\n\n## Constraints\n\n- Do not invent credentials, guarantees, reviews, or outcomes.\n- Preserve grounded identity and trust signals.\n- Prioritize a small shippable modernization pass over a huge redesign.\n- Customer-facing presentation or deployment requires approval.\n`;

  const artifact = 'design/briefs/design-brief.md';
  await writeFile(path.join(root, artifact), brief, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'design.brief.generated', at: now(), artifact });
  return { artifact, brief };
}

function projectHubMock({ customerName, signals, classification, variant }) {
  return `# Homepage Mock ${variant}\n\nCustomer: ${customerName}\nGenerated: ${now()}\n\n## Design rationale\n\nThis mock is grounded in the current workspace claims and treats the site as a ${classification.label.toLowerCase()}, not a service-business funnel.\n\nDesign signals:\n${signals.map((signal) => `- ${signal}`).join('\n')}\n\n## Hero / Signal deck\n\n**Headline:** ${customerName}: notes, projects, and experiments broadcasting live\n\n**Subheadline:** A retro signal hub for live tools, build notes, prototypes, and upcoming launch channels.\n\n**Primary CTA:** ${classification.cta}\n\n**Secondary CTA:** ${classification.secondaryCta}\n\n## Broadcast status strip\n\n- SYS ONLINE — hub is live\n- LIVE DESTINATION — music.grinningfrog.com\n- INCOMING CHANNELS — blog + lab\n\n## Live projects\n\nLead with the browser-based audio sequencer at music.grinningfrog.com. Explain what it is, why it exists, and what a visitor can do there now.\n\n## Launch channels\n\nShow planned destinations as intentional channels, not empty placeholders:\n\n- blog.grinningfrog.com — dev logs, project breakdowns, long-form notes\n- lab.grinningfrog.com — prototypes, UI tests, one-off experiments\n\n## Build-in-public notes\n\nAdd a short section that makes the maker identity explicit: what gets built here, why it is public, and what kind of updates visitors should expect.\n\n## Review notes\n\n- Preserve the retro transmission language.\n- Optimize for project routing and identity continuity, not quote/contact conversion.\n- Make live vs planned destinations obvious.\n- Capture feedback as claims so future mocks improve.\n`;
}

function serviceBusinessMock({ customerName, signals, classification, variant }) {
  const headline = signals.includes('speed and clear immediate action')
    ? `${customerName}: fast, reliable help when it matters`
    : `${customerName}: practical service, made easy to start`;
  return `# Homepage Mock ${variant}\n\nCustomer: ${customerName}\nGenerated: ${now()}\n\n## Design rationale\n\nThis mock is grounded in the current workspace claims and should be reviewed before customer-facing use.\n\nDesign signals:\n${signals.map((signal) => `- ${signal}`).join('\n')}\n\n## Hero\n\n**Headline:** ${headline}\n\n**Subheadline:** Clear, plainspoken copy that explains what the business does, where it helps, and why a visitor should trust it.\n\n**Primary CTA:** ${classification.cta}\n\n**Secondary CTA:** ${classification.secondaryCta}\n\n## Trust strip\n\n- Local / credible proof point from grounded research\n- Service or response promise only if verified\n- Review/license/experience signal only if sourced\n\n## Services section\n\nUse 3–5 cards with practical labels. Avoid clever names. Each card should answer: what is it, who needs it, and what should they do next?\n\n## About / credibility section\n\nShort, human, specific. Preserve customer personality from known claims. If personality is unknown, use restrained service-business copy instead of fabricated warmth.\n\n## Conversion section\n\nRepeat the primary CTA with minimal friction. If the business prefers phone calls, foreground phone. If not known, offer both call and quote/request form in the mock.\n\n## Review notes\n\n- Verify every proof point before use.\n- Ask whether the tone feels like the customer.\n- Capture approval/rejection feedback as claims so future mocks improve.\n`;
}

export async function generateHomepageMock(home, workspaceId, { variant = 'v1' } = {}) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'design', 'mocks'), { recursive: true });
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = topClaims(await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => []), 12);
  const classification = classifyWorkspace(claims);
  const signals = designSignals(claims);
  const customerName = record.name || profile.name || record.slug;

  const mock = classification.kind === 'personal-project-hub'
    ? projectHubMock({ customerName, signals, classification, variant })
    : serviceBusinessMock({ customerName, signals, classification, variant });

  const artifact = `design/mocks/homepage-${variant}.md`;
  await writeFile(path.join(root, artifact), mock, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'design.mock.generated', at: now(), artifact, variant, classification: classification.kind });
  const approval = {
    id: id('appr'),
    version: VERSION,
    type: 'design.review',
    status: 'pending',
    requestedAt: now(),
    requestedBy: 'contextula-design',
    artifact,
    reason: 'Design mocks require review before customer-facing presentation or implementation.'
  };
  await writeJson(path.join(root, 'approvals', `${approval.id}.json`), approval);
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'approval.requested', at: now(), approvalId: approval.id, action: approval.type, artifact });
  return { artifact, mock, approval };
}

export async function critiqueDesign(home, workspaceId, { artifact = 'design/mocks/homepage-v1.md', feedback } = {}) {
  if (!feedback) throw new Error('Missing --feedback');
  const { root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'design', 'critiques'), { recursive: true });
  const mock = await readFile(path.join(root, artifact), 'utf8').catch(() => '');
  const critiqueArtifact = `design/critiques/${path.basename(artifact, '.md')}-critique.md`;
  const critique = `# Design Critique\n\nArtifact: ${artifact}\nGenerated: ${now()}\n\n## Feedback\n\n${feedback}\n\n## Mock excerpt\n\n${mock.slice(0, 2500) || '(mock artifact not found)'}\n\n## Memory update\n\nThe feedback above should influence future revisions and mocks for this workspace.\n`;

  await writeFile(path.join(root, critiqueArtifact), critique, 'utf8');
  const claim = {
    id: id('claim'),
    at: now(),
    text: `Design preference feedback: ${feedback}`,
    source: critiqueArtifact,
    confidence: 0.95,
    status: 'active'
  };
  await appendJsonl(path.join(root, 'memory', 'claims.jsonl'), claim);
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'design.critique.recorded', at: now(), artifact: critiqueArtifact, sourceArtifact: artifact, claimId: claim.id });
  return { artifact: critiqueArtifact, claim, critique };
}

export async function reviseHomepageMock(home, workspaceId, { from = 'design/mocks/homepage-v1.md', variant = 'v2' } = {}) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'design', 'revisions'), { recursive: true });
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = topClaims(await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => []), 12);
  const classification = classifyWorkspace(claims);
  const signals = designSignals(claims);
  const feedbackClaims = claims.filter((claim) => /design preference feedback/i.test(claim.text));
  const previous = await readFile(path.join(root, from), 'utf8').catch(() => '');
  const customerName = record.name || profile.name || record.slug;

  const revision = `# Homepage Mock ${variant}\n\nCustomer: ${customerName}\nGenerated: ${now()}\nRevised from: ${from}\nClassification: ${classification.label}\n\n## Revision basis\n\nThis revision incorporates recorded design feedback and active workspace claims.\n\n### Active design signals\n\n${signals.map((signal) => `- ${signal}`).join('\n')}\n\n### Feedback memory\n\n${feedbackClaims.map((claim) => `- ${claim.text.replace(/^Design preference feedback: /, '')}\n  - Source: ${claim.source}`).join('\n') || '- No explicit design feedback recorded.'}\n\n## Revised hero\n\n**Headline:** ${classification.kind === 'personal-project-hub' ? `${customerName}: tune into the projects, notes, and experiments` : `${customerName}: clear, credible help without the runaround`}\n\n**Subheadline:** ${classification.kind === 'personal-project-hub' ? 'A sharper signal hub that routes visitors to live apps, upcoming channels, and build-in-public updates.' : 'Practical copy tuned to the customer’s known preferences. Avoid unsupported hype; make the visitor’s next step obvious.'}\n\n**Primary CTA:** ${classification.cta}\n\n## Revised layout notes\n\n- Lead with the strongest grounded value signal.\n- Reflect recorded customer taste before aesthetic novelty.\n- Keep proof points sourced.\n- Preserve a small, shippable scope.\n\n## Previous mock excerpt\n\n${previous.slice(0, 1800) || '(previous mock not found)'}\n`;

  const artifact = `design/revisions/homepage-${variant}.md`;
  await writeFile(path.join(root, artifact), revision, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'design.mock.revised', at: now(), artifact, sourceArtifact: from, variant, classification: classification.kind });
  return { artifact, revision };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function generateHomepageHtml(home, workspaceId, { variant = 'v1' } = {}) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'design', 'mocks'), { recursive: true });
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = topClaims(await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => []), 12);
  const classification = classifyWorkspace(claims);
  const customerName = record.name || profile.name || record.slug;

  const isHub = classification.kind === 'personal-project-hub';
  const title = isHub
    ? `${customerName}: notes, projects, and experiments broadcasting live`
    : `${customerName}: practical service, made easy to start`;
  const subtitle = isHub
    ? 'A retro signal hub for live tools, build notes, prototypes, and upcoming launch channels.'
    : 'Clear, practical modernization copy that helps visitors understand the next step.';
  const cards = isHub
    ? [
        ['LIVE DESTINATION', 'music.grinningfrog.com', 'Browser-based audio sequencer for creating and testing musical patterns.'],
        ['INCOMING CHANNEL', 'blog.grinningfrog.com', 'Dev logs, project breakdowns, and long-form build notes.'],
        ['LAB CHANNEL', 'lab.grinningfrog.com', 'Prototype sandbox for UI tests and one-off experiments.']
      ]
    : [
        ['START', 'Clear primary action', 'Make the next step obvious and low-friction.'],
        ['TRUST', 'Grounded proof points', 'Preserve only verified trust signals.'],
        ['SHIP', 'Small first pass', 'Modernize one visible thing before proposing a rebuild.']
      ];

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(customerName)} — Contextula Mock</title>
  <style>
    :root { --bg:#07120f; --panel:#10231d; --line:#255447; --text:#e9fff7; --muted:#91b9aa; --accent:#8cffc1; --hot:#f5d76e; }
    * { box-sizing:border-box; }
    body { margin:0; font-family: ui-sans-serif, system-ui, Segoe UI, Arial; background: radial-gradient(circle at top left, #173b31, var(--bg) 45%); color:var(--text); }
    main { max-width:1120px; margin:0 auto; padding:48px 24px; }
    .eyebrow { color:var(--accent); letter-spacing:.18em; font-size:12px; font-weight:800; text-transform:uppercase; }
    h1 { font-size:clamp(40px, 7vw, 82px); line-height:.95; margin:14px 0 18px; max-width:900px; }
    .subtitle { color:var(--muted); font-size:20px; max-width:720px; line-height:1.5; }
    .actions { display:flex; gap:12px; flex-wrap:wrap; margin:28px 0 38px; }
    a.button { color:#062017; text-decoration:none; background:var(--accent); padding:13px 18px; border-radius:999px; font-weight:800; }
    a.secondary { color:var(--text); background:transparent; border:1px solid var(--line); }
    .status { border:1px solid var(--line); background:rgba(16,35,29,.74); border-radius:18px; padding:14px 16px; display:flex; gap:16px; flex-wrap:wrap; color:var(--muted); }
    .status strong { color:var(--hot); }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:16px; margin-top:24px; }
    .card { border:1px solid var(--line); background:rgba(16,35,29,.82); border-radius:22px; padding:22px; min-height:180px; }
    .card .tag { color:var(--accent); font-size:12px; font-weight:900; letter-spacing:.12em; }
    .card h2 { margin:14px 0 10px; font-size:24px; }
    .card p { color:var(--muted); line-height:1.55; }
    .note { margin-top:28px; color:var(--muted); font-size:14px; }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">${escapeHtml(classification.label)} · Contextula mock ${escapeHtml(variant)}</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="subtitle">${escapeHtml(subtitle)}</p>
    <div class="actions">
      <a class="button" href="#projects">${escapeHtml(classification.cta)}</a>
      <a class="button secondary" href="#roadmap">${escapeHtml(classification.secondaryCta)}</a>
    </div>
    <section class="status">
      <span><strong>SYS</strong> ONLINE</span>
      <span><strong>MODE</strong> ${escapeHtml(classification.kind)}</span>
      <span><strong>GOAL</strong> ${escapeHtml(classification.primaryGoal)}</span>
    </section>
    <section id="projects" class="grid">
      ${cards.map(([tag, heading, body]) => `<article class="card"><div class="tag">${escapeHtml(tag)}</div><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(body)}</p></article>`).join('\n      ')}
    </section>
    <p class="note">Generated by Contextula from grounded workspace claims. Review required before customer-facing use.</p>
  </main>
</body>
</html>
`;
  const artifact = `design/mocks/homepage-${variant}.html`;
  await writeFile(path.join(root, artifact), html, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'design.html.generated', at: now(), artifact, variant, classification: classification.kind });
  const approval = {
    id: id('appr'),
    version: VERSION,
    type: 'design.review',
    status: 'pending',
    requestedAt: now(),
    requestedBy: 'contextula-design',
    artifact,
    reason: 'HTML design mocks require review before customer-facing presentation or implementation.'
  };
  await writeJson(path.join(root, 'approvals', `${approval.id}.json`), approval);
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'approval.requested', at: now(), approvalId: approval.id, action: approval.type, artifact });
  return { artifact, html, approval };
}

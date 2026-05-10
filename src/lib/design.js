import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { appendJsonl, id, now, readJson, readJsonl, VERSION, writeJson } from './util.js';
import { resolveWorkspace } from './storage.js';

function topClaims(claims, limit = 10) {
  return claims
    .filter((claim) => claim.status === 'active')
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, limit);
}

function designSignals(claims) {
  const text = claims.map((claim) => claim.text).join(' ').toLowerCase();
  const signals = [];
  if (/local|family|trusted|licensed|insured|years/.test(text)) signals.push('local trust and credibility');
  if (/urgent|emergency|fast|same day|response/.test(text)) signals.push('speed and clear immediate action');
  if (/phone|call|contact|quote|book|schedule|conversion/.test(text)) signals.push('obvious conversion path');
  if (/plainspoken|practical|simple|clear/.test(text)) signals.push('plainspoken practical tone');
  return signals.length ? signals : ['clear business value', 'low-friction next step', 'credible modernization without overdesigning'];
}

export async function generateDesignBrief(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'design', 'briefs'), { recursive: true });
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = topClaims(await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => []));
  const signals = designSignals(claims);
  const claimLines = claims.map((claim) => `- ${claim.text}\n  - Source: ${claim.source}\n  - Confidence: ${Math.round((claim.confidence || 0) * 100)}%`).join('\n') || '- No grounded claims yet.';

  const brief = `# Design Brief\n\nCustomer: ${record.name || profile.name || record.slug}\nWorkspace: ${record.id}\nGenerated: ${now()}\n\n## Design objective\n\nCreate a first-pass modernization direction that preserves what appears to matter to the business while making the next customer action clearer.\n\n## Website / presence\n\n- Website: ${profile.website || '(none provided)'}\n- Homepage captured: ${profile.currentDigitalPresence?.websiteSnapshotCaptured ? 'yes' : 'no'}\n\n## Grounded context\n\n${claimLines}\n\n## Design signals\n\n${signals.map((signal) => `- ${signal}`).join('\n')}\n\n## Voice and personality direction\n\nUse grounded claims as taste constraints. Prefer specific, practical, business-relevant language over generic startup polish. If the workspace lacks direct customer preference data, mark design choices as tentative.\n\n## Constraints\n\n- Do not invent credentials, guarantees, reviews, or outcomes.\n- Preserve existing trust signals when they are grounded.\n- Prioritize a small shippable modernization pass over a huge redesign.\n- Customer-facing presentation or deployment requires approval.\n`;

  const artifact = 'design/briefs/design-brief.md';
  await writeFile(path.join(root, artifact), brief, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'design.brief.generated', at: now(), artifact });
  return { artifact, brief };
}

export async function generateHomepageMock(home, workspaceId, { variant = 'v1' } = {}) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'design', 'mocks'), { recursive: true });
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = topClaims(await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => []), 8);
  const signals = designSignals(claims);
  const customerName = record.name || profile.name || record.slug;

  const headline = signals.includes('speed and clear immediate action')
    ? `${customerName}: fast, reliable help when it matters`
    : `${customerName}: practical service, made easy to start`;
  const cta = signals.includes('obvious conversion path') ? 'Call or request a quote' : 'Request a quick consultation';

  const mock = `# Homepage Mock ${variant}\n\nCustomer: ${customerName}\nGenerated: ${now()}\n\n## Design rationale\n\nThis mock is grounded in the current workspace claims and should be reviewed before customer-facing use.\n\nDesign signals:\n${signals.map((signal) => `- ${signal}`).join('\n')}\n\n## Hero\n\n**Headline:** ${headline}\n\n**Subheadline:** Clear, plainspoken copy that explains what the business does, where it helps, and why a visitor should trust it.\n\n**Primary CTA:** ${cta}\n\n**Secondary CTA:** See services\n\n## Trust strip\n\n- Local / credible proof point from grounded research\n- Service or response promise only if verified\n- Review/license/experience signal only if sourced\n\n## Services section\n\nUse 3–5 cards with practical labels. Avoid clever names. Each card should answer: what is it, who needs it, and what should they do next?\n\n## About / credibility section\n\nShort, human, specific. Preserve customer personality from known claims. If personality is unknown, use restrained service-business copy instead of fabricated warmth.\n\n## Conversion section\n\nRepeat the primary CTA with minimal friction. If the business prefers phone calls, foreground phone. If not known, offer both call and quote/request form in the mock.\n\n## Review notes\n\n- Verify every proof point before use.\n- Ask whether the tone feels like the customer.\n- Capture approval/rejection feedback as claims so future mocks improve.\n`;

  const artifact = `design/mocks/homepage-${variant}.md`;
  await writeFile(path.join(root, artifact), mock, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'design.mock.generated', at: now(), artifact, variant });
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
  const signals = designSignals(claims);
  const feedbackClaims = claims.filter((claim) => /design preference feedback/i.test(claim.text));
  const previous = await readFile(path.join(root, from), 'utf8').catch(() => '');
  const customerName = record.name || profile.name || record.slug;

  const revision = `# Homepage Mock ${variant}\n\nCustomer: ${customerName}\nGenerated: ${now()}\nRevised from: ${from}\n\n## Revision basis\n\nThis revision incorporates recorded design feedback and active workspace claims.\n\n### Active design signals\n\n${signals.map((signal) => `- ${signal}`).join('\n')}\n\n### Feedback memory\n\n${feedbackClaims.map((claim) => `- ${claim.text.replace(/^Design preference feedback: /, '')}\n  - Source: ${claim.source}`).join('\n') || '- No explicit design feedback recorded.'}\n\n## Revised hero\n\n**Headline:** ${customerName}: clear, credible help without the runaround\n\n**Subheadline:** Practical copy tuned to the customer’s known preferences. Avoid unsupported hype; make the visitor’s next step obvious.\n\n**Primary CTA:** ${signals.includes('obvious conversion path') ? 'Call or request a quote' : 'Start with a quick question'}\n\n## Revised layout notes\n\n- Lead with the strongest grounded value signal.\n- Reflect recorded customer taste before aesthetic novelty.\n- Keep proof points sourced.\n- Preserve a small, shippable scope.\n\n## Previous mock excerpt\n\n${previous.slice(0, 1800) || '(previous mock not found)'}\n`;

  const artifact = `design/revisions/homepage-${variant}.md`;
  await writeFile(path.join(root, artifact), revision, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'design.mock.revised', at: now(), artifact, sourceArtifact: from, variant });
  return { artifact, revision };
}

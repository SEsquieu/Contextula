import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { appendJsonl, id, now, readJson, readJsonl } from './util.js';
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
  return { artifact, mock };
}

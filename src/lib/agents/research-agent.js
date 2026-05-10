import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { appendJsonl, id, now, readJson, readJsonl } from '../util.js';
import { resolveWorkspace } from '../storage.js';

function clampConfidence(value, fallback = 0.5) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

async function buildResearchPacket(root) {
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => []);
  const homepage = await import('node:fs/promises')
    .then((fs) => fs.readFile(path.join(root, 'research', 'extracted', 'homepage.md'), 'utf8'))
    .catch(() => '');
  return { profile, claims, homepage };
}

function staticProvider(packet) {
  const text = `${packet.profile?.name || ''} ${packet.profile?.website || ''} ${packet.homepage || ''}`.toLowerCase();
  const observations = [];
  const claims = [];
  const recommendedNextSteps = [];
  const openQuestions = [];

  observations.push({
    text: 'The workspace has enough initial context for a bounded research pass, but conclusions should remain tentative until human review.',
    source: 'workspace packet',
    confidence: 0.74
  });

  if (/call|phone|contact|quote|book|schedule/.test(text)) {
    observations.push({
      text: 'The public presence appears to include direct-contact or conversion language worth inspecting more closely.',
      source: 'research/extracted/homepage.md',
      confidence: 0.68
    });
    claims.push({
      text: 'The conversion path should be treated as an important modernization surface.',
      source: 'research/extracted/homepage.md',
      confidence: 0.66
    });
    recommendedNextSteps.push({
      title: 'Review primary call-to-action clarity',
      rationale: 'If contact or quote language is present, the first improvement should make the next action obvious.'
    });
  }

  if (/local|family|trusted|licensed|insured|years|review/.test(text)) {
    claims.push({
      text: 'Trust and local credibility may be important to preserve in modernization work.',
      source: 'research/extracted/homepage.md',
      confidence: 0.62
    });
    recommendedNextSteps.push({
      title: 'Inventory trust signals',
      rationale: 'Modernization should preserve credible existing proof points rather than flattening the business into generic copy.'
    });
  }

  recommendedNextSteps.push({
    title: 'Prepare one small modernization hypothesis',
    rationale: 'A small, grounded first move is safer than proposing a broad rebuild from limited public context.'
  });
  openQuestions.push('What outcome matters most for this customer: more calls, better leads, easier updates, recruiting, reputation, or operational clarity?');
  openQuestions.push('Is the intended first contact an audit offer, a website refresh offer, or an ongoing digital operator conversation?');

  return { observations, claims, recommendedNextSteps, openQuestions };
}

function providerFor(name) {
  if (!name || name === 'static') return staticProvider;
  throw new Error(`Unknown research provider: ${name}`);
}

export async function runResearchAgent(home, workspaceId, { provider = 'static' } = {}) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'research'), { recursive: true });
  await mkdir(path.join(root, 'reports'), { recursive: true });

  const packet = await buildResearchPacket(root);
  const result = providerFor(provider)(packet);

  for (const observation of result.observations || []) {
    await appendJsonl(path.join(root, 'research', 'observations.jsonl'), {
      id: id('obs'),
      at: now(),
      text: observation.text,
      source: observation.source || 'agent',
      confidence: clampConfidence(observation.confidence)
    });
  }

  for (const claim of result.claims || []) {
    await appendJsonl(path.join(root, 'memory', 'claims.jsonl'), {
      id: id('claim'),
      at: now(),
      text: claim.text,
      source: claim.source || 'agent research',
      confidence: clampConfidence(claim.confidence),
      status: 'active'
    });
  }

  const brief = `# Agent Research Brief\n\nWorkspace: ${record.name || record.slug}\nProvider: ${provider}\nGenerated: ${now()}\n\n## Observations\n\n${(result.observations || []).map((item) => `- ${item.text}\n  - Source: ${item.source || 'agent'}\n  - Confidence: ${Math.round(clampConfidence(item.confidence) * 100)}%`).join('\n') || '- None.'}\n\n## New claims\n\n${(result.claims || []).map((item) => `- ${item.text}\n  - Source: ${item.source || 'agent research'}\n  - Confidence: ${Math.round(clampConfidence(item.confidence) * 100)}%`).join('\n') || '- None.'}\n\n## Recommended next steps\n\n${(result.recommendedNextSteps || []).map((item) => `- **${item.title}** — ${item.rationale}`).join('\n') || '- None.'}\n\n## Open questions\n\n${(result.openQuestions || []).map((question) => `- ${question}`).join('\n') || '- None.'}\n`;

  const artifact = 'reports/agent-research-brief.md';
  await writeFile(path.join(root, artifact), brief, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), {
    id: id('evt'),
    type: 'agent.research.completed',
    at: now(),
    provider,
    observations: result.observations?.length || 0,
    claims: result.claims?.length || 0,
    artifact
  });

  return { ...result, artifact, brief };
}

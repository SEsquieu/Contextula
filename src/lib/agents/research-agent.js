import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { appendJsonl, id, now, readJson, readJsonl } from '../util.js';
import { resolveWorkspace } from '../storage.js';
import { runProviderCommand } from '../provider-command.js';
import { validateProviderResponse } from '../provider-response.js';
import { addClaim } from '../claims.js';
import { defaultOpenClawResearchCommand } from '../providers.js';

function clampConfidence(value, fallback = 0.5) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function researchPrompt(packet) {
  return `# Contextula Semantic Research Task

You are the semantic research provider for Contextula.

Read the bounded workspace packet below and return ONLY valid JSON matching this shape:

\`\`\`json
{
  "observations": [
    { "text": "...", "source": "research/extracted/homepage.md", "confidence": 0.0 }
  ],
  "claims": [
    { "text": "...", "source": "research/extracted/homepage.md", "confidence": 0.0 }
  ],
  "recommendedNextSteps": [
    { "title": "...", "rationale": "..." }
  ],
  "openQuestions": ["..."]
}
\`\`\`

Rules:

- Stay inside the provided packet; do not invent facts.
- Prefer nuanced semantic claims over obvious scrape facts.
- Distinguish business lead-gen sites from personal/project hubs.
- Capture tone, purpose, audience, conversion/navigation intent, and modernization implications.
- Use confidence below 0.75 for inferred intent unless directly supported.
- No outreach, no customer-facing commitments, no external actions.

Packet:

\`\`\`json
${JSON.stringify(packet, null, 2)}
\`\`\`
`;
}

export async function buildResearchPacketForWorkspace(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => []);
  const homepage = await readFile(path.join(root, 'research', 'extracted', 'homepage.md'), 'utf8').catch(() => '');
  return {
    version: 1,
    kind: 'contextula.research.packet',
    generatedAt: now(),
    workspace: {
      id: record.id,
      name: record.name || record.slug,
      type: record.type,
      status: record.status
    },
    profile,
    claims,
    artifacts: { homepage },
    policy: {
      workspaceOnly: true,
      noExternalContact: true,
      readOnlyWeb: true,
      durableWritesByContextulaOnly: true
    },
    objective: 'Build a bounded first-contact modernization research pass from available workspace artifacts.'
  };
}

function staticProvider(packet) {
  const text = `${packet.profile?.name || ''} ${packet.profile?.website || ''} ${packet.artifacts?.homepage || ''}`.toLowerCase();
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

async function rawProviderOutput(provider, packet, options, prompt) {
  if (!provider || provider === 'static') return JSON.stringify(staticProvider(packet), null, 2);
  if (provider === 'json') {
    if (!options.response) throw new Error('JSON provider requires --response <path>');
    return readFile(options.response, 'utf8');
  }
  if (provider === 'openclaw') {
    const command = options.command || defaultOpenClawResearchCommand();
    if (!command) {
      throw new Error('OpenClaw provider requires CONTEXTULA_OPENCLAW_RESEARCH_COMMAND. It should read the research prompt from stdin and write provider JSON to stdout. Run: contextula agent providers');
    }
    return runProviderCommand(command, prompt);
  }
  throw new Error(`Unknown research provider: ${provider}`);
}

export async function writeResearchPacket(home, workspaceId) {
  const { root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'research'), { recursive: true });
  const packet = await buildResearchPacketForWorkspace(home, workspaceId);
  const artifact = 'research/agent-packet.json';
  await writeFile(path.join(root, artifact), `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'agent.packet.exported', at: now(), artifact });
  return { packet, artifact };
}

export async function writeResearchPrompt(home, workspaceId) {
  const { root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'research'), { recursive: true });
  const packet = await buildResearchPacketForWorkspace(home, workspaceId);
  const prompt = researchPrompt(packet);
  const artifact = 'research/agent-prompt.md';
  await writeFile(path.join(root, artifact), prompt, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'agent.prompt.exported', at: now(), artifact });
  return { prompt, artifact };
}

export async function runResearchAgent(home, workspaceId, { provider = 'static', response, command } = {}) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'research'), { recursive: true });
  await mkdir(path.join(root, 'reports'), { recursive: true });

  const packet = await buildResearchPacketForWorkspace(home, workspaceId);
  const prompt = researchPrompt(packet);
  const runId = id('run');
  const runDir = path.join(root, 'research', 'provider-runs', runId);
  const runArtifact = `research/provider-runs/${runId}`;
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, 'packet.json'), `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  await writeFile(path.join(runDir, 'prompt.md'), prompt, 'utf8');

  let raw;
  let result;
  try {
    raw = await rawProviderOutput(provider, packet, { response, command }, prompt);
    await writeFile(path.join(runDir, 'response.raw.json'), raw.replace(/^\uFEFF/, ''), 'utf8');
    result = validateProviderResponse(JSON.parse(raw.replace(/^\uFEFF/, '')));
    await writeFile(path.join(runDir, 'response.normalized.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  } catch (error) {
    await writeFile(path.join(runDir, 'errors.json'), `${JSON.stringify({ message: error.message || String(error), provider, at: now() }, null, 2)}\n`, 'utf8');
    await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'agent.provider.failed', at: now(), provider, run: runArtifact, error: error.message || String(error) });
    throw error;
  }

  for (const observation of result.observations || []) {
    await appendJsonl(path.join(root, 'research', 'observations.jsonl'), {
      id: id('obs'),
      at: now(),
      text: observation.text,
      source: observation.source || 'agent',
      confidence: clampConfidence(observation.confidence),
      providerRun: runArtifact
    });
  }

  const writtenClaims = [];
  let duplicateClaims = 0;
  for (const claim of result.claims || []) {
    const written = await addClaim(root, {
      text: claim.text,
      source: claim.source || 'agent research',
      confidence: clampConfidence(claim.confidence),
      status: 'active',
      metadata: { providerRun: runArtifact }
    });
    writtenClaims.push(written);
    if (written.duplicate) duplicateClaims++;
  }

  const brief = `# Agent Research Brief\n\nWorkspace: ${record.name || record.slug}\nProvider: ${provider}\nProvider run: ${runArtifact}\nGenerated: ${now()}\n\n## Observations\n\n${(result.observations || []).map((item) => `- ${item.text}\n  - Source: ${item.source || 'agent'}\n  - Confidence: ${Math.round(clampConfidence(item.confidence) * 100)}%`).join('\n') || '- None.'}\n\n## New claims\n\n${(result.claims || []).map((item) => `- ${item.text}\n  - Source: ${item.source || 'agent research'}\n  - Confidence: ${Math.round(clampConfidence(item.confidence) * 100)}%`).join('\n') || '- None.'}\n\n## Recommended next steps\n\n${(result.recommendedNextSteps || []).map((item) => `- **${item.title}** — ${item.rationale}`).join('\n') || '- None.'}\n\n## Open questions\n\n${(result.openQuestions || []).map((question) => `- ${question}`).join('\n') || '- None.'}\n`;

  const artifact = 'reports/agent-research-brief.md';
  await writeFile(path.join(root, artifact), brief, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), {
    id: id('evt'),
    type: 'agent.research.completed',
    at: now(),
    provider,
    observations: result.observations?.length || 0,
    claims: writtenClaims.filter((claim) => !claim.duplicate).length,
    duplicateClaims,
    artifact,
    providerRun: runArtifact
  });

  return { ...result, claims: writtenClaims, duplicateClaims, artifact, brief, providerRun: runArtifact };
}

import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { appendJsonl, id, now, readJson, readJsonl, VERSION } from './util.js';
import { resolveWorkspace } from './storage.js';
import { classifyWorkspace } from './classification.js';
import { runProviderCommand } from './provider-command.js';
import { defaultOpenClawDesignCommand } from './providers.js';
import { createApproval } from './approvals.js';

function topClaims(claims, limit = 18) {
  return claims
    .filter((claim) => claim.status === 'active')
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, limit);
}

async function latestVisualEvents(root, type) {
  const events = await readJsonl(path.join(root, 'timeline.jsonl')).catch(() => []);
  return events
    .filter((event) => event.type === type)
    .slice(-6)
    .map((event) => ({ target: event.target, viewport: event.viewport || null, screenshot: event.artifact, snapshot: event.snapshot || null, reference: event.reference || null, note: event.note || null }));
}

export async function buildDesignPacket(home, workspaceId, { variant = 'provider-v1' } = {}) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = topClaims(await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => []));
  const classification = classifyWorkspace(claims);
  const designBrief = await readFile(path.join(root, 'design', 'briefs', 'design-brief.md'), 'utf8').catch(() => '');
  const currentHomepage = await readFile(path.join(root, 'research', 'extracted', 'homepage.md'), 'utf8').catch(() => '');
  return {
    version: 1,
    kind: 'contextula.design.packet',
    generatedAt: now(),
    variant,
    workspace: { id: record.id, name: record.name || record.slug, type: record.type, status: record.status },
    profile,
    classification,
    claims,
    visualSnapshots: await latestVisualEvents(root, 'visual.snapshot.captured'),
    visualReferences: await latestVisualEvents(root, 'visual.reference.added'),
    artifacts: {
      designBrief: designBrief.slice(0, 12000),
      currentHomepage: currentHomepage.slice(0, 12000)
    },
    policy: {
      workspaceOnly: true,
      noExternalContact: true,
      customerFacingRequiresApproval: true,
      durableWritesByContextulaOnly: true
    },
    objective: 'Generate a single-file static homepage HTML mock that preserves semantic and visual continuity while improving clarity.'
  };
}

export function designPrompt(packet) {
  return `# Contextula Design Generation Task\n\nYou are the design generation provider for Contextula.\n\nReturn ONLY valid JSON matching this shape:\n\n\`\`\`json\n{\n  "html": "<!doctype html>...single-file static HTML...",\n  "rationale": "Short rationale grounded in packet claims and visual context."\n}\n\`\`\`\n\nRules:\n\n- Stay inside the provided packet. Do not invent credentials, reviews, guarantees, or external facts.\n- Generate a complete single-file HTML document with embedded CSS.\n- Preserve visual identity from visual claims/snapshots.\n- Avoid generic SaaS/startup landing-page patterns unless the packet supports them.\n- Do not include external scripts, tracking, forms that submit, or remote assets.\n- Customer-facing presentation still requires Contextula approval.\n\nPacket:\n\n\`\`\`json\n${JSON.stringify(packet, null, 2)}\n\`\`\`\n`;
}

function validateDesignResponse(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('Design provider response must be an object');
  if (!response.html || typeof response.html !== 'string') throw new Error('Design provider response field "html" must be a non-empty string');
  if (!/<!doctype html/i.test(response.html) && !/<html/i.test(response.html)) throw new Error('Design provider html must look like a complete HTML document');
  return { html: response.html, rationale: typeof response.rationale === 'string' ? response.rationale : '' };
}

async function rawDesignOutput(provider, packet, { response, command }, prompt) {
  if (provider === 'json') {
    if (!response) throw new Error('JSON design provider requires --response <path>');
    return readFile(response, 'utf8');
  }
  if (provider === 'openclaw') {
    const providerCommand = command || defaultOpenClawDesignCommand();
    if (!providerCommand) throw new Error('OpenClaw design provider requires CONTEXTULA_OPENCLAW_DESIGN_COMMAND or CONTEXTULA_OPENCLAW_COMMAND.');
    return runProviderCommand(providerCommand, prompt);
  }
  throw new Error(`Unknown design provider: ${provider}`);
}

export async function runDesignHtmlProvider(home, workspaceId, { provider = 'json', response, command, variant = 'provider-v1' } = {}) {
  const { root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'design', 'provider-runs'), { recursive: true });
  await mkdir(path.join(root, 'design', 'mocks'), { recursive: true });
  const packet = await buildDesignPacket(home, workspaceId, { variant });
  const prompt = designPrompt(packet);
  const runId = id('drun');
  const runDir = path.join(root, 'design', 'provider-runs', runId);
  const runArtifact = `design/provider-runs/${runId}`;
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, 'packet.json'), `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  await writeFile(path.join(runDir, 'prompt.md'), prompt, 'utf8');

  let result;
  try {
    const raw = await rawDesignOutput(provider, packet, { response, command }, prompt);
    await writeFile(path.join(runDir, 'response.raw.json'), raw.replace(/^\uFEFF/, ''), 'utf8');
    result = validateDesignResponse(JSON.parse(raw.replace(/^\uFEFF/, '')));
    await writeFile(path.join(runDir, 'response.normalized.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  } catch (error) {
    await writeFile(path.join(runDir, 'errors.json'), `${JSON.stringify({ message: error.message || String(error), provider, at: now() }, null, 2)}\n`, 'utf8');
    await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'design.provider.failed', at: now(), provider, run: runArtifact, error: error.message || String(error) });
    throw error;
  }

  const artifact = `design/mocks/homepage-${variant}.html`;
  await writeFile(path.join(root, artifact), result.html, 'utf8');
  await writeFile(path.join(runDir, 'rationale.md'), result.rationale || '(none)', 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'design.html.provider_generated', at: now(), provider, artifact, providerRun: runArtifact, variant, classification: packet.classification.kind });
  const approvalResult = await createApproval(root, {
    id: id('appr'),
    version: VERSION,
    type: 'design.review',
    status: 'pending',
    requestedAt: now(),
    requestedBy: 'contextula-design-provider',
    artifact,
    reason: 'Provider-backed HTML design mocks require review before customer-facing presentation or implementation.'
  });
  return { artifact, html: result.html, rationale: result.rationale, providerRun: runArtifact, approval: approvalResult.approval };
}

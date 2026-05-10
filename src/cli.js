#!/usr/bin/env node
import { mkdir, readFile, writeFile, appendFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const VERSION = 1;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) flags[key] = true;
      else flags[key] = argv[++i];
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function defaultHome(flags) {
  return path.resolve(flags.home || process.env.CONTEXTULA_HOME || path.join(os.homedir(), '.contextula'));
}

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function slugify(value) {
  return String(value || 'workspace')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'workspace';
}

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function readJson(file, fallback) {
  if (!(await exists(file))) return fallback;
  return JSON.parse(await readFile(file, 'utf8'));
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function appendJsonl(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(data)}\n`, 'utf8');
}

async function ensureHome(home) {
  await mkdir(home, { recursive: true });
  await mkdir(path.join(home, 'workspaces', 'customers'), { recursive: true });
  await mkdir(path.join(home, 'workspaces', 'projects'), { recursive: true });
  await mkdir(path.join(home, 'indexes'), { recursive: true });
  await mkdir(path.join(home, 'cache'), { recursive: true });
  await mkdir(path.join(home, 'secrets'), { recursive: true });

  const configPath = path.join(home, 'config.json');
  if (!(await exists(configPath))) {
    await writeJson(configPath, { version: VERSION, createdAt: now() });
  }

  const registryPath = path.join(home, 'registry.json');
  if (!(await exists(registryPath))) {
    await writeJson(registryPath, { version: VERSION, workspaces: [] });
  }
}

async function loadRegistry(home) {
  await ensureHome(home);
  return readJson(path.join(home, 'registry.json'), { version: VERSION, workspaces: [] });
}

async function saveRegistry(home, registry) {
  await writeJson(path.join(home, 'registry.json'), registry);
}

function workspacePath(home, type, workspaceId) {
  const plural = type === 'customer' ? 'customers' : 'projects';
  return path.join(home, 'workspaces', plural, workspaceId);
}

async function initWorkspaceDirs(root) {
  const dirs = [
    'memory/summaries',
    'research/extracted',
    'research/snapshots',
    'plans',
    'drafts',
    'approvals',
    'reports',
    'assets',
    'builds',
    '.contextula'
  ];
  await Promise.all(dirs.map((dir) => mkdir(path.join(root, dir), { recursive: true })));
}

async function createCustomer(home, input) {
  await ensureHome(home);
  const workspaceId = id('cus');
  const slug = slugify(input.name);
  const root = workspacePath(home, 'customer', workspaceId);
  await initWorkspaceDirs(root);

  const workspace = {
    version: VERSION,
    id: workspaceId,
    type: 'customer',
    slug,
    name: input.name,
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
    source: input.source || 'manual'
  };

  const profile = {
    version: VERSION,
    workspaceId,
    name: input.name,
    website: input.website || null,
    category: null,
    serviceArea: [],
    contact: {},
    positioning: {},
    currentDigitalPresence: {},
    openQuestions: [],
    updatedAt: now()
  };

  await writeJson(path.join(root, 'workspace.json'), workspace);
  await writeJson(path.join(root, 'profile.json'), profile);
  await writeFile(path.join(root, 'timeline.jsonl'), '', 'utf8');
  await writeFile(path.join(root, 'memory', 'claims.jsonl'), '', 'utf8');
  await writeJson(path.join(root, '.contextula', 'policy.json'), {
    version: VERSION,
    role: 'customer-workspace-agent',
    filesystem: { allow: ['./**'], deny: ['../**'] },
    approvalsRequired: ['outreach.send', 'proposal.send', 'scope.change', 'pricing.change', 'deploy', 'billing', 'external.write']
  });

  await appendJsonl(path.join(root, 'timeline.jsonl'), {
    id: id('evt'),
    type: 'customer.created',
    at: now(),
    source: input.source || 'manual',
    name: input.name,
    website: input.website || null
  });

  const registry = await loadRegistry(home);
  registry.workspaces.push({
    id: workspaceId,
    type: 'customer',
    slug,
    name: input.name,
    path: path.relative(home, root),
    status: 'active',
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt
  });
  await saveRegistry(home, registry);

  return { workspaceId, root };
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function matchFirst(html, regex) {
  const match = html.match(regex);
  return match ? stripHtml(match[1]).slice(0, 300) : null;
}

function collectMatches(html, regex, limit = 20) {
  return [...html.matchAll(regex)].map((m) => stripHtml(m[1])).filter(Boolean).slice(0, limit);
}

function inferClaims({ profile, page }) {
  const text = `${page.title || ''} ${page.description || ''} ${page.headings.join(' ')} ${page.bodySample}`.toLowerCase();
  const claims = [];
  const push = (claimText, confidence, source = 'research/extracted/homepage.md') => claims.push({
    id: id('claim'),
    at: now(),
    text: claimText,
    source,
    confidence,
    status: 'active'
  });

  if (profile.website) push(`Customer has a public website at ${profile.website}.`, 0.95);
  if (page.title) push(`The homepage title is "${page.title}".`, 0.9);
  if (/call|phone|tel:|contact/.test(text)) push('The public presence appears to emphasize direct contact as a conversion path.', 0.66);
  if (/emergency|24\/7|24 hour|same day|urgent/.test(text)) push('Urgency or fast response may be part of the business positioning.', 0.64);
  if (/family|local|trusted|licensed|insured|years/.test(text)) push('Trust/local credibility signals appear important to the business messaging.', 0.62);
  if (/service|repair|install|maintenance/.test(text)) push('The business likely sells service-oriented work where clear service pages and CTAs matter.', 0.58);
  if (page.links.length > 12) push('The website has enough navigation/link structure to warrant a deeper crawl in a later research pass.', 0.55);

  return claims;
}

async function researchHomepage(root, profile) {
  const url = profile.website;
  if (!url) return { page: null, claims: [] };

  const startedAt = now();
  let response;
  try {
    response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Contextula/0.1 research snapshot' } });
  } catch (error) {
    await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'research.fetch.failed', at: now(), url, error: String(error.message || error) });
    return { page: null, claims: [] };
  }

  const html = await response.text();
  const title = matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = matchFirst(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) ||
    matchFirst(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
  const headings = collectMatches(html, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, 20);
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ href: m[1], text: stripHtml(m[2]).slice(0, 100) }))
    .filter((link) => link.href && !link.href.startsWith('#'))
    .slice(0, 40);
  const bodyText = stripHtml(html);

  const page = {
    url: response.url || url,
    status: response.status,
    fetchedAt: startedAt,
    title,
    description,
    headings,
    links,
    bodySample: bodyText.slice(0, 4000)
  };

  await appendJsonl(path.join(root, 'research', 'sources.jsonl'), {
    id: id('src'),
    type: 'website.homepage',
    at: now(),
    url,
    finalUrl: page.url,
    status: page.status,
    artifact: 'research/extracted/homepage.md'
  });

  const md = [`# Homepage Snapshot`, ``, `URL: ${page.url}`, `Status: ${page.status}`, `Fetched: ${page.fetchedAt}`, ``, `## Title`, page.title || '(none)', ``, `## Description`, page.description || '(none)', ``, `## Headings`, ...page.headings.map((h) => `- ${h}`), ``, `## Links`, ...page.links.map((l) => `- [${l.text || l.href}](${l.href})`), ``, `## Body Sample`, page.bodySample].join('\n');
  await writeFile(path.join(root, 'research', 'extracted', 'homepage.md'), `${md}\n`, 'utf8');

  await appendJsonl(path.join(root, 'timeline.jsonl'), {
    id: id('evt'),
    type: 'research.homepage.captured',
    at: now(),
    url,
    status: page.status,
    artifact: 'research/extracted/homepage.md'
  });

  const claims = inferClaims({ profile, page });
  for (const claim of claims) await appendJsonl(path.join(root, 'memory', 'claims.jsonl'), claim);
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'claims.created', at: now(), count: claims.length });

  return { page, claims };
}

async function buildPlan(root, profile, researchResult) {
  const claims = researchResult.claims || [];
  const claimLines = claims.map((claim) => `- ${claim.text} (${Math.round(claim.confidence * 100)}% confidence)`).join('\n') || '- No claims yet.';
  const website = profile.website || 'No website provided';
  const plan = `# Initial Modernization Map\n\nCustomer: ${profile.name}\nWebsite: ${website}\nGenerated: ${now()}\n\n## Current snapshot\n\n${claimLines}\n\n## Recommended next moves\n\n1. **Confirm identity and business goals**\n   - Evidence: initial intake is thin by design.\n   - Value: avoids building on a wrong assumption.\n   - Approval: internal only.\n\n2. **Deepen public presence research**\n   - Evidence: homepage snapshot is only the first pass.\n   - Value: finds subtleties in services, tone, trust signals, and conversion paths.\n   - Approval: not required for public read-only research.\n\n3. **Prepare a human-reviewed modernization brief**\n   - Evidence: early claims need review before outreach.\n   - Value: turns observations into a small, credible proposal.\n   - Approval: required before any customer-facing send.\n\n4. **Draft first outreach or internal kickoff note**\n   - Evidence: Contextula can draft from the bounded workspace.\n   - Value: demonstrates continuity while preserving human control.\n   - Approval: required before external contact.\n\n## Open questions\n\n- What is the intended first offer: audit, website refresh, ongoing operator, or consulting engagement?\n- What contact channel is appropriate?\n- What business outcome matters most to this customer?\n`;
  await writeFile(path.join(root, 'plans', 'initial-modernization-map.md'), plan, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'plan.generated', at: now(), artifact: 'plans/initial-modernization-map.md' });
}

async function createApproval(root) {
  const approval = {
    id: id('appr'),
    version: VERSION,
    type: 'outreach.send',
    status: 'pending',
    requestedAt: now(),
    requestedBy: 'contextula-intake',
    artifact: 'drafts/intro-outreach.md',
    reason: 'External customer contact requires human approval.'
  };
  await writeFile(path.join(root, 'drafts', 'intro-outreach.md'), `# Intro Outreach Draft\n\nThis is a placeholder draft. Review the research snapshot and modernization map before writing customer-facing copy.\n`, 'utf8');
  await writeJson(path.join(root, 'approvals', `${approval.id}.json`), approval);
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'approval.requested', at: now(), approvalId: approval.id, action: approval.type, artifact: approval.artifact });
}

async function intakeCustomer(home, flags) {
  if (!flags.name) throw new Error('Missing --name');
  const { workspaceId, root } = await createCustomer(home, { name: flags.name, website: flags.website, source: flags.source || 'manual' });
  const profilePath = path.join(root, 'profile.json');
  const profile = await readJson(profilePath, {});
  const researchResult = await researchHomepage(root, profile);
  await buildPlan(root, profile, researchResult);
  await createApproval(root);
  profile.currentDigitalPresence = {
    websiteSnapshotCaptured: Boolean(researchResult.page),
    homepageTitle: researchResult.page?.title || null,
    homepageStatus: researchResult.page?.status || null,
    primaryResearchArtifact: researchResult.page ? 'research/extracted/homepage.md' : null
  };
  profile.updatedAt = now();
  await writeJson(profilePath, profile);
  console.log(`Created customer workspace ${workspaceId}`);
  console.log(root);
}

async function listWorkspaces(home) {
  const registry = await loadRegistry(home);
  if (registry.workspaces.length === 0) {
    console.log('No workspaces yet.');
    return;
  }
  for (const ws of registry.workspaces) {
    console.log(`${ws.id}\t${ws.type}\t${ws.status}\t${ws.name || ws.slug}\t${ws.path}`);
  }
}

async function showWorkspace(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const profile = await readJson(path.join(root, 'profile.json'), {});
  console.log(JSON.stringify({ record, profile, root }, null, 2));
}

async function resolveWorkspace(home, workspaceId) {
  const registry = await loadRegistry(home);
  const record = registry.workspaces.find((ws) => ws.id === workspaceId || ws.slug === workspaceId);
  if (!record) throw new Error(`Workspace not found: ${workspaceId}`);
  return { record, root: path.join(home, record.path) };
}

async function listApprovals(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const approvalsDir = path.join(root, 'approvals');
  const files = (await readdir(approvalsDir)).filter((file) => file.endsWith('.json'));
  if (files.length === 0) {
    console.log(`No approvals for ${record.name || record.slug}.`);
    return;
  }
  for (const file of files) {
    const approval = await readJson(path.join(approvalsDir, file), {});
    console.log(`${approval.id}\t${approval.status}\t${approval.type}\t${approval.artifact || ''}`);
  }
}

async function setApprovalStatus(home, workspaceId, approvalId, status) {
  const { root } = await resolveWorkspace(home, workspaceId);
  const approvalsDir = path.join(root, 'approvals');
  const files = (await readdir(approvalsDir)).filter((file) => file.endsWith('.json'));
  const file = files.find((candidate) => candidate === `${approvalId}.json` || candidate.startsWith(`${approvalId}.`));
  if (!file) throw new Error(`Approval not found: ${approvalId}`);
  const approvalPath = path.join(approvalsDir, file);
  const approval = await readJson(approvalPath, {});
  approval.status = status;
  approval.resolvedAt = now();
  await writeJson(approvalPath, approval);
  await appendJsonl(path.join(root, 'timeline.jsonl'), {
    id: id('evt'),
    type: `approval.${status}`,
    at: now(),
    approvalId: approval.id,
    action: approval.type,
    artifact: approval.artifact || null
  });
  console.log(`${status}: ${approval.id}`);
}

async function readJsonl(file) {
  if (!(await exists(file))) return [];
  const content = await readFile(file, 'utf8');
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function generateReport(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const timeline = await readJsonl(path.join(root, 'timeline.jsonl'));
  const claims = await readJsonl(path.join(root, 'memory', 'claims.jsonl'));
  const approvalFiles = (await readdir(path.join(root, 'approvals'))).filter((file) => file.endsWith('.json'));
  const approvals = [];
  for (const file of approvalFiles) approvals.push(await readJson(path.join(root, 'approvals', file), {}));

  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending');
  const latestEvents = timeline.slice(-8).map((event) => `- ${event.at} — ${event.type}`).join('\n') || '- No events yet.';
  const activeClaims = claims.filter((claim) => claim.status === 'active');
  const claimLines = activeClaims.slice(0, 10).map((claim) => `- ${claim.text} (${Math.round((claim.confidence || 0) * 100)}%)`).join('\n') || '- No active claims yet.';
  const approvalLines = pendingApprovals.map((approval) => `- ${approval.id}: ${approval.type} → ${approval.artifact || '(no artifact)'}`).join('\n') || '- No pending approvals.';

  const report = `# Workspace Status Report\n\nWorkspace: ${record.name || record.slug}\nID: ${record.id}\nGenerated: ${now()}\n\n## Profile\n\n- Website: ${profile.website || '(none)'}\n- Status: ${record.status}\n- Homepage captured: ${profile.currentDigitalPresence?.websiteSnapshotCaptured ? 'yes' : 'no'}\n\n## Active claims\n\n${claimLines}\n\n## Pending approvals\n\n${approvalLines}\n\n## Recent timeline\n\n${latestEvents}\n`;
  await writeFile(path.join(root, 'reports', 'current-status.md'), report, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'report.generated', at: now(), artifact: 'reports/current-status.md' });
  console.log(report);
}

function help() {
  console.log(`Contextula ${VERSION}\n\nCommands:\n  init [--home <path>]\n  intake customer --name <name> [--website <url>] [--home <path>]\n  list [--home <path>]\n  show <workspace-id-or-slug> [--home <path>]\n  approvals <workspace-id-or-slug> [--home <path>]\n  approve <workspace-id-or-slug> <approval-id> [--home <path>]\n  reject <workspace-id-or-slug> <approval-id> [--home <path>]\n  report <workspace-id-or-slug> [--home <path>]\n\nEnvironment:\n  CONTEXTULA_HOME overrides the default ~/.contextula data home.\n`);
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help || positional.length === 0) return help();

  const home = defaultHome(flags);
  const [cmd, subcmd, maybeId] = positional;

  if (cmd === 'init') {
    await ensureHome(home);
    console.log(`Contextula home ready: ${home}`);
    return;
  }
  if (cmd === 'intake' && subcmd === 'customer') return intakeCustomer(home, flags);
  if (cmd === 'list') return listWorkspaces(home);
  if (cmd === 'show') return showWorkspace(home, subcmd || maybeId);
  if (cmd === 'approvals') return listApprovals(home, subcmd);
  if (cmd === 'approve') return setApprovalStatus(home, subcmd, maybeId, 'approved');
  if (cmd === 'reject') return setApprovalStatus(home, subcmd, maybeId, 'rejected');
  if (cmd === 'report') return generateReport(home, subcmd);

  help();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Contextula error: ${error.message || error}`);
  process.exitCode = 1;
});

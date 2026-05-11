import path from 'node:path';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { appendJsonl, id, now, readJson, readJsonl, VERSION, writeJson } from './util.js';
import { resolveWorkspace } from './storage.js';
import { classifyWorkspace } from './classification.js';
import { createApproval } from './approvals.js';
import { addClaim } from './claims.js';
import { runProviderCommand } from './provider-command.js';
import { defaultOpenClawSiteCommand } from './providers.js';

function topClaims(claims, limit = 16) {
  return claims
    .filter((claim) => claim.status === 'active')
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, limit);
}

function page(pathname, title, purpose, { nav = true, status = 'planned', opsGoal = null, content = [] } = {}) {
  return { path: pathname, title, purpose, nav, status, opsGoal, content };
}

function projectHubPlan({ profile, classification }) {
  return {
    routes: [
      page('/', 'Home', 'Orient visitors around the project hub, live destinations, and current signal/status.', {
        status: 'core',
        opsGoal: 'Route visitors to live project destinations and communicate what is active vs planned.',
        content: ['signal hero', 'broadcast status', 'featured live project', 'incoming channels']
      }),
      page('/projects/', 'Projects', 'List live and planned project destinations with clear status labels.', {
        status: 'core',
        opsGoal: 'Increase qualified outbound clicks to active project nodes.',
        content: ['live projects', 'experiments', 'archives or future nodes']
      }),
      page('/about/', 'About', 'Explain the maker/site identity without turning the hub into a service-business funnel.', {
        status: 'core',
        opsGoal: 'Build identity continuity and visitor understanding.',
        content: ['about the maker', 'why this hub exists', 'what updates to expect']
      }),
      page('/notes/', 'Notes', 'Future writing/dev-log lane for build notes and project updates.', {
        status: 'planned',
        opsGoal: 'Create a durable content lane for updates and social/campaign references.',
        content: ['dev logs', 'project notes', 'release/update posts']
      })
    ],
    globalNav: ['Home', 'Projects', 'About', 'Notes'],
    externalDestinations: [
      { label: 'Music node', url: 'https://music.grinningfrog.com', role: 'live project destination' },
      { label: 'Blog node', url: 'https://blog.grinningfrog.com', role: 'planned writing lane' },
      { label: 'Lab node', url: 'https://lab.grinningfrog.com', role: 'planned prototype lane' }
    ],
    designSystem: {
      intent: 'Preserve the existing retro terminal/project-transmission identity across all pages.',
      components: ['terminal header', 'broadcast status panel', 'boxed content module', 'project node card', 'footer provenance strip'],
      opsHooks: ['stable route ids', 'outbound project click events', 'section ids for content updates']
    },
    assumptions: [
      'Notes/blog/lab routes may remain planned or redirect externally until content exists.',
      `${profile.name || 'The site'} should stay a project hub, not a service-business conversion funnel.`,
      classification.primaryGoal
    ]
  };
}

function serviceBusinessPlan({ classification }) {
  return {
    routes: [
      page('/', 'Home', 'Explain the business, establish credibility, and route primary visitor intent.', {
        status: 'core', opsGoal: 'Drive qualified quote/contact actions.', content: ['hero', 'trust strip', 'top services', 'primary CTA']
      }),
      page('/services/', 'Services', 'Describe services clearly enough for visitors to self-select.', {
        status: 'core', opsGoal: 'Increase service-specific CTA clicks.', content: ['service cards', 'service detail sections', 'CTA band']
      }),
      page('/about/', 'About', 'Support trust with grounded story and proof points.', {
        status: 'core', opsGoal: 'Improve credibility before conversion.', content: ['story', 'credentials if verified', 'service area']
      }),
      page('/contact/', 'Contact', 'Provide the lowest-friction conversion path.', {
        status: 'core', opsGoal: 'Capture calls/forms/bookings with clear measurement hooks.', content: ['phone', 'form/booking hook', 'response expectations']
      })
    ],
    globalNav: ['Home', 'Services', 'About', 'Contact'],
    externalDestinations: [],
    designSystem: {
      intent: 'Keep pages consistent, credible, and conversion-oriented without inventing proof points.',
      components: ['global header', 'service card', 'trust module', 'CTA band', 'footer contact block'],
      opsHooks: ['phone tap event', 'form start/submit events', 'service card click events']
    },
    assumptions: [classification.primaryGoal, 'Customer-facing claims and integrations require approval before launch.']
  };
}

function generalPresencePlan({ classification }) {
  return {
    routes: [
      page('/', 'Home', 'Clarify identity, audience, and the most useful next action.', { status: 'core', opsGoal: 'Measure primary exploration path.', content: ['hero', 'highlights', 'next steps'] }),
      page('/about/', 'About', 'Explain who/what this presence represents.', { status: 'planned', opsGoal: 'Improve identity clarity.', content: ['context', 'purpose', 'contact or follow-up path'] })
    ],
    globalNav: ['Home', 'About'],
    externalDestinations: [],
    designSystem: {
      intent: 'Stay neutral until stronger claims define the site type.',
      components: ['global header', 'highlight module', 'next-step block'],
      opsHooks: ['primary navigation events', 'CTA click events']
    },
    assumptions: [classification.primaryGoal, 'More audience/purpose claims should be captured before expanding the site.']
  };
}

export async function generateSitePlan(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'site', 'pages'), { recursive: true });
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = topClaims(await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => []));
  const classification = classifyWorkspace(claims);
  const base = classification.kind === 'personal-project-hub'
    ? projectHubPlan({ profile, classification })
    : classification.kind === 'service-business'
      ? serviceBusinessPlan({ profile, classification })
      : generalPresencePlan({ profile, classification });

  const plan = {
    version: 1,
    generatedAt: now(),
    workspaceId: record.id,
    workspaceName: record.name || record.slug,
    classification: { kind: classification.kind, label: classification.label, primaryGoal: classification.primaryGoal },
    ...base,
    approval: { required: true, type: 'site.plan.review' }
  };

  await writeJson(path.join(root, 'site', 'sitemap.json'), plan);
  await writeJson(path.join(root, 'site', 'design-system.json'), { version: 1, generatedAt: now(), workspaceId: record.id, ...plan.designSystem });
  for (const route of plan.routes) {
    const name = route.path === '/' ? 'home' : route.path.replace(/^\//, '').replace(/\/$/, '').replace(/\//g, '-');
    await writeJson(path.join(root, 'site', 'pages', `${name}.json`), route);
  }

  const md = `# Site Plan\n\nWorkspace: ${plan.workspaceName}\nClassification: ${plan.classification.label}\nGenerated: ${plan.generatedAt}\n\n## Global navigation\n\n${plan.globalNav.map((item) => `- ${item}`).join('\n')}\n\n## Routes\n\n${plan.routes.map((route) => `### ${route.path} — ${route.title}\n\n- Status: ${route.status}\n- Purpose: ${route.purpose}\n- Ops goal: ${route.opsGoal || '(none)'}\n- Content: ${route.content.join(', ') || '(none)'}`).join('\n\n')}\n\n## External destinations\n\n${plan.externalDestinations.map((dest) => `- ${dest.label}: ${dest.url} (${dest.role})`).join('\n') || '- None.'}\n\n## Design system intent\n\n${plan.designSystem.intent}\n\n## Assumptions\n\n${plan.assumptions.map((item) => `- ${item}`).join('\n') || '- None.'}\n`;
  await writeFile(path.join(root, 'site', 'site-plan.md'), md, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'site.plan.generated', at: now(), artifact: 'site/sitemap.json', routes: plan.routes.length, classification: classification.kind });
  const approvalResult = await createApproval(root, {
    id: id('appr'),
    version: VERSION,
    type: 'site.plan.review',
    status: 'pending',
    requestedAt: now(),
    requestedBy: 'contextula-site',
    artifact: 'site/sitemap.json',
    reason: 'Site plans require review before multi-page build generation or customer-facing use.'
  });
  return { plan, artifacts: ['site/sitemap.json', 'site/design-system.json', 'site/site-plan.md'], approval: approvalResult.approval };
}

export async function buildSitePacket(home, workspaceId, { variant = 'site-provider-v1' } = {}) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = topClaims(await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => []), 24);
  const classification = classifyWorkspace(claims);
  const sitePlan = await readJson(path.join(root, 'site', 'sitemap.json'), null);
  const designSystem = await readJson(path.join(root, 'site', 'design-system.json'), null);
  const preferences = await readJson(path.join(root, 'memory', 'preferences.json'), null);
  const critiqueLearning = await readJson(path.join(root, 'site', 'critique-learning.json'), null);
  const latestChangeBrief = await readLatestChangeBrief(root);
  const build = await latestBuild(root);
  const latestCritique = build ? await readJson(path.join(root, build.root || `builds/${build.directory || build.id}`, 'contextula', 'site-critique.json'), null) : null;
  return {
    version: 1,
    kind: 'contextula.site.packet',
    generatedAt: now(),
    variant,
    workspace: { id: record.id, name: record.name || record.slug, type: record.type, status: record.status },
    profile,
    classification,
    claims,
    preferences,
    sitePlan,
    designSystem,
    latestBuild: build ? { id: build.id, root: build.root || `builds/${build.directory || build.id}`, createdAt: build.createdAt, routes: build.routes || [] } : null,
    changeControl: latestChangeBrief ? { artifact: latestChangeBrief.artifact, requestedAt: latestChangeBrief.requestedAt, requestedChange: latestChangeBrief.requestedChange, mustPreserve: latestChangeBrief.mustPreserve, mustChange: latestChangeBrief.mustChange, regenRisks: latestChangeBrief.regenRisks } : null,
    critiqueLearning,
    latestCritique: latestCritique ? { artifact: `${build.root || `builds/${build.directory || build.id}`}/contextula/site-critique.json`, verdict: latestCritique.verdict, score: latestCritique.score, findings: latestCritique.findings || [], strengths: latestCritique.strengths || [] } : null,
    policy: {
      workspaceOnly: true,
      noExternalContact: true,
      customerFacingRequiresApproval: true,
      durableWritesByContextulaOnly: true,
      hostingIsExternal: true
    },
    objective: 'Plan or generate a coherent multi-page static site package using the workspace sitemap, grounded claims, and critique-learning signals.'
  };
}

export async function generateSiteChangeBrief(home, workspaceId, { request, preserve, change } = {}) {
  if (!request) throw new Error('Missing --request');
  const { record, root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'site', 'change-briefs'), { recursive: true });
  const profile = await readJson(path.join(root, 'profile.json'), {});
  const claims = topClaims(await readJsonl(path.join(root, 'memory', 'claims.jsonl')).catch(() => []), 24);
  const classification = classifyWorkspace(claims);
  const sitePlan = await readJson(path.join(root, 'site', 'sitemap.json'), null);
  const designSystem = await readJson(path.join(root, 'site', 'design-system.json'), null);
  const critiqueLearning = await readJson(path.join(root, 'site', 'critique-learning.json'), null);
  const build = await latestBuild(root);
  const briefId = id('change');
  const artifact = `site/change-briefs/${briefId}.json`;

  const externalDestinations = sitePlan?.externalDestinations || [];
  const routePaths = (sitePlan?.routes || []).map((route) => route.path);
  const highConfidenceFacts = claims.filter((claim) => (claim.confidence || 0) >= 0.85).slice(0, 10).map((claim) => claim.text);
  const preserveItems = [
    `Preserve workspace classification: ${classification.label}.`,
    sitePlan?.globalNav?.length ? `Preserve global navigation labels unless the request explicitly changes navigation: ${sitePlan.globalNav.join(', ')}.` : null,
    routePaths.length ? `Preserve existing route paths unless explicitly changed: ${routePaths.join(', ')}.` : null,
    externalDestinations.length ? `Preserve known external destinations as clickable routes: ${externalDestinations.map((dest) => `${dest.label} -> ${dest.url}`).join('; ')}.` : null,
    designSystem?.intent ? `Preserve design intent: ${designSystem.intent}` : null,
    critiqueLearning?.verdict === 'ready-for-review' ? 'Preserve critique-proven strengths from the latest ready-for-review build.' : null,
    ...highConfidenceFacts.map((fact) => `Preserve grounded fact: ${fact}`),
    preserve ? `User-specified preserve rule: ${preserve}` : null
  ].filter(Boolean);

  const changeItems = [
    `Implement requested change: ${request}`,
    change ? `User-specified change target: ${change}` : null
  ].filter(Boolean);

  const brief = {
    version: 1,
    id: briefId,
    kind: 'contextula.site.change-brief',
    requestedAt: now(),
    workspaceId: record.id,
    workspaceName: record.name || record.slug,
    profileName: profile.name || null,
    classification: { kind: classification.kind, label: classification.label, primaryGoal: classification.primaryGoal },
    requestedChange: request,
    mustPreserve: preserveItems,
    mustChange: changeItems,
    regenRisks: [
      'Do not rewrite unrelated body copy, button labels, route paths, or page hierarchy just because a provider is regenerating HTML.',
      'Do not drop known active external routes or convert them into non-clickable status text.',
      'Do not change approved visual identity or classification unless the request explicitly requires it.',
      'Prefer the smallest coherent diff over full-site reinvention.'
    ],
    providerInstructions: [
      'Treat this as change-control, not a blank-page generation task.',
      'Before regenerating, identify the minimal affected pages/sections.',
      'Carry forward stable copy, nav, labels, section ids, and CTA names outside the requested change.',
      'If a requested change conflicts with mustPreserve items, surface the conflict in approvalNotes instead of silently overriding.'
    ],
    context: {
      sitePlan: sitePlan ? 'site/sitemap.json' : null,
      designSystem: designSystem ? 'site/design-system.json' : null,
      latestBuild: build ? { id: build.id, root: build.root || `builds/${build.directory || build.id}`, createdAt: build.createdAt } : null,
      critiqueLearning: critiqueLearning ? 'site/critique-learning.json' : null
    },
    approval: { required: true, type: 'site.change.review' }
  };

  await writeJson(path.join(root, artifact), brief);
  const md = `# Site Change Brief\n\nWorkspace: ${brief.workspaceName}\nRequested: ${brief.requestedAt}\n\n## Requested change\n\n${brief.requestedChange}\n\n## Must change\n\n${brief.mustChange.map((item) => `- ${item}`).join('\n')}\n\n## Must preserve\n\n${brief.mustPreserve.map((item) => `- ${item}`).join('\n')}\n\n## Regeneration risks\n\n${brief.regenRisks.map((item) => `- ${item}`).join('\n')}\n\n## Provider instructions\n\n${brief.providerInstructions.map((item) => `- ${item}`).join('\n')}\n`;
  const mdArtifact = `site/change-briefs/${briefId}.md`;
  await writeFile(path.join(root, mdArtifact), md, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'site.change.briefed', at: now(), artifact, request });
  const approvalResult = await createApproval(root, {
    id: id('appr'),
    version: VERSION,
    type: 'site.change.review',
    status: 'pending',
    requestedAt: now(),
    requestedBy: 'contextula-site-change',
    artifact,
    reason: 'Regeneration change briefs require review so providers know what must change and what must stay stable.'
  });
  return { brief, artifacts: [artifact, mdArtifact], approval: approvalResult.approval };
}

export function sitePrompt(packet) {
  return `# Contextula Multi-Page Site Task

You are a bounded site planning/build provider for Contextula.

Use ONLY the packet below. Do not invent credentials, reviews, guarantees, products, services, contact details, or external facts.

Return ONLY valid JSON matching this shape:

\`\`\`json
{
  "summary": "Short rationale grounded in the packet.",
  "sitemap": {
    "routes": [
      { "path": "/", "title": "Home", "purpose": "...", "status": "core", "opsGoal": "...", "content": [] }
    ],
    "globalNav": []
  },
  "designSystem": {
    "intent": "...",
    "components": [],
    "opsHooks": []
  },
  "pages": [
    { "path": "/", "html": "<!doctype html>...complete page HTML...", "ops": { "sections": [], "suggestedEvents": [], "contentSlots": [] } }
  ],
  "assumptions": [],
  "approvalNotes": []
}
\`\`\`

Rules:

- Preserve the workspace classification and primary goal unless the packet contains strong contradictory evidence.
- Use preferences/feedback memory as anti-drift guidance; preserve accepted brand voice and avoid rejected directions.
- Use critiqueLearning/latestCritique as reinforcement: avoid repeating findings and preserve proven strengths.
- If changeControl is present, obey it as the regeneration contract: implement mustChange, preserve mustPreserve, and avoid unrelated copy/nav/CTA drift.
- Keep pages internally coherent: shared nav, consistent design language, stable route paths, stable section ids.
- Do not add external scripts, remote assets, tracking pixels, or real form submissions.
- Treat output as a review package, not a deployment. Customer-facing use still requires approval.
- If the packet's current plan is already strong, prefer incremental refinement over unnecessary reinvention.

Packet:

\`\`\`json
${JSON.stringify(packet, null, 2)}
\`\`\`
`;
}

function normalizeRoutePath(routePath) {
  const value = String(routePath || '').trim();
  if (!value || value === '/') return '/';
  return `/${value.replace(/^\/+|\/+$/g, '')}/`;
}

function normalizeSiteProviderResponse(response, packet) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('Site provider response must be an object');
  const sitemap = response.sitemap && typeof response.sitemap === 'object' && !Array.isArray(response.sitemap) ? response.sitemap : {};
  const routes = Array.isArray(sitemap.routes) ? sitemap.routes.map((route) => ({
    path: normalizeRoutePath(route.path),
    title: String(route.title || route.path || 'Untitled'),
    purpose: String(route.purpose || ''),
    nav: route.nav !== false,
    status: String(route.status || 'planned'),
    opsGoal: String(route.opsGoal || ''),
    content: Array.isArray(route.content) ? route.content.map((item) => String(item)) : []
  })) : [];
  if (!routes.length) throw new Error('Site provider response sitemap.routes must contain at least one route');
  const routePaths = new Set(routes.map((route) => route.path));
  if (!routePaths.has('/')) throw new Error('Site provider response must include the home route /');

  const pages = Array.isArray(response.pages) ? response.pages.map((page) => ({
    path: normalizeRoutePath(page.path),
    html: String(page.html || ''),
    ops: page.ops && typeof page.ops === 'object' && !Array.isArray(page.ops) ? {
      sections: Array.isArray(page.ops.sections) ? page.ops.sections : [],
      suggestedEvents: Array.isArray(page.ops.suggestedEvents) ? page.ops.suggestedEvents : [],
      contentSlots: Array.isArray(page.ops.contentSlots) ? page.ops.contentSlots : []
    } : { sections: [], suggestedEvents: [], contentSlots: [] }
  })) : [];
  if (!pages.length) throw new Error('Site provider response pages must contain at least one page');
  for (const page of pages) {
    if (!routePaths.has(page.path)) throw new Error(`Provider page path is not in sitemap.routes: ${page.path}`);
    if (!/<!doctype html/i.test(page.html) && !/<html/i.test(page.html)) throw new Error(`Provider page must be complete HTML: ${page.path}`);
  }
  const pagePaths = new Set(pages.map((page) => page.path));
  for (const route of routes) if (!pagePaths.has(route.path)) throw new Error(`Missing provider page HTML for route: ${route.path}`);

  const designSystem = response.designSystem && typeof response.designSystem === 'object' && !Array.isArray(response.designSystem) ? response.designSystem : {};
  return {
    summary: String(response.summary || ''),
    sitemap: {
      version: 1,
      generatedAt: now(),
      workspaceId: packet.workspace.id,
      workspaceName: packet.workspace.name,
      classification: { kind: packet.classification.kind, label: packet.classification.label, primaryGoal: packet.classification.primaryGoal },
      routes,
      globalNav: Array.isArray(sitemap.globalNav) ? sitemap.globalNav.map((item) => String(item)) : routes.filter((route) => route.nav).map((route) => route.title),
      externalDestinations: Array.isArray(sitemap.externalDestinations) ? sitemap.externalDestinations : packet.sitePlan?.externalDestinations || [],
      assumptions: Array.isArray(response.assumptions) ? response.assumptions.map((item) => String(item)) : [],
      approval: { required: true, type: 'site.build.review' }
    },
    designSystem: {
      intent: String(designSystem.intent || packet.designSystem?.intent || ''),
      components: Array.isArray(designSystem.components) ? designSystem.components.map((item) => String(item)) : [],
      opsHooks: Array.isArray(designSystem.opsHooks) ? designSystem.opsHooks.map((item) => String(item)) : []
    },
    pages,
    assumptions: Array.isArray(response.assumptions) ? response.assumptions.map((item) => String(item)) : [],
    approvalNotes: Array.isArray(response.approvalNotes) ? response.approvalNotes.map((item) => String(item)) : []
  };
}

async function rawSiteOutput(provider, { response, command }, prompt) {
  if (provider === 'json') {
    if (!response) throw new Error('JSON site provider requires --response <path>');
    return readFile(response, 'utf8');
  }
  if (provider === 'openclaw') {
    const providerCommand = command || defaultOpenClawSiteCommand();
    if (!providerCommand) throw new Error('OpenClaw site provider requires CONTEXTULA_OPENCLAW_SITE_COMMAND or CONTEXTULA_OPENCLAW_COMMAND.');
    return runProviderCommand(providerCommand, prompt);
  }
  throw new Error(`Unknown site provider: ${provider}`);
}

export async function runSiteProvider(home, workspaceId, { provider = 'json', response, command, variant = 'site-provider-v1' } = {}) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  await mkdir(path.join(root, 'site', 'provider-runs'), { recursive: true });
  const packet = await buildSitePacket(home, workspaceId, { variant });
  const prompt = sitePrompt(packet);
  const runId = id('srun');
  const runArtifact = `site/provider-runs/${runId}`;
  const runDir = path.join(root, runArtifact);
  await mkdir(runDir, { recursive: true });
  await writeJson(path.join(runDir, 'packet.json'), packet);
  await writeFile(path.join(runDir, 'prompt.md'), prompt, 'utf8');

  let result;
  try {
    const raw = await rawSiteOutput(provider, { response, command }, prompt);
    await writeFile(path.join(runDir, 'response.raw.json'), raw.replace(/^\uFEFF/, ''), 'utf8');
    result = normalizeSiteProviderResponse(JSON.parse(raw.replace(/^\uFEFF/, '')), packet);
    await writeJson(path.join(runDir, 'response.normalized.json'), result);
  } catch (error) {
    await writeJson(path.join(runDir, 'errors.json'), { message: error.message || String(error), provider, at: now() });
    await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'site.provider.failed', at: now(), provider, run: runArtifact, error: error.message || String(error) });
    throw error;
  }

  const buildId = id('sitebuild');
  const relativeRoot = `builds/${buildId}`;
  const buildRoot = path.join(root, relativeRoot);
  await mkdir(path.join(buildRoot, 'contextula'), { recursive: true });
  for (const page of result.pages) {
    const file = path.join(buildRoot, routeToFile(page.path));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, page.html, 'utf8');
  }

  const linkCheck = validateLinks(result.sitemap);
  const build = { id: buildId, version: 1, createdAt: now(), workspaceId: record.id, provider, providerRun: runArtifact, plan: 'site/sitemap.json', root: relativeRoot, routes: result.sitemap.routes.map((route) => ({ path: route.path, file: routeToFile(route.path) })) };
  await writeJson(path.join(buildRoot, 'contextula', 'build.json'), build);
  await writeJson(path.join(buildRoot, 'contextula', 'sitemap.json'), result.sitemap);
  await writeJson(path.join(buildRoot, 'contextula', 'design-system.json'), result.designSystem);
  await writeJson(path.join(buildRoot, 'contextula', 'pages.ops.json'), { version: 1, generatedAt: now(), providerRun: runArtifact, pages: result.pages.map((page) => ({ path: page.path, ops: page.ops })) });
  await writeJson(path.join(buildRoot, 'contextula', 'link-check.json'), linkCheck);
  const report = `# Provider Site Build Report\n\nBuild: ${buildId}\nWorkspace: ${record.name || record.slug}\nProvider: ${provider}\nProvider run: ${runArtifact}\nGenerated: ${build.createdAt}\n\n## Summary\n\n${result.summary || '(none)'}\n\n## Routes\n\n${build.routes.map((route) => `- ${route.path} -> ${route.file}`).join('\n')}\n\n## Approval notes\n\n${result.approvalNotes.map((note) => `- ${note}`).join('\n') || '- None.'}\n\n## Link check\n\n${linkCheck.ok ? 'OK' : 'FAILED'}\n`;
  await writeFile(path.join(buildRoot, 'contextula', 'build-report.md'), report, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'site.provider.generated', at: now(), provider, artifact: `${relativeRoot}/index.html`, build: relativeRoot, providerRun: runArtifact, routes: build.routes.length, linkCheck: linkCheck.ok, classification: packet.classification.kind });
  const approvalResult = await createApproval(root, {
    id: id('appr'),
    version: VERSION,
    type: 'site.build.review',
    status: 'pending',
    requestedAt: now(),
    requestedBy: 'contextula-site-provider',
    artifact: `${relativeRoot}/index.html`,
    reason: 'Provider-backed multi-page site builds require review before customer-facing presentation, deployment, or implementation.'
  });
  return { build, linkCheck, artifact: `${relativeRoot}/index.html`, report: `${relativeRoot}/contextula/build-report.md`, providerRun: runArtifact, approval: approvalResult.approval };
}

function routeToFile(routePath) {
  if (routePath === '/') return 'index.html';
  return `${routePath.replace(/^\//, '').replace(/\/$/, '')}/index.html`;
}

function routeHref(routePath) {
  return routePath;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function pageHtml({ plan, route, buildId }) {
  const nav = plan.routes
    .filter((item) => item.nav)
    .map((item) => `<a href="${routeHref(item.path)}">${escapeHtml(item.title)}</a>`)
    .join('');
  const external = plan.externalDestinations
    .map((dest) => `<article class="card"><div class="tag">${escapeHtml(dest.role)}</div><h2>${escapeHtml(dest.label)}</h2><p><a data-cta="external-${escapeHtml(dest.label).toLowerCase().replace(/[^a-z0-9]+/g, '-')}" href="${escapeHtml(dest.url)}">${escapeHtml(dest.url)}</a></p></article>`)
    .join('\n');
  const content = route.content.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(route.title)} | ${escapeHtml(plan.workspaceName)}</title>
  <link rel="stylesheet" href="/assets/styles.css">
</head>
<body data-contextula-build="${escapeHtml(buildId)}" data-route="${escapeHtml(route.path)}">
  <main class="wrap">
    <header class="topbar">
      <a class="brand" href="/"><span class="logo">▰</span><span><strong>${escapeHtml(plan.workspaceName)}</strong><em>${escapeHtml(plan.classification.label)}</em></span></a>
      <nav>${nav}</nav>
    </header>
    <section id="hero" class="panel hero">
      <div class="label">${escapeHtml(route.status)} route</div>
      <h1>${escapeHtml(route.title)}</h1>
      <p>${escapeHtml(route.purpose)}</p>
      <p class="ops"><strong>Ops goal:</strong> ${escapeHtml(route.opsGoal || 'Measure route engagement and visitor intent.')}</p>
    </section>
    <section id="content" class="panel">
      <div class="label">Content map</div>
      <ul>${content}</ul>
    </section>
    ${external && route.path === '/' ? `<section id="external-destinations" class="cards">${external}</section>` : ''}
    <footer>CONTEXTULA SITE BUILD · ${escapeHtml(buildId)} · REVIEW REQUIRED</footer>
  </main>
</body>
</html>
`;
}

const css = `:root{--bg:#030603;--panel:#071007;--green:#39ff14;--soft:#b6ff9f;--muted:#91b98a;--line:rgba(57,255,20,.66)}*{box-sizing:border-box}body{margin:0;background:linear-gradient(rgba(57,255,20,.035) 50%,transparent 50%) 0 0/100% 4px,var(--bg);color:#e9ffe2;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.wrap{width:min(1120px,calc(100vw - 32px));margin:0 auto;padding:28px 0 56px}.topbar,.panel,.card{border:1px solid var(--line);background:rgba(7,16,7,.84);box-shadow:inset 0 0 0 1px rgba(182,255,159,.06)}.topbar{display:flex;justify-content:space-between;gap:18px;align-items:center;padding:12px 14px}.brand{display:flex;align-items:center;gap:12px;color:var(--soft);text-decoration:none;text-transform:uppercase;letter-spacing:.12em}.brand em{display:block;color:var(--muted);font-size:11px;font-style:normal;margin-top:3px}.logo{border:1px solid var(--green);color:var(--green);padding:7px 10px}nav{display:flex;gap:10px;flex-wrap:wrap}nav a{color:var(--green);text-decoration:none;border:1px solid rgba(57,255,20,.35);padding:7px 9px;font-size:12px;text-transform:uppercase}.panel{margin-top:18px;padding:22px}.label,.tag{color:var(--green);font-size:12px;letter-spacing:.18em;text-transform:uppercase}h1{color:var(--soft);font-size:clamp(42px,7vw,78px);line-height:.95;text-transform:uppercase;letter-spacing:-.055em;margin:14px 0}p,li{color:var(--muted);line-height:1.65}.ops strong{color:var(--soft)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:18px;background:transparent;border:0}.card{padding:16px}.card h2{color:var(--soft);text-transform:uppercase}.card a{color:var(--green)}footer{color:var(--muted);font-size:12px;text-align:right;margin-top:18px}@media(max-width:760px){.topbar{align-items:flex-start;flex-direction:column}}`;

function validateLinks(plan) {
  const internal = new Set(plan.routes.map((route) => route.path));
  const checked = [];
  const missing = [];
  for (const route of plan.routes) {
    for (const navRoute of plan.routes.filter((item) => item.nav)) {
      checked.push({ from: route.path, to: navRoute.path, ok: internal.has(navRoute.path) });
      if (!internal.has(navRoute.path)) missing.push({ from: route.path, to: navRoute.path });
    }
  }
  return { ok: missing.length === 0, checked, missing };
}

export async function buildStaticSite(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const plan = await readJson(path.join(root, 'site', 'sitemap.json'), null);
  if (!plan) throw new Error('Missing site/sitemap.json. Run: contextula site plan <workspace>');
  const buildId = id('sitebuild');
  const relativeRoot = `builds/${buildId}`;
  const buildRoot = path.join(root, relativeRoot);
  await mkdir(path.join(buildRoot, 'assets'), { recursive: true });
  await mkdir(path.join(buildRoot, 'contextula'), { recursive: true });
  await writeFile(path.join(buildRoot, 'assets', 'styles.css'), css, 'utf8');

  for (const route of plan.routes) {
    const file = path.join(buildRoot, routeToFile(route.path));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, pageHtml({ plan, route, buildId }), 'utf8');
  }

  const linkCheck = validateLinks(plan);
  const build = { id: buildId, version: 1, createdAt: now(), workspaceId: record.id, plan: 'site/sitemap.json', root: relativeRoot, routes: plan.routes.map((route) => ({ path: route.path, file: routeToFile(route.path) })) };
  await writeJson(path.join(buildRoot, 'contextula', 'build.json'), build);
  await writeJson(path.join(buildRoot, 'contextula', 'sitemap.json'), plan);
  await writeJson(path.join(buildRoot, 'contextula', 'link-check.json'), linkCheck);
  const report = `# Site Build Report\n\nBuild: ${buildId}\nWorkspace: ${record.name || record.slug}\nGenerated: ${build.createdAt}\n\n## Routes\n\n${build.routes.map((route) => `- ${route.path} -> ${route.file}`).join('\n')}\n\n## Link check\n\n${linkCheck.ok ? 'OK' : 'FAILED'}\n`;
  await writeFile(path.join(buildRoot, 'contextula', 'build-report.md'), report, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'site.build.generated', at: now(), artifact: `${relativeRoot}/index.html`, build: relativeRoot, routes: build.routes.length, linkCheck: linkCheck.ok });
  return { build, linkCheck, artifact: `${relativeRoot}/index.html`, report: `${relativeRoot}/contextula/build-report.md` };
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function latestBuild(root) {
  const buildsRoot = path.join(root, 'builds');
  const entries = (await readdir(buildsRoot, { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory() && entry.name.startsWith('sitebuild_'));
  const builds = [];
  for (const entry of entries) {
    const build = await readJson(path.join(buildsRoot, entry.name, 'contextula', 'build.json'), null).catch(() => null);
    if (build) builds.push({ ...build, directory: entry.name });
  }
  builds.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return builds[0] || null;
}

async function readLatestChangeBrief(root) {
  const dir = path.join(root, 'site', 'change-briefs');
  const entries = (await readdir(dir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
  const briefs = [];
  for (const entry of entries) {
    const brief = await readJson(path.join(dir, entry.name), null).catch(() => null);
    if (brief) briefs.push({ ...brief, artifact: `site/change-briefs/${entry.name}` });
  }
  briefs.sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')));
  return briefs[0] || null;
}

async function routeFileFacts(buildRoot, route) {
  const file = routeToFile(route.path);
  const fullPath = path.join(buildRoot, file);
  const fileExists = await exists(fullPath);
  const html = fileExists ? await readFile(fullPath, 'utf8').catch(() => '') : '';
  const cssLinks = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)].map((match) => match[1]);
  let linkedCss = '';
  for (const href of cssLinks) {
    const cssPath = href.startsWith('/') ? path.join(buildRoot, href.replace(/^\//, '')) : path.join(path.dirname(fullPath), href);
    linkedCss += await readFile(cssPath, 'utf8').catch(() => '');
  }
  const combined = `${html}\n${linkedCss}`;
  return {
    path: route.path,
    file,
    exists: fileExists,
    bytes: html.length,
    hasViewportMeta: /<meta[^>]+name=["']viewport["']/i.test(html),
    hasResponsiveCss: /@media\s*\(|clamp\(|minmax\(|auto-fit|auto-fill|flex-wrap/i.test(combined),
    navLinkCount: (html.match(/<a\b/gi) || []).length,
    hasHorizontalOverflowRisk: /width\s*:\s*(?:\d{3,}|100vw)|min-width\s*:\s*(?:\d{3,})/i.test(combined)
  };
}

function critiquePlanAndBuild({ plan, build, linkCheck, routeFiles, viewport = 'desktop' }) {
  const findings = [];
  const strengths = [];

  if (linkCheck?.ok) strengths.push('Internal navigation link check passed.');
  else findings.push({ severity: 'high', area: 'navigation', message: 'Internal navigation has missing route targets.', recommendation: 'Fix sitemap routes or generated navigation before review/deploy.' });

  if (plan.routes.length === build.routes.length) strengths.push(`Build includes all ${plan.routes.length} planned route(s).`);
  else findings.push({ severity: 'high', area: 'routing', message: `Plan has ${plan.routes.length} route(s), but build has ${build.routes.length}.`, recommendation: 'Regenerate the build from the current site plan.' });

  for (const route of plan.routes) {
    if (!route.purpose || !route.opsGoal) findings.push({ severity: 'medium', area: 'page-goals', message: `${route.path} is missing a clear purpose or ops goal.`, recommendation: 'Strengthen the page plan before agentic generation uses it.' });
    if (!routeFiles.find((item) => item.path === route.path)?.exists) findings.push({ severity: 'high', area: 'artifact', message: `${route.path} did not generate its expected HTML file.`, recommendation: 'Regenerate the build and inspect routeToFile mapping.' });
  }

  const navRoutes = plan.routes.filter((route) => route.nav);
  if (navRoutes.length >= Math.min(2, plan.routes.length)) strengths.push('Global navigation is present across planned routes.');
  else findings.push({ severity: 'medium', area: 'navigation', message: 'Too few routes are included in global navigation.', recommendation: 'Mark the main visitor paths as nav routes.' });

  if (plan.classification?.kind === 'personal-project-hub') {
    const forbidden = plan.routes.filter((route) => ['/services/', '/contact/'].includes(route.path));
    if (forbidden.length) findings.push({ severity: 'medium', area: 'classification', message: 'Project hub plan includes service-business routes.', recommendation: 'Keep the project hub focused on projects, notes, status, and identity continuity.' });
    else strengths.push('Project-hub guardrail passed: no service-business funnel routes were introduced.');
  }

  if (plan.classification?.kind === 'service-business') {
    const paths = new Set(plan.routes.map((route) => route.path));
    if (paths.has('/services/') && paths.has('/contact/')) strengths.push('Service-business route coverage includes services and contact paths.');
    else findings.push({ severity: 'medium', area: 'classification', message: 'Service-business plan lacks services or contact routes.', recommendation: 'Add grounded conversion routes before build review.' });
  }

  if (viewport === 'mobile') {
    const missingViewport = routeFiles.filter((route) => route.exists && !route.hasViewportMeta);
    if (missingViewport.length) findings.push({ severity: 'high', area: 'mobile', message: `${missingViewport.length} route(s) are missing a viewport meta tag.`, recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to every generated page.' });
    else strengths.push('Mobile guardrail passed: every generated page has a viewport meta tag.');

    const responsiveRoutes = routeFiles.filter((route) => route.hasResponsiveCss).length;
    if (responsiveRoutes) strengths.push(`Mobile responsiveness signal found on ${responsiveRoutes} route artifact(s).`);
    else findings.push({ severity: 'medium', area: 'mobile', message: 'No obvious responsive CSS signal was found in the generated build.', recommendation: 'Add media queries, flexible grids, wrapping nav, or clamp/minmax sizing before mobile review.' });

    const overflowRisks = routeFiles.filter((route) => route.hasHorizontalOverflowRisk);
    if (overflowRisks.length) findings.push({ severity: 'medium', area: 'mobile', message: `${overflowRisks.length} route(s) contain fixed-width CSS patterns that may cause horizontal overflow.`, recommendation: 'Review fixed widths/min-widths on mobile and prefer max-width, flexible grids, and wrapping layouts.' });
    else strengths.push('No obvious fixed-width mobile overflow risks detected in generated route artifacts.');
  }

  const high = findings.filter((finding) => finding.severity === 'high').length;
  const medium = findings.filter((finding) => finding.severity === 'medium').length;
  const score = Math.max(0, 100 - high * 30 - medium * 12 - findings.filter((finding) => finding.severity === 'low').length * 5);
  const verdict = high ? 'blocked' : medium ? 'needs-review' : 'ready-for-review';
  return { score, verdict, strengths, findings };
}

async function recordCritiqueLearning(root, critique) {
  const claims = [];
  if (critique.findings.length === 0) {
    claims.push(await addClaim(root, {
      text: `Latest ${critique.viewport || 'desktop'} site build critique passed with verdict ${critique.verdict} and no findings for ${critique.classification?.label || 'current classification'}.`,
      confidence: 0.82,
      source: 'site-critique',
      metadata: { artifact: critique.report || `${critique.build}/contextula/site-critique.md`, build: critique.build, viewport: critique.viewport, verdict: critique.verdict, score: critique.score }
    }));
  } else {
    for (const finding of critique.findings) {
      claims.push(await addClaim(root, {
        text: `${critique.viewport || 'desktop'} site build critique found ${finding.severity} ${finding.area} issue: ${finding.message} Recommendation: ${finding.recommendation}`,
        confidence: finding.severity === 'high' ? 0.9 : finding.severity === 'medium' ? 0.78 : 0.66,
        source: 'site-critique',
        metadata: { artifact: critique.report || `${critique.build}/contextula/site-critique.md`, build: critique.build, viewport: critique.viewport, verdict: critique.verdict, score: critique.score, severity: finding.severity, area: finding.area }
      }));
    }
  }

  const learned = {
    version: 1,
    updatedAt: now(),
    source: critique.artifact || `${critique.build}/contextula/site-critique.json`,
    build: critique.build,
    viewport: critique.viewport,
    verdict: critique.verdict,
    score: critique.score,
    claimIds: claims.map((claim) => claim.id),
    duplicateClaims: claims.filter((claim) => claim.duplicate).length,
    signals: critique.findings.length
      ? critique.findings.map((finding) => ({ type: 'issue', severity: finding.severity, area: finding.area, message: finding.message, recommendation: finding.recommendation }))
      : [{ type: 'positive', area: 'site-build-quality', message: 'Build passed procedural critique without findings.' }]
  };
  await writeJson(path.join(root, 'site', 'critique-learning.json'), learned);
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'site.critique.learned', at: now(), build: critique.build, viewport: critique.viewport, verdict: critique.verdict, score: critique.score, claims: claims.length, duplicateClaims: learned.duplicateClaims });
  return learned;
}

export async function critiqueStaticSite(home, workspaceId, { build: requestedBuild = 'latest', viewport = 'desktop' } = {}) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const plan = await readJson(path.join(root, 'site', 'sitemap.json'), null);
  if (!plan) throw new Error('Missing site/sitemap.json. Run: contextula site plan <workspace>');

  const build = requestedBuild === 'latest'
    ? await latestBuild(root)
    : await readJson(path.join(root, requestedBuild, 'contextula', 'build.json'), null).catch(() => null);
  if (!build) throw new Error('Missing site build. Run: contextula site build <workspace>');

  const buildRoot = path.join(root, build.root || `builds/${build.directory || build.id}`);
  const linkCheck = await readJson(path.join(buildRoot, 'contextula', 'link-check.json'), { ok: false, checked: [], missing: [] });
  viewport = ['mobile', 'desktop'].includes(viewport) ? viewport : 'desktop';
  const routeFiles = [];
  for (const route of plan.routes) routeFiles.push(await routeFileFacts(buildRoot, route));

  const critique = {
    id: id('sitecrit'),
    version: 1,
    createdAt: now(),
    workspaceId: record.id,
    workspaceName: record.name || record.slug,
    build: build.root || `builds/${build.directory || build.id}`,
    viewport,
    plan: 'site/sitemap.json',
    classification: plan.classification,
    routeFiles,
    linkCheck: { ok: Boolean(linkCheck.ok), checked: linkCheck.checked?.length || 0, missing: linkCheck.missing || [] },
    ...critiquePlanAndBuild({ plan, build, linkCheck, routeFiles, viewport })
  };

  const suffix = viewport === 'mobile' ? '-mobile' : '';
  const relativeArtifact = `${critique.build}/contextula/site-critique${suffix}.json`;
  const relativeReport = `${critique.build}/contextula/site-critique${suffix}.md`;
  critique.artifact = relativeArtifact;
  critique.report = relativeReport;
  await writeJson(path.join(root, relativeArtifact), critique);
  const md = `# Site Critique\n\nWorkspace: ${critique.workspaceName}\nBuild: ${critique.build}\nViewport: ${critique.viewport}\nCreated: ${critique.createdAt}\nVerdict: ${critique.verdict}\nScore: ${critique.score}\n\n## Strengths\n\n${critique.strengths.map((item) => `- ${item}`).join('\n') || '- None recorded.'}\n\n## Findings\n\n${critique.findings.map((finding) => `- [${finding.severity}] ${finding.area}: ${finding.message}\n  - Recommendation: ${finding.recommendation}`).join('\n') || '- No blocking findings.'}\n\n## Route files\n\n${critique.routeFiles.map((route) => `- ${route.path} -> ${route.file}: ${route.exists ? 'ok' : 'missing'}${critique.viewport === 'mobile' ? `; viewport meta: ${route.hasViewportMeta ? 'ok' : 'missing'}; responsive signal: ${route.hasResponsiveCss ? 'yes' : 'no'}` : ''}`).join('\n')}\n`;
  await writeFile(path.join(root, relativeReport), md, 'utf8');
  await appendJsonl(path.join(root, 'timeline.jsonl'), { id: id('evt'), type: 'site.critique.generated', at: now(), artifact: relativeReport, build: critique.build, viewport, verdict: critique.verdict, score: critique.score, findings: critique.findings.length });
  const learned = await recordCritiqueLearning(root, critique);
  return { critique, learned, artifact: relativeArtifact, report: relativeReport, learning: 'site/critique-learning.json' };
}

import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { appendJsonl, id, now, readJson, readJsonl, VERSION, writeJson } from './util.js';
import { resolveWorkspace } from './storage.js';
import { classifyWorkspace } from './classification.js';
import { createApproval } from './approvals.js';

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

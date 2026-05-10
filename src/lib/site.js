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

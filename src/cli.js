#!/usr/bin/env node
import { defaultHome, parseArgs, VERSION } from './lib/util.js';
import { ensureHome, resolveWorkspace } from './lib/storage.js';
import { createCustomer, listWorkspaces, readProfile, writeProfile } from './lib/workspace.js';
import { researchHomepage, researchWebsite } from './lib/research.js';
import { buildPlan, createApproval } from './lib/planning.js';
import { formatArtifactSummary, listArtifacts } from './lib/artifacts.js';
import { listApprovals, setApprovalStatus } from './lib/approvals.js';
import { addClaim, listClaims } from './lib/claims.js';
import { runResearchAgent, writeResearchPacket, writeResearchPrompt } from './lib/agents/research-agent.js';
import { generateDashboard } from './lib/dashboard.js';
import { critiqueDesign, generateDesignBrief, generateHomepageHtml, generateHomepageMock, reviseHomepageMock } from './lib/design.js';
import { buildDesignPacket, designPrompt, runDesignHtmlProvider } from './lib/design-provider.js';
import { draftOutreach } from './lib/drafts.js';
import { getWorkspaceStatus, setWorkspaceStatus, WORKSPACE_STATUSES } from './lib/lifecycle.js';
import { writePortfolioReport } from './lib/portfolio.js';
import { materializePreferences } from './lib/preferences.js';
import { generateBrief, generateReport } from './lib/reports.js';
import { buildReview } from './lib/review.js';
import { buildSitePacket, buildStaticSite, critiqueStaticSite, generateSitePlan, sitePrompt } from './lib/site.js';
import { materializeWorkspaceState, readTimeline } from './lib/state.js';
import { generateTickets, listTickets } from './lib/tickets.js';
import { validateHome, validateWorkspace } from './lib/validation.js';
import { listDesignProviders, listResearchProviders } from './lib/providers.js';
import { addVisualReference, captureVisualSnapshot } from './lib/visual.js';

async function intakeCustomer(home, flags) {
  if (!flags.name) throw new Error('Missing --name');
  const { workspaceId, root } = await createCustomer(home, { name: flags.name, website: flags.website, source: flags.source || 'manual', allowDuplicate: Boolean(flags['allow-duplicate']) });
  const profile = await readProfile(root);
  const researchResult = await researchHomepage(root, profile);
  await buildPlan(root, profile, researchResult);
  await createApproval(root);
  profile.currentDigitalPresence = {
    websiteSnapshotCaptured: Boolean(researchResult.page),
    homepageTitle: researchResult.page?.title || null,
    homepageStatus: researchResult.page?.status || null,
    primaryResearchArtifact: researchResult.page ? 'research/extracted/homepage.md' : null
  };
  await writeProfile(root, profile);
  console.log(`Created customer workspace ${workspaceId}`);
  console.log(root);
  console.log('No external messages sent. Approval gates created only.');
}

async function printArtifactSummary(home, workspaceId) {
  console.log(formatArtifactSummary(await listArtifacts(home, workspaceId)));
}

async function runDemoSite(home, flags) {
  if (!flags.name) throw new Error('Missing --name');
  if (!flags.website) throw new Error('Missing --website');
  const { workspaceId, root } = await createCustomer(home, { name: flags.name, website: flags.website, source: 'demo-site', allowDuplicate: Boolean(flags['allow-duplicate']) });
  console.log(`Created demo workspace ${workspaceId}`);
  await setWorkspaceStatus(home, workspaceId, 'researching');
  const profile = await readProfile(root);
  const researchResult = await researchWebsite(root, profile, { maxPages: Number(flags['max-pages'] || 4) });
  profile.currentDigitalPresence = {
    ...profile.currentDigitalPresence,
    websiteSnapshotCaptured: researchResult.pages.length > 0,
    pagesCaptured: researchResult.pages.length,
    lastResearchAt: new Date().toISOString()
  };
  await writeProfile(root, profile);
  await runResearchAgent(home, workspaceId, { provider: flags.provider || 'static' });
  await buildPlan(root, profile, researchResult);
  await generateBrief(home, workspaceId);
  await generateDesignBrief(home, workspaceId);
  await generateHomepageMock(home, workspaceId);
  await materializePreferences(home, workspaceId);
  await generateTickets(home, workspaceId);
  await draftOutreach(home, workspaceId);
  await generateDashboard(home, workspaceId);
  await materializeWorkspaceState(home, workspaceId);
  await setWorkspaceStatus(home, workspaceId, 'briefed');
  const summary = await listArtifacts(home, workspaceId);
  console.log(formatArtifactSummary(summary));
  console.log('No external messages sent. Approval gates created only.');
  console.log(`Workspace: ${workspaceId}`);
}

async function printStatus(home, workspaceId) {
  const result = await getWorkspaceStatus(home, workspaceId);
  console.log(`${result.record.id}\t${result.status}\t${result.record.name || result.record.slug}`);
}

async function updateStatus(home, workspaceId, status) {
  const result = await setWorkspaceStatus(home, workspaceId, status);
  console.log(`status: ${result.previousStatus} -> ${result.status}`);
}

async function createPreferences(home, workspaceId) {
  const preferences = await materializePreferences(home, workspaceId);
  console.log(`preferences: ${preferences.items.length} item(s)`);
}

async function showWorkspace(home, workspaceId) {
  const { record, root } = await resolveWorkspace(home, workspaceId);
  const profile = await readProfile(root);
  console.log(JSON.stringify({ record, profile, root }, null, 2));
}

async function printPortfolio(home) {
  const { summary, report, artifact } = await writePortfolioReport(home);
  console.log(report);
  console.log(`artifact: ${artifact}`);
  if (summary.pendingApprovals > 0) console.log(`pending approvals: ${summary.pendingApprovals}`);
}

async function createDashboard(home, workspaceId) {
  const result = await generateDashboard(home, workspaceId);
  console.log(`dashboard: ${result.artifact}`);
}

async function printWorkspaces(home) {
  const workspaces = await listWorkspaces(home);
  if (workspaces.length === 0) {
    console.log('No workspaces yet.');
    return;
  }
  for (const ws of workspaces) console.log(`${ws.id}\t${ws.type}\t${ws.status}\t${ws.name || ws.slug}\t${ws.path}`);
}

async function printTimeline(home, workspaceId, flags) {
  const events = await readTimeline(home, workspaceId, { limit: flags.limit || 20 });
  if (events.length === 0) {
    console.log('No timeline events yet.');
    return;
  }
  for (const event of events) console.log(`${event.at}\t${event.type}\t${event.artifact || event.action || event.approvalId || ''}`);
}

async function printState(home, workspaceId) {
  const state = await materializeWorkspaceState(home, workspaceId);
  console.log(JSON.stringify(state, null, 2));
}

async function printApprovals(home, workspaceId) {
  const { record, approvals } = await listApprovals(home, workspaceId);
  if (approvals.length === 0) {
    console.log(`No approvals for ${record.name || record.slug}.`);
    return;
  }
  for (const approval of approvals) console.log(`${approval.id}\t${approval.status}\t${approval.type}\t${approval.artifact || ''}`);
}

async function exportAgentPacket(home, workspaceId) {
  const result = await writeResearchPacket(home, workspaceId);
  console.log(`packet: ${result.artifact}`);
}

async function exportAgentPrompt(home, workspaceId) {
  const result = await writeResearchPrompt(home, workspaceId);
  console.log(`prompt: ${result.artifact}`);
}

async function runAgentResearch(home, workspaceId, flags) {
  const result = await runResearchAgent(home, workspaceId, { provider: flags.provider || 'static', response: flags.response, command: flags.command });
  const newClaims = (result.claims || []).filter((claim) => !claim.duplicate).length;
  console.log(`agent research complete: ${result.observations?.length || 0} observation(s), ${newClaims} new claim(s), ${result.duplicateClaims || 0} duplicate claim(s) skipped`);
  console.log(`artifact: ${result.artifact}`);
  console.log(`provider run: ${result.providerRun}`);
}

function printAgentProviders() {
  console.log('Research providers');
  for (const provider of listResearchProviders()) {
    console.log(`${provider.name}\t${provider.available ? 'available' : 'missing'}\t${provider.description}`);
    if (provider.command) console.log(`  command: ${provider.command}`);
    if (provider.env?.length && !provider.command) console.log(`  configure: ${provider.env.join(' or ')}`);
  }
  console.log('');
  console.log('Design providers');
  for (const provider of listDesignProviders()) {
    console.log(`${provider.name}\t${provider.available ? 'available' : 'missing'}\t${provider.description}`);
    if (provider.command) console.log(`  command: ${provider.command}`);
    if (provider.env?.length && !provider.command) console.log(`  configure: ${provider.env.join(' or ')}`);
  }
}

async function runResearch(home, workspaceId, flags) {
  const { root } = await resolveWorkspace(home, workspaceId);
  const profile = await readProfile(root);
  const maxPages = Number(flags['max-pages'] || flags.maxPages || 4);
  const result = await researchWebsite(root, profile, { maxPages });
  profile.currentDigitalPresence = {
    ...profile.currentDigitalPresence,
    websiteSnapshotCaptured: result.pages.length > 0,
    pagesCaptured: result.pages.length,
    lastResearchAt: new Date().toISOString()
  };
  await writeProfile(root, profile);
  console.log(`Research complete: ${result.pages.length} page(s), ${result.claims.length} claim(s)`);
}

async function printClaims(home, workspaceId, flags) {
  const { root } = await resolveWorkspace(home, workspaceId);
  const claims = await listClaims(root, { status: flags.status || 'active' });
  if (claims.length === 0) {
    console.log('No claims found.');
    return;
  }
  for (const claim of claims) console.log(`${claim.id}\t${claim.status}\t${Math.round((claim.confidence || 0) * 100)}\t${claim.text}\t${claim.source}`);
}

async function createClaim(home, workspaceId, flags) {
  const { root } = await resolveWorkspace(home, workspaceId);
  const text = flags.text || flags.claim;
  const claim = await addClaim(root, { text, confidence: flags.confidence || 0.5, source: flags.source || 'manual' });
  console.log(claim.duplicate ? `claim duplicate skipped: ${claim.id}` : `claim added: ${claim.id}`);
}

async function printTickets(home, workspaceId) {
  const tickets = await listTickets(home, workspaceId);
  if (tickets.length === 0) {
    console.log('No tickets found. Run: contextula tickets generate <workspace>');
    return;
  }
  for (const ticket of tickets) console.log(`${ticket.id}\t${ticket.status}\t${ticket.priority}\t${ticket.title}`);
}

async function createTickets(home, workspaceId) {
  const tickets = await generateTickets(home, workspaceId);
  console.log(`generated ${tickets.length} ticket(s)`);
}

async function createDesignBrief(home, workspaceId) {
  const result = await generateDesignBrief(home, workspaceId);
  console.log(`design brief: ${result.artifact}`);
}

async function createDesignMock(home, workspaceId, flags) {
  const result = await generateHomepageMock(home, workspaceId, { variant: flags.variant || 'v1' });
  console.log(`design mock: ${result.artifact}`);
}

async function createDesignHtml(home, workspaceId, flags) {
  const provider = flags.provider || 'static';
  if (provider !== 'static') {
    const result = await runDesignHtmlProvider(home, workspaceId, { provider, response: flags.response, command: flags.command, variant: flags.variant || 'provider-v1' });
    console.log(`design html: ${result.artifact}`);
    console.log(`ops: ${result.opsArtifact}`);
    console.log(`provider run: ${result.providerRun}`);
    console.log(`approval: ${result.approval.id}`);
    return;
  }
  const result = await generateHomepageHtml(home, workspaceId, { variant: flags.variant || 'v1' });
  console.log(`design html: ${result.artifact}`);
  console.log(`approval: ${result.approval.id}`);
}

async function exportDesignPacket(home, workspaceId, flags) {
  const packet = await buildDesignPacket(home, workspaceId, { variant: flags.variant || 'provider-v1' });
  console.log(JSON.stringify(packet, null, 2));
}

async function exportDesignPrompt(home, workspaceId, flags) {
  const packet = await buildDesignPacket(home, workspaceId, { variant: flags.variant || 'provider-v1' });
  console.log(designPrompt(packet));
}

async function createVisualSnapshot(home, workspaceId, flags) {
  const result = await captureVisualSnapshot(home, workspaceId, { url: flags.url, artifact: flags.artifact, viewport: flags.viewport || 'desktop' });
  console.log(`visual snapshot: ${result.artifacts.screenshot}`);
  console.log(`metadata: ${result.artifacts.metadata}`);
  console.log(`analysis prompt: ${result.artifacts.analysisPrompt}`);
}

async function createVisualReference(home, workspaceId, flags) {
  const result = await addVisualReference(home, workspaceId, { image: flags.image, note: flags.note || '' });
  console.log(`visual reference: ${result.artifacts.image}`);
  console.log(`metadata: ${result.artifacts.metadata}`);
  console.log(`analysis prompt: ${result.artifacts.analysisPrompt}`);
}

async function createSitePlan(home, workspaceId) {
  const result = await generateSitePlan(home, workspaceId);
  console.log(`site plan: ${result.artifacts.join(', ')}`);
  console.log(`routes: ${result.plan.routes.length}`);
  console.log(`approval: ${result.approval.id}`);
}

async function exportSitePacket(home, workspaceId, flags) {
  const packet = await buildSitePacket(home, workspaceId, { variant: flags.variant || 'site-provider-v1' });
  console.log(JSON.stringify(packet, null, 2));
}

async function exportSitePrompt(home, workspaceId, flags) {
  const packet = await buildSitePacket(home, workspaceId, { variant: flags.variant || 'site-provider-v1' });
  console.log(sitePrompt(packet));
}

async function createSiteBuild(home, workspaceId) {
  const result = await buildStaticSite(home, workspaceId);
  console.log(`site build: ${result.artifact}`);
  console.log(`report: ${result.report}`);
  console.log(`link check: ${result.linkCheck.ok ? 'ok' : 'failed'}`);
}

async function createSiteCritique(home, workspaceId, flags) {
  const result = await critiqueStaticSite(home, workspaceId, { build: flags.build || 'latest' });
  console.log(`site critique: ${result.report}`);
  console.log(`score: ${result.critique.score}`);
  console.log(`verdict: ${result.critique.verdict}`);
  console.log(`findings: ${result.critique.findings.length}`);
  console.log(`learning: ${result.learning}`);
  console.log(`learned claims: ${result.learned.claimIds.length - result.learned.duplicateClaims} new, ${result.learned.duplicateClaims} duplicate`);
}

async function createDesignCritique(home, workspaceId, flags) {
  const result = await critiqueDesign(home, workspaceId, { artifact: flags.artifact || 'design/mocks/homepage-v1.md', feedback: flags.feedback });
  console.log(`design critique: ${result.artifact}`);
  console.log(`claim: ${result.claim.id}`);
}

async function createDesignRevision(home, workspaceId, flags) {
  const result = await reviseHomepageMock(home, workspaceId, { from: flags.from || 'design/mocks/homepage-v1.md', variant: flags.variant || 'v2' });
  console.log(`design revision: ${result.artifact}`);
}

async function createOutreachDraft(home, workspaceId, flags) {
  const result = await draftOutreach(home, workspaceId, { channel: flags.channel || 'email', tone: flags.tone || 'concise' });
  console.log(`draft: ${result.artifact}`);
  console.log(`approval: ${result.approval.id}`);
}

async function printReview(home, workspaceId) {
  console.log(await buildReview(home, workspaceId));
}

async function printValidation(home, workspaceId) {
  const results = workspaceId ? [await validateWorkspace(home, workspaceId)] : await validateHome(home);
  if (results.length === 0) {
    console.log('No workspaces to validate.');
    return;
  }
  let failed = false;
  for (const result of results) {
    const label = `${result.record.id}\t${result.record.name || result.record.slug}`;
    if (result.ok) console.log(`ok\t${label}`);
    else {
      failed = true;
      console.log(`fail\t${label}`);
      for (const problem of result.problems) console.log(`  - ${problem}`);
    }
  }
  if (failed) process.exitCode = 1;
}

function help() {
  console.log(`Contextula ${VERSION}\n\nCommands:\n  init [--home <path>]\n  intake customer --name <name> [--website <url>] [--allow-duplicate] [--home <path>]\n  demo site --name <name> --website <url> [--max-pages 4] [--home <path>]\n  research <workspace-id-or-slug> [--max-pages 4] [--home <path>]\n  agent providers\n  agent packet <workspace-id-or-slug> [--home <path>]\n  agent prompt <workspace-id-or-slug> [--home <path>]\n  agent research <workspace-id-or-slug> [--provider static|json|openclaw] [--response <path>] [--home <path>]\n  portfolio [--home <path>]\n  dashboard <workspace-id-or-slug> [--home <path>]\n  state <workspace-id-or-slug> [--home <path>]\n  timeline <workspace-id-or-slug> [--limit 20] [--home <path>]\n  status <workspace-id-or-slug> [--home <path>]\n  status set <workspace-id-or-slug> <status> [--home <path>]\n  preferences <workspace-id-or-slug> [--home <path>]\n  artifacts <workspace-id-or-slug> [--home <path>]\n  list [--home <path>]\n  show <workspace-id-or-slug> [--home <path>]\n  approvals <workspace-id-or-slug> [--home <path>]\n  approve <workspace-id-or-slug> <approval-id> [--home <path>]\n  reject <workspace-id-or-slug> <approval-id> [--home <path>]\n  report <workspace-id-or-slug> [--home <path>]\n  brief <workspace-id-or-slug> [--home <path>]\n  claims <workspace-id-or-slug> [--status active|all] [--home <path>]\n  claim add <workspace-id-or-slug> --text <text> [--confidence 0.7] [--source manual] [--home <path>]\n  draft outreach <workspace-id-or-slug> [--channel email] [--tone concise] [--home <path>]\n  tickets generate <workspace-id-or-slug> [--home <path>]\n  tickets list <workspace-id-or-slug> [--home <path>]\n  design packet <workspace-id-or-slug> [--variant provider-v1] [--home <path>]\n  design prompt <workspace-id-or-slug> [--variant provider-v1] [--home <path>]\n  design brief <workspace-id-or-slug> [--home <path>]\n  design mock <workspace-id-or-slug> [--variant v1] [--home <path>]\n  design html <workspace-id-or-slug> [--variant v1] [--provider static|json|openclaw] [--response <path>] [--home <path>]\n  visual snapshot <workspace-id-or-slug> [--url <url>] [--artifact <path>] [--viewport desktop|mobile] [--home <path>]\n  visual reference <workspace-id-or-slug> --image <path> [--note <text>] [--home <path>]\n  site packet <workspace-id-or-slug> [--variant site-provider-v1] [--home <path>]\n  site prompt <workspace-id-or-slug> [--variant site-provider-v1] [--home <path>]\n  site plan <workspace-id-or-slug> [--home <path>]\n  site build <workspace-id-or-slug> [--home <path>]\n  site critique <workspace-id-or-slug> [--build latest|builds/sitebuild_...] [--home <path>]\n  design critique <workspace-id-or-slug> --feedback <text> [--artifact design/mocks/homepage-v1.md] [--home <path>]\n  design revise <workspace-id-or-slug> [--from design/mocks/homepage-v1.md] [--variant v2] [--home <path>]\n  review <workspace-id-or-slug> [--home <path>]\n  validate [workspace-id-or-slug] [--home <path>]\n\nStatuses:\n  ${WORKSPACE_STATUSES.join(', ')}\n\nEnvironment:\n  CONTEXTULA_HOME overrides the default ~/.contextula data home.\n  CONTEXTULA_OPENCLAW_RESEARCH_COMMAND configures --provider openclaw.\n`);
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
  if (cmd === 'demo' && subcmd === 'site') return runDemoSite(home, flags);
  if (cmd === 'agent' && subcmd === 'providers') return printAgentProviders();
  if (cmd === 'agent' && subcmd === 'packet') return exportAgentPacket(home, maybeId);
  if (cmd === 'agent' && subcmd === 'prompt') return exportAgentPrompt(home, maybeId);
  if (cmd === 'agent' && subcmd === 'research') return runAgentResearch(home, maybeId, flags);
  if (cmd === 'research') return runResearch(home, subcmd, flags);
  if (cmd === 'portfolio') return printPortfolio(home);
  if (cmd === 'dashboard') return createDashboard(home, subcmd);
  if (cmd === 'state') return printState(home, subcmd);
  if (cmd === 'timeline') return printTimeline(home, subcmd, flags);
  if (cmd === 'status' && subcmd === 'set') return updateStatus(home, maybeId, positional[3]);
  if (cmd === 'status') return printStatus(home, subcmd);
  if (cmd === 'preferences') return createPreferences(home, subcmd);
  if (cmd === 'artifacts') return printArtifactSummary(home, subcmd);
  if (cmd === 'list') return printWorkspaces(home);
  if (cmd === 'show') return showWorkspace(home, subcmd || maybeId);
  if (cmd === 'approvals') return printApprovals(home, subcmd);
  if (cmd === 'approve') {
    const approval = await setApprovalStatus(home, subcmd, maybeId, 'approved');
    console.log(`approved: ${approval.id}`);
    return;
  }
  if (cmd === 'reject') {
    const approval = await setApprovalStatus(home, subcmd, maybeId, 'rejected');
    console.log(`rejected: ${approval.id}`);
    return;
  }
  if (cmd === 'report') return console.log(await generateReport(home, subcmd));
  if (cmd === 'brief') return console.log(await generateBrief(home, subcmd));
  if (cmd === 'claims') return printClaims(home, subcmd, flags);
  if (cmd === 'claim' && subcmd === 'add') return createClaim(home, maybeId, flags);
  if (cmd === 'draft' && subcmd === 'outreach') return createOutreachDraft(home, maybeId, flags);
  if (cmd === 'tickets' && subcmd === 'generate') return createTickets(home, maybeId);
  if (cmd === 'tickets' && subcmd === 'list') return printTickets(home, maybeId);
  if (cmd === 'design' && subcmd === 'packet') return exportDesignPacket(home, maybeId, flags);
  if (cmd === 'design' && subcmd === 'prompt') return exportDesignPrompt(home, maybeId, flags);
  if (cmd === 'design' && subcmd === 'brief') return createDesignBrief(home, maybeId);
  if (cmd === 'design' && subcmd === 'mock') return createDesignMock(home, maybeId, flags);
  if (cmd === 'design' && subcmd === 'html') return createDesignHtml(home, maybeId, flags);
  if (cmd === 'visual' && subcmd === 'snapshot') return createVisualSnapshot(home, maybeId, flags);
  if (cmd === 'visual' && subcmd === 'reference') return createVisualReference(home, maybeId, flags);
  if (cmd === 'site' && subcmd === 'packet') return exportSitePacket(home, maybeId, flags);
  if (cmd === 'site' && subcmd === 'prompt') return exportSitePrompt(home, maybeId, flags);
  if (cmd === 'site' && subcmd === 'plan') return createSitePlan(home, maybeId);
  if (cmd === 'site' && subcmd === 'build') return createSiteBuild(home, maybeId);
  if (cmd === 'site' && subcmd === 'critique') return createSiteCritique(home, maybeId, flags);
  if (cmd === 'design' && subcmd === 'critique') return createDesignCritique(home, maybeId, flags);
  if (cmd === 'design' && subcmd === 'revise') return createDesignRevision(home, maybeId, flags);
  if (cmd === 'review') return printReview(home, subcmd);
  if (cmd === 'validate') return printValidation(home, subcmd);

  help();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Contextula error: ${error.message || error}`);
  process.exitCode = 1;
});

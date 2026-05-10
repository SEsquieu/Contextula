#!/usr/bin/env node
import { defaultHome, parseArgs, VERSION } from './lib/util.js';
import { ensureHome, resolveWorkspace } from './lib/storage.js';
import { createCustomer, listWorkspaces, readProfile, writeProfile } from './lib/workspace.js';
import { researchHomepage, researchWebsite } from './lib/research.js';
import { buildPlan, createApproval } from './lib/planning.js';
import { listApprovals, setApprovalStatus } from './lib/approvals.js';
import { addClaim, listClaims } from './lib/claims.js';
import { runResearchAgent, writeResearchPacket } from './lib/agents/research-agent.js';
import { generateDashboard } from './lib/dashboard.js';
import { generateDesignBrief, generateHomepageMock } from './lib/design.js';
import { draftOutreach } from './lib/drafts.js';
import { writePortfolioReport } from './lib/portfolio.js';
import { generateBrief, generateReport } from './lib/reports.js';
import { generateTickets, listTickets } from './lib/tickets.js';
import { validateHome, validateWorkspace } from './lib/validation.js';

async function intakeCustomer(home, flags) {
  if (!flags.name) throw new Error('Missing --name');
  const { workspaceId, root } = await createCustomer(home, { name: flags.name, website: flags.website, source: flags.source || 'manual' });
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

async function runAgentResearch(home, workspaceId, flags) {
  const result = await runResearchAgent(home, workspaceId, { provider: flags.provider || 'static', response: flags.response });
  console.log(`agent research complete: ${result.observations?.length || 0} observation(s), ${result.claims?.length || 0} claim(s)`);
  console.log(`artifact: ${result.artifact}`);
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
  console.log(`claim added: ${claim.id}`);
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

async function createOutreachDraft(home, workspaceId, flags) {
  const result = await draftOutreach(home, workspaceId, { channel: flags.channel || 'email', tone: flags.tone || 'concise' });
  console.log(`draft: ${result.artifact}`);
  console.log(`approval: ${result.approval.id}`);
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
  console.log(`Contextula ${VERSION}\n\nCommands:\n  init [--home <path>]\n  intake customer --name <name> [--website <url>] [--home <path>]\n  research <workspace-id-or-slug> [--max-pages 4] [--home <path>]\n  agent packet <workspace-id-or-slug> [--home <path>]\n  agent research <workspace-id-or-slug> [--provider static|json] [--response <path>] [--home <path>]\n  portfolio [--home <path>]\n  dashboard <workspace-id-or-slug> [--home <path>]\n  list [--home <path>]\n  show <workspace-id-or-slug> [--home <path>]\n  approvals <workspace-id-or-slug> [--home <path>]\n  approve <workspace-id-or-slug> <approval-id> [--home <path>]\n  reject <workspace-id-or-slug> <approval-id> [--home <path>]\n  report <workspace-id-or-slug> [--home <path>]\n  brief <workspace-id-or-slug> [--home <path>]\n  claims <workspace-id-or-slug> [--status active|all] [--home <path>]\n  claim add <workspace-id-or-slug> --text <text> [--confidence 0.7] [--source manual] [--home <path>]\n  draft outreach <workspace-id-or-slug> [--channel email] [--tone concise] [--home <path>]\n  tickets generate <workspace-id-or-slug> [--home <path>]\n  tickets list <workspace-id-or-slug> [--home <path>]\n  design brief <workspace-id-or-slug> [--home <path>]\n  design mock <workspace-id-or-slug> [--variant v1] [--home <path>]\n  validate [workspace-id-or-slug] [--home <path>]\n\nEnvironment:\n  CONTEXTULA_HOME overrides the default ~/.contextula data home.\n`);
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
  if (cmd === 'agent' && subcmd === 'packet') return exportAgentPacket(home, maybeId);
  if (cmd === 'agent' && subcmd === 'research') return runAgentResearch(home, maybeId, flags);
  if (cmd === 'research') return runResearch(home, subcmd, flags);
  if (cmd === 'portfolio') return printPortfolio(home);
  if (cmd === 'dashboard') return createDashboard(home, subcmd);
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
  if (cmd === 'design' && subcmd === 'brief') return createDesignBrief(home, maybeId);
  if (cmd === 'design' && subcmd === 'mock') return createDesignMock(home, maybeId, flags);
  if (cmd === 'validate') return printValidation(home, subcmd);

  help();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Contextula error: ${error.message || error}`);
  process.exitCode = 1;
});

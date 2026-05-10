#!/usr/bin/env node
import { defaultHome, parseArgs, VERSION } from './lib/util.js';
import { ensureHome, resolveWorkspace } from './lib/storage.js';
import { createCustomer, listWorkspaces, readProfile, writeProfile } from './lib/workspace.js';
import { researchHomepage, researchWebsite } from './lib/research.js';
import { buildPlan, createApproval } from './lib/planning.js';
import { listApprovals, setApprovalStatus } from './lib/approvals.js';
import { generateReport } from './lib/reports.js';
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
  console.log(`Contextula ${VERSION}\n\nCommands:\n  init [--home <path>]\n  intake customer --name <name> [--website <url>] [--home <path>]\n  research <workspace-id-or-slug> [--max-pages 4] [--home <path>]\n  list [--home <path>]\n  show <workspace-id-or-slug> [--home <path>]\n  approvals <workspace-id-or-slug> [--home <path>]\n  approve <workspace-id-or-slug> <approval-id> [--home <path>]\n  reject <workspace-id-or-slug> <approval-id> [--home <path>]\n  report <workspace-id-or-slug> [--home <path>]\n  validate [workspace-id-or-slug] [--home <path>]\n\nEnvironment:\n  CONTEXTULA_HOME overrides the default ~/.contextula data home.\n`);
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
  if (cmd === 'research') return runResearch(home, subcmd, flags);
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
  if (cmd === 'validate') return printValidation(home, subcmd);

  help();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Contextula error: ${error.message || error}`);
  process.exitCode = 1;
});

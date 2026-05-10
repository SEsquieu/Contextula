import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const cli = path.resolve('src/cli.js');
const home = await mkdtemp(path.join(tmpdir(), 'contextula-smoke-'));

async function run(args) {
  const { stdout, stderr } = await execFileAsync(process.execPath, [cli, ...args], { cwd: process.cwd() });
  if (stderr) process.stderr.write(stderr);
  return stdout.trim();
}

try {
  await run(['--help']);
  await run(['init', '--home', home]);
  const created = await run(['intake', 'customer', '--home', home, '--name', 'Example Plumbing', '--website', 'https://example.com']);
  const workspaceId = created.match(/cus_[^\s]+/)?.[0];
  if (!workspaceId) throw new Error(`Could not parse workspace id from: ${created}`);

  const list = await run(['list', '--home', home]);
  if (!list.includes(workspaceId)) throw new Error('Workspace missing from list output');
  const initialStatus = await run(['status', workspaceId, '--home', home]);
  if (!initialStatus.includes('prospect')) throw new Error(`Initial status wrong: ${initialStatus}`);
  const changedStatus = await run(['status', 'set', workspaceId, 'researching', '--home', home]);
  if (!changedStatus.includes('prospect -> researching')) throw new Error(`Status change failed: ${changedStatus}`);

  const approvals = await run(['approvals', workspaceId, '--home', home]);
  const approvalId = approvals.match(/appr_[^\s]+/)?.[0];
  if (!approvalId) throw new Error(`Could not parse approval id from: ${approvals}`);

  await run(['research', workspaceId, '--home', home, '--max-pages', '1']);
  const packet = await run(['agent', 'packet', workspaceId, '--home', home]);
  if (!packet.includes('packet:')) throw new Error(`Packet export failed: ${packet}`);
  const agentResearch = await run(['agent', 'research', workspaceId, '--home', home]);
  if (!agentResearch.includes('agent research complete')) throw new Error(`Agent research failed: ${agentResearch}`);
  await run(['claim', 'add', workspaceId, '--home', home, '--text', 'Manual smoke-test claim for workspace memory.', '--confidence', '0.7', '--source', 'test']);
  const claims = await run(['claims', workspaceId, '--home', home]);
  if (!claims.includes('Manual smoke-test claim')) throw new Error(`Manual claim missing: ${claims}`);
  await run(['report', workspaceId, '--home', home]);
  const brief = await run(['brief', workspaceId, '--home', home]);
  if (!brief.includes('Modernization Brief')) throw new Error(`Brief generation failed: ${brief}`);
  const draft = await run(['draft', 'outreach', workspaceId, '--home', home]);
  if (!draft.includes('approval:')) throw new Error(`Draft approval was not created: ${draft}`);
  const generatedTickets = await run(['tickets', 'generate', workspaceId, '--home', home]);
  if (!generatedTickets.includes('generated')) throw new Error(`Ticket generation failed: ${generatedTickets}`);
  const tickets = await run(['tickets', 'list', workspaceId, '--home', home]);
  if (!tickets.includes('Confirm customer identity')) throw new Error(`Ticket listing failed: ${tickets}`);
  const designBrief = await run(['design', 'brief', workspaceId, '--home', home]);
  if (!designBrief.includes('design brief:')) throw new Error(`Design brief failed: ${designBrief}`);
  const designMock = await run(['design', 'mock', workspaceId, '--home', home]);
  if (!designMock.includes('design mock:')) throw new Error(`Design mock failed: ${designMock}`);
  const designCritique = await run(['design', 'critique', workspaceId, '--home', home, '--feedback', 'Prefer brighter, more practical service-business styling.']);
  if (!designCritique.includes('design critique:')) throw new Error(`Design critique failed: ${designCritique}`);
  const designRevision = await run(['design', 'revise', workspaceId, '--home', home]);
  if (!designRevision.includes('design revision:')) throw new Error(`Design revision failed: ${designRevision}`);
  const preferences = await run(['preferences', workspaceId, '--home', home]);
  if (!preferences.includes('preferences:')) throw new Error(`Preferences failed: ${preferences}`);
  const dashboard = await run(['dashboard', workspaceId, '--home', home]);
  if (!dashboard.includes('dashboard:')) throw new Error(`Dashboard generation failed: ${dashboard}`);
  const state = await run(['state', workspaceId, '--home', home]);
  if (!state.includes('activeClaims')) throw new Error(`State materialization failed: ${state}`);
  const timeline = await run(['timeline', workspaceId, '--home', home, '--limit', '5']);
  if (!timeline.includes('state.materialized')) throw new Error(`Timeline output failed: ${timeline}`);
  const portfolio = await run(['portfolio', '--home', home]);
  if (!portfolio.includes('Contextula Portfolio')) throw new Error(`Portfolio generation failed: ${portfolio}`);
  const validation = await run(['validate', workspaceId, '--home', home]);
  if (!validation.includes('ok')) throw new Error(`Workspace validation failed: ${validation}`);
  await run(['approve', workspaceId, approvalId, '--home', home]);
  const approvalsAfter = await run(['approvals', workspaceId, '--home', home]);
  if (!approvalsAfter.includes('approved')) throw new Error('Approval did not update to approved');

  console.log('Contextula smoke test passed');
} finally {
  await rm(home, { recursive: true, force: true });
}

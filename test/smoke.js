import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

async function expectFail(args, expected) {
  try {
    await run(args);
  } catch (error) {
    const output = `${error.stdout || ''}\n${error.stderr || ''}\n${error.message || ''}`;
    if (!output.includes(expected)) throw new Error(`Expected failure containing "${expected}", got: ${output}`);
    return;
  }
  throw new Error(`Expected command to fail: ${args.join(' ')}`);
}

try {
  await run(['--help']);
  const providers = await run(['agent', 'providers']);
  if (!providers.includes('static') || !providers.includes('openclaw')) throw new Error(`Provider diagnostics failed: ${providers}`);
  await run(['init', '--home', home]);
  const demo = await run(['demo', 'site', '--home', home, '--name', 'Demo Plumbing', '--website', 'example.org', '--max-pages', '1']);
  if (!demo.includes('No external messages sent')) throw new Error(`Demo flow failed: ${demo}`);
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
  const prompt = await run(['agent', 'prompt', workspaceId, '--home', home]);
  if (!prompt.includes('prompt:')) throw new Error(`Prompt export failed: ${prompt}`);
  const agentResearch = await run(['agent', 'research', workspaceId, '--home', home]);
  if (!agentResearch.includes('agent research complete')) throw new Error(`Agent research failed: ${agentResearch}`);
  if (!agentResearch.includes('provider run: research/provider-runs/run_')) throw new Error(`Provider run artifact missing: ${agentResearch}`);
  const badProviderResponse = path.join(home, 'bad-provider-response.json');
  await writeFile(badProviderResponse, JSON.stringify({ observations: [{ confidence: 0.5 }] }), 'utf8');
  await expectFail(['agent', 'research', workspaceId, '--home', home, '--provider', 'json', '--response', badProviderResponse], 'observations[0].text');
  const goodProviderResponse = path.resolve('docs/fixtures/provider-response-good.json');
  const jsonResearch = await run(['agent', 'research', workspaceId, '--home', home, '--provider', 'json', '--response', goodProviderResponse]);
  if (!jsonResearch.includes('1 new claim')) throw new Error(`JSON provider fixture did not add a claim: ${jsonResearch}`);
  const jsonResearchAgain = await run(['agent', 'research', workspaceId, '--home', home, '--provider', 'json', '--response', goodProviderResponse]);
  if (!jsonResearchAgain.includes('1 duplicate claim')) throw new Error(`JSON provider fixture did not dedupe duplicate claim: ${jsonResearchAgain}`);
  await run(['claim', 'add', workspaceId, '--home', home, '--text', 'Manual smoke-test claim for workspace memory.', '--confidence', '0.7', '--source', 'test']);
  const duplicateManualClaim = await run(['claim', 'add', workspaceId, '--home', home, '--text', 'Manual smoke-test claim for workspace memory.', '--confidence', '0.9', '--source', 'test']);
  if (!duplicateManualClaim.includes('duplicate skipped')) throw new Error(`Manual duplicate claim was not skipped: ${duplicateManualClaim}`);
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
  if (!tickets.includes('Confirm site identity')) throw new Error(`Ticket listing failed: ${tickets}`);
  const designBrief = await run(['design', 'brief', workspaceId, '--home', home]);
  if (!designBrief.includes('design brief:')) throw new Error(`Design brief failed: ${designBrief}`);
  const designPacket = await run(['design', 'packet', workspaceId, '--home', home]);
  if (!designPacket.includes('contextula.design.packet')) throw new Error(`Design packet failed: ${designPacket}`);
  const designPrompt = await run(['design', 'prompt', workspaceId, '--home', home]);
  if (!designPrompt.includes('Contextula Design Generation Task')) throw new Error(`Design prompt failed: ${designPrompt}`);
  const designMock = await run(['design', 'mock', workspaceId, '--home', home]);
  if (!designMock.includes('design mock:')) throw new Error(`Design mock failed: ${designMock}`);
  const designHtml = await run(['design', 'html', workspaceId, '--home', home]);
  if (!designHtml.includes('design html:')) throw new Error(`Design html failed: ${designHtml}`);
  const providerDesignHtml = await run(['design', 'html', workspaceId, '--home', home, '--provider', 'json', '--response', path.resolve('docs/fixtures/design-html-response-good.json'), '--variant', 'provider-fixture']);
  if (!providerDesignHtml.includes('provider run: design/provider-runs/drun_')) throw new Error(`Provider design html failed: ${providerDesignHtml}`);
  if (!providerDesignHtml.includes('approval:')) throw new Error(`Provider design html did not create approval: ${providerDesignHtml}`);
  if (!providerDesignHtml.includes('ops: design/mocks/homepage-provider-fixture.ops.json')) throw new Error(`Provider design html did not create ops sidecar: ${providerDesignHtml}`);
  const designHtmlAgain = await run(['design', 'html', workspaceId, '--home', home]);
  if (designHtml.match(/approval: (appr_[^\s]+)/)?.[1] !== designHtmlAgain.match(/approval: (appr_[^\s]+)/)?.[1]) throw new Error('Design HTML regenerated a duplicate pending approval for the same artifact');
  const visualReference = await run(['visual', 'reference', workspaceId, '--home', home, '--image', path.resolve('docs/fixtures/provider-response-good.json'), '--note', 'Smoke-test visual reference placeholder.']);
  if (!visualReference.includes('visual reference:')) throw new Error(`Visual reference failed: ${visualReference}`);
  const sitePlan = await run(['site', 'plan', workspaceId, '--home', home]);
  if (!sitePlan.includes('site plan:') || !sitePlan.includes('approval:')) throw new Error(`Site plan failed: ${sitePlan}`);
  const siteBuild = await run(['site', 'build', workspaceId, '--home', home]);
  if (!siteBuild.includes('site build:') || !siteBuild.includes('link check: ok')) throw new Error(`Site build failed: ${siteBuild}`);
  const siteCritique = await run(['site', 'critique', workspaceId, '--home', home]);
  if (!siteCritique.includes('site critique:') || !siteCritique.includes('verdict:')) throw new Error(`Site critique failed: ${siteCritique}`);
  if (!siteCritique.includes('learning: site/critique-learning.json')) throw new Error(`Site critique learning missing: ${siteCritique}`);
  const review = await run(['review', workspaceId, '--home', home]);
  if (!review.includes('Review queue')) throw new Error(`Review command failed: ${review}`);
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
  if (!state.includes('classification')) throw new Error(`State classification missing: ${state}`);
  const timeline = await run(['timeline', workspaceId, '--home', home, '--limit', '5']);
  if (!timeline.includes('state.materialized')) throw new Error(`Timeline output failed: ${timeline}`);
  const portfolio = await run(['portfolio', '--home', home]);
  if (!portfolio.includes('Contextula Portfolio')) throw new Error(`Portfolio generation failed: ${portfolio}`);
  const validation = await run(['validate', workspaceId, '--home', home]);
  if (!validation.includes('ok')) throw new Error(`Workspace validation failed: ${validation}`);
  await run(['approve', workspaceId, approvalId, '--home', home]);
  const artifacts = await run(['artifacts', workspaceId, '--home', home]);
  if (!artifacts.includes('reports/dashboard.html')) throw new Error(`Artifact summary failed: ${artifacts}`);
  const approvalsAfter = await run(['approvals', workspaceId, '--home', home]);
  if (!approvalsAfter.includes('approved')) throw new Error('Approval did not update to approved');

  console.log('Contextula smoke test passed');
} finally {
  await rm(home, { recursive: true, force: true });
}

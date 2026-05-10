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

  const approvals = await run(['approvals', workspaceId, '--home', home]);
  const approvalId = approvals.match(/appr_[^\s]+/)?.[0];
  if (!approvalId) throw new Error(`Could not parse approval id from: ${approvals}`);

  await run(['research', workspaceId, '--home', home, '--max-pages', '1']);
  await run(['report', workspaceId, '--home', home]);
  const validation = await run(['validate', workspaceId, '--home', home]);
  if (!validation.includes('ok')) throw new Error(`Workspace validation failed: ${validation}`);
  await run(['approve', workspaceId, approvalId, '--home', home]);
  const approvalsAfter = await run(['approvals', workspaceId, '--home', home]);
  if (!approvalsAfter.includes('approved')) throw new Error('Approval did not update to approved');

  console.log('Contextula smoke test passed');
} finally {
  await rm(home, { recursive: true, force: true });
}

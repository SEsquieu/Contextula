import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runProviderCommand(command, input, { timeoutMs = 120000 } = {}) {
  if (!command) throw new Error('Provider command is required');
  const { stdout } = await execFileAsync(command, [], {
    input,
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 10,
    env: process.env
  });
  return stdout;
}

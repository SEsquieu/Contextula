import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function splitCommand(command) {
  const parts = [];
  let current = '';
  let quote = null;
  for (const char of String(command || '')) {
    if ((char === '"' || char === "'") && !quote) { quote = char; continue; }
    if (char === quote) { quote = null; continue; }
    if (/\s/.test(char) && !quote) {
      if (current) parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}

export async function runProviderCommand(command, input, { timeoutMs = 120000 } = {}) {
  if (!command) throw new Error('Provider command is required');
  const [file, ...args] = splitCommand(command);
  if (!file) throw new Error('Provider command is empty');
  const { stdout } = await execFileAsync(file, args, {
    input,
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 10,
    env: process.env
  });
  return stdout;
}

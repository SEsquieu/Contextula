export function defaultOpenClawResearchCommand() {
  return process.env.CONTEXTULA_OPENCLAW_RESEARCH_COMMAND || process.env.CONTEXTULA_OPENCLAW_COMMAND || null;
}

export function listResearchProviders() {
  const openclawCommand = defaultOpenClawResearchCommand();
  return [
    {
      name: 'static',
      available: true,
      configured: true,
      description: 'Deterministic local provider for tests and smoke flows.'
    },
    {
      name: 'json',
      available: true,
      configured: true,
      description: 'Reads provider JSON from --response <path>.'
    },
    {
      name: 'openclaw',
      available: Boolean(openclawCommand),
      configured: Boolean(openclawCommand),
      command: openclawCommand,
      env: ['CONTEXTULA_OPENCLAW_RESEARCH_COMMAND', 'CONTEXTULA_OPENCLAW_COMMAND'],
      description: 'Runs a configured command that reads the research prompt from stdin and writes provider JSON to stdout.'
    }
  ];
}

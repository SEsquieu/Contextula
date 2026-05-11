export function defaultOpenClawResearchCommand() {
  return process.env.CONTEXTULA_OPENCLAW_RESEARCH_COMMAND || process.env.CONTEXTULA_OPENCLAW_COMMAND || null;
}

export function defaultOpenClawDesignCommand() {
  return process.env.CONTEXTULA_OPENCLAW_DESIGN_COMMAND || process.env.CONTEXTULA_OPENCLAW_COMMAND || null;
}

export function defaultOpenClawSiteCommand() {
  return process.env.CONTEXTULA_OPENCLAW_SITE_COMMAND || process.env.CONTEXTULA_OPENCLAW_COMMAND || null;
}

export function defaultOpenClawContentCommand() {
  return process.env.CONTEXTULA_OPENCLAW_CONTENT_COMMAND || process.env.CONTEXTULA_OPENCLAW_COMMAND || null;
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

export function listDesignProviders() {
  const openclawCommand = defaultOpenClawDesignCommand();
  return [
    {
      name: 'static',
      available: true,
      configured: true,
      description: 'Deterministic procedural design generator.'
    },
    {
      name: 'json',
      available: true,
      configured: true,
      description: 'Reads design provider JSON from --response <path>.'
    },
    {
      name: 'openclaw',
      available: Boolean(openclawCommand),
      configured: Boolean(openclawCommand),
      command: openclawCommand,
      env: ['CONTEXTULA_OPENCLAW_DESIGN_COMMAND', 'CONTEXTULA_OPENCLAW_COMMAND'],
      description: 'Runs a configured command that reads the design prompt from stdin and writes design JSON to stdout.'
    }
  ];
}

export function listContentProviders() {
  const openclawCommand = defaultOpenClawContentCommand();
  return [
    {
      name: 'static',
      available: true,
      configured: true,
      description: 'Deterministic local content drafter.'
    },
    {
      name: 'json',
      available: true,
      configured: true,
      description: 'Reads content provider JSON from --response <path>.'
    },
    {
      name: 'openclaw',
      available: Boolean(openclawCommand),
      configured: Boolean(openclawCommand),
      command: openclawCommand,
      env: ['CONTEXTULA_OPENCLAW_CONTENT_COMMAND', 'CONTEXTULA_OPENCLAW_COMMAND'],
      description: 'Runs a configured command that reads the content prompt from stdin and writes content JSON to stdout.'
    }
  ];
}

export function listSiteProviders() {
  const openclawCommand = defaultOpenClawSiteCommand();
  return [
    {
      name: 'json',
      available: true,
      configured: true,
      description: 'Reads multi-page site provider JSON from --response <path>.'
    },
    {
      name: 'openclaw',
      available: Boolean(openclawCommand),
      configured: Boolean(openclawCommand),
      command: openclawCommand,
      env: ['CONTEXTULA_OPENCLAW_SITE_COMMAND', 'CONTEXTULA_OPENCLAW_COMMAND'],
      description: 'Runs a configured command that reads the site prompt from stdin and writes site JSON to stdout.'
    }
  ];
}

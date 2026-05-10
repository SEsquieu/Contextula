export function classifyWorkspace(claims = []) {
  const text = claims.map((claim) => claim.text || '').join(' ').toLowerCase();
  const isProjectHub = /personal\/project hub|personal project hub|project hub|build-in-public|build in public|experiments|subdomain|music\.grinningfrog|blog\.grinningfrog|lab\.grinningfrog|project routing|launch\/status|launch status/.test(text);
  const isServiceBusiness = /service-business|service business|quote|phone calls|book|schedule|local service|emergency|licensed|insured/.test(text) && !/not a service-business|not a service business|over quote\/contact|over quote/.test(text);

  if (isProjectHub) {
    return {
      kind: 'personal-project-hub',
      label: 'Personal/project hub',
      primaryGoal: 'Orient visitors around projects, experiments, writing, launches, and identity.',
      cta: 'Explore the live projects',
      secondaryCta: 'Read the roadmap',
      sections: ['Signal / status hero', 'Live projects', 'Launch channels', 'Build notes', 'About the maker'],
      avoid: ['quote/contact CTAs', 'service-business copy', 'unsupported trust badges']
    };
  }

  if (isServiceBusiness) {
    return {
      kind: 'service-business',
      label: 'Service business',
      primaryGoal: 'Turn visitor intent into a clear next action while preserving trust signals.',
      cta: 'Call or request a quote',
      secondaryCta: 'See services',
      sections: ['Hero', 'Trust strip', 'Services', 'About / credibility', 'Conversion'],
      avoid: ['unsupported guarantees', 'invented credentials']
    };
  }

  return {
    kind: 'general-presence',
    label: 'General web presence',
    primaryGoal: 'Clarify identity, audience, and the most useful next step.',
    cta: 'Explore the site',
    secondaryCta: 'Learn more',
    sections: ['Hero', 'Highlights', 'About', 'Next steps'],
    avoid: ['over-specific business assumptions']
  };
}

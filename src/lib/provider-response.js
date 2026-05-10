function asArray(value, name) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`Provider response field "${name}" must be an array`);
  return value;
}

function requireText(value, path) {
  if (!value || typeof value !== 'string') throw new Error(`Provider response field "${path}" must be a non-empty string`);
  return value;
}

function confidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}

export function validateProviderResponse(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('Provider response must be an object');
  }

  const observations = asArray(response.observations, 'observations').map((item, index) => ({
    text: requireText(item?.text, `observations[${index}].text`),
    source: typeof item?.source === 'string' && item.source ? item.source : 'agent',
    confidence: confidence(item?.confidence)
  }));

  const claims = asArray(response.claims, 'claims').map((item, index) => ({
    text: requireText(item?.text, `claims[${index}].text`),
    source: typeof item?.source === 'string' && item.source ? item.source : 'agent research',
    confidence: confidence(item?.confidence)
  }));

  const recommendedNextSteps = asArray(response.recommendedNextSteps, 'recommendedNextSteps').map((item, index) => ({
    title: requireText(item?.title, `recommendedNextSteps[${index}].title`),
    rationale: requireText(item?.rationale, `recommendedNextSteps[${index}].rationale`)
  }));

  const openQuestions = asArray(response.openQuestions, 'openQuestions').map((item, index) => requireText(item, `openQuestions[${index}]`));

  return { observations, claims, recommendedNextSteps, openQuestions };
}

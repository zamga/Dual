// Fictional news headlines and the deterministic stand-in for the LLM 48-hour negative-news veto.
// The stand-in is a keyword classifier. It is labelled as a stand-in wherever its output is shown.

export const NEGATIVE_TEMPLATES = [
  '{name} cuts full-year guidance',
  '{name} discloses SEC subpoena',
  '{name} CFO resigns unexpectedly',
  '{name} recalls products after safety review',
  '{name} delays quarterly filing',
  '{name} loses major customer contract',
  '{name} faces class action over disclosures',
  '{name} warns on second-half margins',
  '{name} suspends dividend',
  '{name} discloses material weakness in controls',
  '{name} halts plant after fire',
  'Regulator opens probe into {name}',
  '{name} withdraws outlook citing weak demand',
  '{name} auditor resigns',
];

export const NEUTRAL_TEMPLATES = [
  '{name} announces investor day',
  '{name} names new board member',
  '{name} completes debt refinancing',
  '{name} opens new facility',
  '{name} launches share buyback',
  '{name} wins supply contract',
  '{name} appoints chief technology officer',
  '{name} reaffirms full-year outlook',
  '{name} presents at industry conference',
];

// Keywords the stand-in treats as material negative news (lower-case, matched as substrings).
const NEGATIVE_KEYWORDS = [
  'cuts', 'subpoena', 'resigns', 'recall', 'delays', 'loses', 'class action', 'warns', 'suspends',
  'material weakness', 'halts', 'probe', 'withdraws', 'investigation', 'default', 'downgrade',
];

/** Deterministic stand-in for the LLM veto: true when a headline reads as material negative news. */
export function standInIsNegative(headline) {
  const h = headline.toLowerCase();
  return NEGATIVE_KEYWORDS.some((k) => h.includes(k));
}

export function fillHeadline(template, shortName) {
  return template.replace('{name}', shortName);
}

/** "Karst Robotics Inc." -> "Karst Robotics" for headlines. */
export function shortName(name) {
  return name.replace(/\s+(Inc\.|Corp\.|Co\.|Holdings Inc\.|Group Inc\.|Ltd\.)$/, '');
}

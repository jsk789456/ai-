function normalize(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\s 　]/g, '')
    .replace(/[？?。.!！，,；;：:、()（）\[\]【】"'“”‘’《》<>~`]/g, '')
    .toLowerCase()
    .trim();
}

function matchAnswer(question, bank) {
  if (!question || !bank) return null;
  const q = normalize(question);
  if (!q) return null;

  if (bank[q] != null) return bank[q];

  let best = null;
  let bestLen = 0;
  for (const key of Object.keys(bank)) {
    if (key.length > bestLen && key.includes(q)) {
      best = bank[key];
      bestLen = key.length;
    }
  }
  if (best != null) return best;

  best = null;
  bestLen = 0;
  for (const key of Object.keys(bank)) {
    if (key.length > bestLen && q.includes(key)) {
      best = bank[key];
      bestLen = key.length;
    }
  }
  return best;
}

function buildBank(rawBank) {
  const out = {};
  if (!rawBank) return out;
  for (const k of Object.keys(rawBank)) {
    out[normalize(k)] = rawBank[k];
  }
  return out;
}

function optionMatches(optionText, answerText) {
  if (!optionText || !answerText) return false;
  const a = normalize(optionText);
  const b = normalize(answerText);
  return a === b || a.includes(b) || b.includes(a);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalize, matchAnswer, buildBank, optionMatches };
}
if (typeof window !== 'undefined') {
  window.UAA_ENGINE = { normalize, matchAnswer, buildBank, optionMatches };
}

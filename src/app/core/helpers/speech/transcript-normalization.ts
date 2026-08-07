import {FILIPINO_JW_CANONICAL_TERMS} from './filipino-jw-vocabulary';

type NumberPart =
  | {kind: 'value'; value: number; atomic: boolean}
  | {kind: 'hundred'}
  | {kind: 'scale'; value: number}
  | {kind: 'decimal'}
  | {kind: 'connector'};

const ENGLISH_VALUES = new Map<string, number>([
  ['zero', 0],
  ['oh', 0],
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['thirteen', 13],
  ['fourteen', 14],
  ['fifteen', 15],
  ['sixteen', 16],
  ['seventeen', 17],
  ['eighteen', 18],
  ['nineteen', 19],
  ['twenty', 20],
  ['thirty', 30],
  ['forty', 40],
  ['fifty', 50],
  ['sixty', 60],
  ['seventy', 70],
  ['eighty', 80],
  ['ninety', 90],
]);

const FILIPINO_VALUES = new Map<string, number>([
  ['sero', 0],
  ['zero', 0],
  ['isa', 1],
  ['isang', 1],
  ['dalawa', 2],
  ['dalawang', 2],
  ['tatlo', 3],
  ['tatlong', 3],
  ['apat', 4],
  ['lima', 5],
  ['limang', 5],
  ['anim', 6],
  ['pito', 7],
  ['pitong', 7],
  ['walo', 8],
  ['walong', 8],
  ['siyam', 9],
  ['sampu', 10],
  ['labing', 10],
  ['labin', 10],
  ['labim', 10],
  ['labingisa', 11],
  ['labindalawa', 12],
  ['labintatlo', 13],
  ['labingapat', 14],
  ['labinlima', 15],
  ['labinganim', 16],
  ['labimpito', 17],
  ['labingpito', 17],
  ['labingwalo', 18],
  ['labinsiyam', 19],
  ['sandaan', 100],
  ['isandaan', 100],
  ['dalawampu', 20],
  ['tatlumpu', 30],
  ['apatnapu', 40],
  ['limampu', 50],
  ['animnapu', 60],
  ['pitumpu', 70],
  ['walumpu', 80],
  ['siyamnapu', 90],
]);

const LARGE_SCALES = new Map<string, number>([
  ['thousand', 1_000],
  ['million', 1_000_000],
  ['billion', 1_000_000_000],
  ['libo', 1_000],
  ['libong', 1_000],
  ['milyon', 1_000_000],
  ['milyong', 1_000_000],
  ['bilyon', 1_000_000_000],
  ['bilyong', 1_000_000_000],
]);
const FILIPINO_SCALES = new Set(['libo', 'libong', 'milyon', 'milyong', 'bilyon', 'bilyong']);

const CONNECTORS = new Set(['and', 'at', 'na']);
const DECIMAL_MARKERS = new Set(['point', 'punto', 'tuldok']);
const WORD_PATTERN = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;

export function isFilipinoLanguage(language: string | null | undefined): boolean {
  const base = language?.toLowerCase().split(/[-_]/)[0];
  return base === 'tl' || base === 'fil';
}

export function normalizeTranscriptForSigning(text: string, language: string | null): string {
  const normalizedTerms = language === null || isFilipinoLanguage(language) ? canonicalizeFilipinoTerms(text) : text;
  const baseLanguage = language?.toLowerCase().split(/[-_]/)[0];

  if (language === null || isFilipinoLanguage(language)) {
    return normalizeNumberWords(normalizedTerms, true, true);
  }
  if (baseLanguage === 'en') {
    return normalizeNumberWords(normalizedTerms, true, false);
  }
  return normalizedTerms;
}

export function canonicalizeFilipinoTerms(text: string): string {
  let result = text;
  const terms = FILIPINO_JW_CANONICAL_TERMS.flatMap(term =>
    term.aliases.map(alias => ({canonical: term.canonical, alias}))
  ).sort((a, b) => b.alias.length - a.alias.length);

  for (const {canonical, alias} of terms) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`, 'giu');
    result = result.replace(pattern, (_match, prefix: string) => prefix + canonical);
  }
  return result;
}

function normalizeNumberWords(text: string, includeEnglish: boolean, includeFilipino: boolean): string {
  const tokens = Array.from(text.matchAll(WORD_PATTERN), match => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
  let result = '';
  let cursor = 0;

  for (let i = 0; i < tokens.length; i++) {
    const first = classify(tokens[i].text, includeEnglish, includeFilipino);
    if (!first || first.kind === 'connector' || first.kind === 'decimal') continue;

    const parts: NumberPart[] = [first];
    let endToken = i;
    for (let j = i + 1; j < tokens.length; j++) {
      if (!/^\s*$/.test(text.slice(tokens[j - 1].end, tokens[j].start))) break;
      const part = classify(tokens[j].text, includeEnglish, includeFilipino);
      if (!part) break;
      if (part.kind === 'connector') {
        const following = tokens[j + 1];
        const followingPart = following && classify(following.text, includeEnglish, includeFilipino);
        if (
          !followingPart ||
          followingPart.kind === 'connector' ||
          !connectorCanJoin(tokens[j].text, parts, followingPart) ||
          !/^\s*$/.test(text.slice(tokens[j].end, following.start))
        ) {
          break;
        }
      }
      parts.push(part);
      endToken = j;
    }

    const replacement = parseNumberParts(parts);
    if (replacement === null) continue;
    result += text.slice(cursor, tokens[i].start) + replacement;
    cursor = tokens[endToken].end;
    i = endToken;
  }

  return result + text.slice(cursor);
}

function classify(word: string, includeEnglish: boolean, includeFilipino: boolean): NumberPart | null {
  const normalized = normalizeNumberToken(word);
  const englishValue = includeEnglish ? ENGLISH_VALUES.get(normalized) : undefined;
  if (englishValue !== undefined) return {kind: 'value', value: englishValue, atomic: englishValue < 10};

  const filipinoValue = includeFilipino ? FILIPINO_VALUES.get(normalized) : undefined;
  if (filipinoValue !== undefined) return {kind: 'value', value: filipinoValue, atomic: filipinoValue < 10};

  if (
    (includeEnglish && normalized === 'hundred') ||
    (includeFilipino && (normalized === 'daan' || normalized === 'daang'))
  ) {
    return {kind: 'hundred'};
  }
  const scale = LARGE_SCALES.get(normalized);
  if (scale && (includeFilipino || !FILIPINO_SCALES.has(normalized))) {
    return {kind: 'scale', value: scale};
  }
  if (DECIMAL_MARKERS.has(normalized)) return {kind: 'decimal'};
  if (CONNECTORS.has(normalized)) return {kind: 'connector'};
  return null;
}

function connectorCanJoin(word: string, parts: NumberPart[], following: NumberPart): boolean {
  const normalized = normalizeNumberToken(word);
  if (normalized === 'na') return following.kind === 'hundred' || following.kind === 'scale';
  return parts.some(part => part.kind === 'hundred' || part.kind === 'scale');
}

function normalizeNumberToken(word: string): string {
  return word
    .toLowerCase()
    .replace(/[’']t$/u, '')
    .replace(/[-’']/gu, '');
}

function parseNumberParts(parts: NumberPart[]): string | null {
  const meaningful = parts.filter(part => part.kind !== 'connector');
  const decimalIndex = meaningful.findIndex(part => part.kind === 'decimal');
  if (decimalIndex >= 0) {
    const integer = parseCardinal(meaningful.slice(0, decimalIndex));
    const decimals = meaningful.slice(decimalIndex + 1);
    if (integer === null || decimals.length === 0 || decimals.some(part => part.kind !== 'value' || !part.atomic)) {
      return null;
    }
    return `${integer}.${decimals.map(part => (part as {kind: 'value'; value: number}).value).join('')}`;
  }
  return parseCardinal(meaningful);
}

function parseCardinal(parts: NumberPart[]): string | null {
  if (!parts.length || parts.some(part => part.kind === 'decimal' || part.kind === 'connector')) return null;

  if (parts.length > 1 && parts.every(part => part.kind === 'value' && part.atomic)) {
    return parts.map(part => (part as {kind: 'value'; value: number}).value).join('');
  }

  let total = 0;
  let current = 0;
  for (const part of parts) {
    if (part.kind === 'value') {
      current += part.value;
    } else if (part.kind === 'hundred') {
      current = Math.max(1, current) * 100;
    } else if (part.kind === 'scale') {
      total += Math.max(1, current) * part.value;
      current = 0;
    }
  }
  return String(total + current);
}

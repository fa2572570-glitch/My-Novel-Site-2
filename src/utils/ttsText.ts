// Novel-aware sentence splitter:
// Splits paragraph or title into sentences while preserving quotation marks,
// dialogue attributions, ellipses, abbreviations, and numbers.
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'vs', 'etc', 'eg', 'ie', 'no', 'vol', 'st'
]);

export function splitParagraphIntoSentences(text: string): string[] {
  if (!text || !text.trim()) return [];
  const trimmed = text.trim();

  // Pattern matching potential sentence boundaries:
  // Terminal punctuation (. ! ? or …) followed by optional closing quotes/brackets, followed by whitespace
  const regex = /([.!?]+|…)(["'’”»\)\]]*)\s+/gu;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(trimmed)) !== null) {
    const punct = match[1];
    const quotes = match[2];
    const matchEnd = regex.lastIndex; // index in trimmed where next text starts
    const splitIndex = match.index + punct.length + quotes.length;
    const nextChar = trimmed[matchEnd];

    // 1. If next character is lowercase, it's a continuation (e.g. ellipsis in dialogue or lowercase attribution like "Left!" he said)
    if (nextChar && /\p{Ll}/u.test(nextChar)) {
      continue;
    }

    // 2. Check for abbreviations (e.g., "Mr.", "Dr.", "etc.")
    const textBefore = trimmed.slice(lastIndex, match.index).trim();
    const lastWordMatch = textBefore.match(/([a-zA-Z]+)$/);
    if (lastWordMatch && punct === '.') {
      const lastWord = lastWordMatch[1].toLowerCase();
      if (ABBREVIATIONS.has(lastWord)) {
        continue;
      }
    }

    // 3. Check for numbers/decimals like 1.5 or Chapter 77.1
    const charBeforePunct = trimmed[match.index - 1];
    if (punct === '.' && charBeforePunct && /[0-9]/.test(charBeforePunct) && nextChar && /[0-9]/.test(nextChar)) {
      continue;
    }

    // Valid sentence boundary!
    const sentenceText = trimmed.slice(lastIndex, splitIndex).trim();
    if (sentenceText) {
      sentences.push(sentenceText);
    }
    lastIndex = matchEnd;
  }

  // Add the remainder
  if (lastIndex < trimmed.length) {
    const remaining = trimmed.slice(lastIndex).trim();
    if (remaining) {
      sentences.push(remaining);
    }
  }

  return sentences.length > 0 ? sentences : [trimmed];
}

// Tokenizes a sentence into words and non-words (spaces, punctuation, quotes, dashes)
// preserving the exact characters and assigning 0-based word indices to all spoken words.
export interface WordToken {
  text: string;
  isWord: boolean;
  wordIndex: number;
}

export function tokenizeSentenceWords(sentence: string): WordToken[] {
  if (!sentence) return [];

  // Match words: sequences of letters/numbers that can have internal hyphens or apostrophes
  const wordRegex = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;
  const tokens: WordToken[] = [];
  let lastIndex = 0;
  let wordIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = wordRegex.exec(sentence)) !== null) {
    const matchStart = match.index;
    const matchEnd = wordRegex.lastIndex;

    // Any text before this word (punctuation, spaces, quotes, em dashes, ellipses)
    if (matchStart > lastIndex) {
      tokens.push({
        text: sentence.slice(lastIndex, matchStart),
        isWord: false,
        wordIndex: -1,
      });
    }

    // The word itself
    tokens.push({
      text: match[0],
      isWord: true,
      wordIndex: wordIndex++,
    });

    lastIndex = matchEnd;
  }

  // Any trailing punctuation, quotes, or whitespace
  if (lastIndex < sentence.length) {
    tokens.push({
      text: sentence.slice(lastIndex),
      isWord: false,
      wordIndex: -1,
    });
  }

  return tokens;
}

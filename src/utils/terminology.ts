import { TerminologyRule, IgnoreTerm, TerminologyDictionaryExport } from '../types/terminology';

// Escape string for Regex
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Adjust replacement string to match the casing of the matched target text
function matchCase(target: string, replacement: string): string {
  if (!replacement || typeof replacement !== 'string') return replacement || '';
  if (!target || typeof target !== 'string') return replacement;
  
  // All uppercase e.g. "LUNE" -> "RUNE"
  if (target === target.toUpperCase() && target !== target.toLowerCase()) {
    return replacement.toUpperCase();
  }
  
  // All lowercase e.g. "lune" -> "rune"
  if (target === target.toLowerCase() && target !== target.toUpperCase()) {
    return replacement.toLowerCase();
  }
  
  // Title case e.g. "Lune" -> "Rune"
  if (
    target.length > 0 && 
    target[0] === target[0].toUpperCase() && 
    (target.length === 1 || target.slice(1) === target.slice(1).toLowerCase())
  ) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
  }
  
  return replacement;
}

// Global memo cache for transformed strings
const textCache = new Map<string, string>();
const MAX_CACHE_SIZE = 1000;

export function clearTerminologyCache() {
  textCache.clear();
}

/**
 * Transforms text using active terminology rules while respecting ignore terms.
 * Per-novel rules take precedence over global rules.
 */
export function applyTerminology(
  text: string,
  rules: TerminologyRule[],
  ignoreTerms: IgnoreTerm[],
  currentBookTitle: string,
  isEnabled: boolean,
  trackStats?: (matchedRuleIds: string[]) => void
): string {
  if (!isEnabled || !text || typeof text !== 'string') {
    return text || '';
  }

  const safeRules = Array.isArray(rules) ? rules : [];
  const safeIgnore = Array.isArray(ignoreTerms) ? ignoreTerms : [];
  const bookTitleSafe = typeof currentBookTitle === 'string' ? currentBookTitle : '';

  if (safeRules.length === 0 && safeIgnore.length === 0) {
    return text;
  }

  // Generate cache key based on text, book, enabled rules count & last modification
  const activeRules = safeRules.filter(r => {
    if (!r || !r.enabled || typeof r.original !== 'string' || !r.original.trim()) return false;
    if (r.scope === 'global') return true;
    return r.scope === 'novel' && typeof r.bookTitle === 'string' && r.bookTitle.trim().toLowerCase() === bookTitleSafe.trim().toLowerCase();
  });

  const activeIgnore = safeIgnore.filter(i => {
    if (!i || !i.enabled || typeof i.term !== 'string' || !i.term.trim()) return false;
    if (i.scope === 'global') return true;
    return i.scope === 'novel' && typeof i.bookTitle === 'string' && i.bookTitle.trim().toLowerCase() === bookTitleSafe.trim().toLowerCase();
  });

  if (activeRules.length === 0 && activeIgnore.length === 0) return text;

  // Sort rules: Per-novel rules first, then longer originals first (so "Steam Church" replaces before "Church")
  const sortedRules = [...activeRules].sort((a, b) => {
    if (a.scope !== b.scope) {
      return a.scope === 'novel' ? -1 : 1;
    }
    const aLen = typeof a.original === 'string' ? a.original.length : 0;
    const bLen = typeof b.original === 'string' ? b.original.length : 0;
    return bLen - aLen;
  });

  const cacheKey = `${bookTitleSafe}:${sortedRules.map(r => r.id || r.original).join(',')}:${text}`;
  if (textCache.has(cacheKey)) {
    return textCache.get(cacheKey)!;
  }

  let result = text;

  try {
    // STEP 1: Mask Ignore List Terms with unique tokens
    const ignoreTokens: { token: string; original: string }[] = [];
    if (activeIgnore.length > 0) {
      activeIgnore.forEach((item, idx) => {
        if (!item || typeof item.term !== 'string') return;
        const termTrimmed = item.term.trim();
        if (!termTrimmed) return;
        const escaped = escapeRegExp(termTrimmed);
        if (!escaped) return;
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
        const token = `__TERM_IGNORE_PROTECT_${idx}__`;
        if (regex.test(result)) {
          ignoreTokens.push({ token, original: item.term });
          result = result.replace(regex, token);
        }
      });
    }

    // STEP 2: Apply Terminology Replacement Rules
    const matchedIds: string[] = [];

    sortedRules.forEach(rule => {
      if (!rule || typeof rule.original !== 'string' || typeof rule.replacement !== 'string') return;
      const orig = rule.original.trim();
      if (!orig) return;

      const escaped = escapeRegExp(orig);
      // Determine regex pattern
      // Use word boundaries if wholeWord is true
      const pattern = rule.wholeWord ? `\\b${escaped}\\b` : escaped;
      const regex = new RegExp(pattern, 'gi');

      let isMatched = false;

      result = result.replace(regex, (matched) => {
        isMatched = true;
        if (rule.isCaseAware) {
          return matchCase(matched, rule.replacement);
        }
        return rule.replacement;
      });

      if (isMatched && rule.id) {
        matchedIds.push(rule.id);
      }
    });

    // STEP 3: Unmask Ignore List Tokens
    if (ignoreTokens.length > 0) {
      ignoreTokens.forEach(({ token, original }) => {
        result = result.replaceAll(token, original);
      });
    }

    if (trackStats && matchedIds.length > 0) {
      try {
        trackStats(matchedIds);
      } catch (e) {
        console.error('Error tracking stats:', e);
      }
    }

    // Manage cache size
    if (textCache.size > MAX_CACHE_SIZE) {
      const firstKey = textCache.keys().next().value;
      if (firstKey) textCache.delete(firstKey);
    }

    textCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.error('Error applying terminology:', err);
    return text;
  }
}

/**
 * Preview helper for live testing rules before saving
 */
export function testTerminologyPreview(
  sampleText: string,
  rules: TerminologyRule[],
  ignoreTerms: IgnoreTerm[],
  currentBookTitle: string
): string {
  return applyTerminology(sampleText, rules, ignoreTerms, currentBookTitle, true);
}

/**
 * Default initial sample rules to give users an immediate rich experience
 */
export function getDefaultTerminologyRules(bookTitle: string): TerminologyRule[] {
  return [
    {
      id: 'default-1',
      original: 'Lune',
      replacement: 'Rune',
      category: 'Characters',
      enabled: true,
      scope: 'global',
      isCaseAware: true,
      wholeWord: true,
      matchCount: 14,
      createdAt: Date.now() - 100000
    },
    {
      id: 'default-2',
      original: 'Luo En',
      replacement: 'Rowan',
      category: 'Characters',
      enabled: true,
      scope: 'global',
      isCaseAware: true,
      wholeWord: true,
      matchCount: 8,
      createdAt: Date.now() - 90000
    },
    {
      id: 'default-3',
      original: 'Steam Church',
      replacement: 'Church of Steam',
      category: 'Organizations',
      enabled: true,
      scope: 'novel',
      bookTitle: bookTitle,
      isCaseAware: true,
      wholeWord: true,
      matchCount: 22,
      createdAt: Date.now() - 80000
    },
    {
      id: 'default-4',
      original: 'Machine Spirit',
      replacement: 'Machine Soul',
      category: 'Organizations',
      enabled: true,
      scope: 'global',
      isCaseAware: true,
      wholeWord: true,
      matchCount: 5,
      createdAt: Date.now() - 70000
    },
    {
      id: 'default-5',
      original: 'Black Forest',
      replacement: 'Shadow Forest',
      category: 'Places',
      enabled: true,
      scope: 'novel',
      bookTitle: bookTitle,
      isCaseAware: true,
      wholeWord: true,
      matchCount: 11,
      createdAt: Date.now() - 60000
    },
    {
      id: 'default-6',
      original: 'Spirit Vision',
      replacement: 'Spiritual Sight',
      category: 'Skills',
      enabled: true,
      scope: 'global',
      isCaseAware: true,
      wholeWord: true,
      matchCount: 19,
      createdAt: Date.now() - 50000
    }
  ];
}

export function getDefaultIgnoreTerms(): IgnoreTerm[] {
  return [
    {
      id: 'ignore-1',
      term: 'Luther',
      enabled: true,
      scope: 'global',
      createdAt: Date.now() - 120000
    }
  ];
}

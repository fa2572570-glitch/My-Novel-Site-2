import { Chapter } from '../types/novel';
import { LineCleanerRule, CleanerMatchMode } from '../types/terminology';

export interface CleanScanResult {
  totalMatchingLines: number;
  matchingChaptersCount: number;
  matchedChapters: {
    chapterId: string;
    chapterNumber: number;
    chapterTitle: string;
    matchedIndices: number[];
    sampleMatches: string[];
  }[];
}

export interface CleanerExecutionResult {
  updatedChapters: Chapter[];
  totalRemovedCount: number;
  affectedChaptersCount: number;
}

/**
 * Check if a given line/paragraph matches the pattern under the specified mode.
 */
export function isLineMatch(
  line: string,
  pattern: string,
  mode: CleanerMatchMode,
  caseSensitive: boolean
): boolean {
  if (!pattern || !line) return false;

  const trimmedLine = line.trim();
  const trimmedPattern = pattern.trim();
  if (!trimmedPattern) return false;

  const textToTest = caseSensitive ? trimmedLine : trimmedLine.toLowerCase();
  const patternToTest = caseSensitive ? trimmedPattern : trimmedPattern.toLowerCase();

  switch (mode) {
    case 'exact':
      return textToTest === patternToTest;

    case 'contains':
      return textToTest.includes(patternToTest);

    case 'inline_strip':
      return textToTest.includes(patternToTest);

    case 'regex': {
      try {
        const flags = caseSensitive ? 'u' : 'iu';
        const regex = new RegExp(trimmedPattern, flags);
        return regex.test(trimmedLine);
      } catch (e) {
        return false;
      }
    }

    default:
      return textToTest.includes(patternToTest);
  }
}

/**
 * Strip pattern inline from within a paragraph.
 */
export function stripLineInline(
  line: string,
  pattern: string,
  mode: CleanerMatchMode,
  caseSensitive: boolean
): string {
  if (!pattern || !line) return line;

  if (mode === 'regex') {
    try {
      const flags = caseSensitive ? 'gu' : 'giu';
      const regex = new RegExp(pattern.trim(), flags);
      return line.replace(regex, '').replace(/\s{2,}/g, ' ').trim();
    } catch {
      return line;
    }
  }

  // Exact or Contains or inline_strip: replace occurrences
  const flags = caseSensitive ? 'g' : 'gi';
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, flags);
  return line.replace(regex, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Scan chapters to preview matches before performing the deletion.
 */
export function scanChaptersForPattern(
  chapters: Chapter[],
  pattern: string,
  mode: CleanerMatchMode,
  caseSensitive: boolean,
  targetChapterIndex?: number
): CleanScanResult {
  let totalMatchingLines = 0;
  const matchedChapters: CleanScanResult['matchedChapters'] = [];

  const chaptersToScan = (typeof targetChapterIndex === 'number' && targetChapterIndex >= 0 && targetChapterIndex < chapters.length)
    ? [{ chap: chapters[targetChapterIndex], origIdx: targetChapterIndex }]
    : chapters.map((chap, idx) => ({ chap, origIdx: idx }));

  for (const { chap } of chaptersToScan) {
    if (!chap || !Array.isArray(chap.content)) continue;

    const matchedIndices: number[] = [];
    const sampleMatches: string[] = [];

    chap.content.forEach((para, pIdx) => {
      if (isLineMatch(para, pattern, mode, caseSensitive)) {
        matchedIndices.push(pIdx);
        if (sampleMatches.length < 3) {
          sampleMatches.push(para.trim());
        }
      }
    });

    if (matchedIndices.length > 0) {
      totalMatchingLines += matchedIndices.length;
      matchedChapters.push({
        chapterId: chap.id,
        chapterNumber: chap.number,
        chapterTitle: chap.title,
        matchedIndices,
        sampleMatches
      });
    }
  }

  return {
    totalMatchingLines,
    matchingChaptersCount: matchedChapters.length,
    matchedChapters
  };
}

/**
 * Execute line/boilerplate removal across chapters.
 */
export function executeCleanChapters(
  chapters: Chapter[],
  pattern: string,
  mode: CleanerMatchMode,
  caseSensitive: boolean,
  targetChapterIndex?: number
): CleanerExecutionResult {
  let totalRemovedCount = 0;
  let affectedChaptersCount = 0;

  const targetIdx = (typeof targetChapterIndex === 'number' && targetChapterIndex >= 0 && targetChapterIndex < chapters.length)
    ? targetChapterIndex
    : -1;

  const updatedChapters = chapters.map((chap, idx) => {
    if (!chap || !Array.isArray(chap.content)) return chap;
    if (targetIdx !== -1 && idx !== targetIdx) return chap;

    let chapModified = false;
    let newContent: string[] = [];

    if (mode === 'inline_strip') {
      newContent = chap.content.map(para => {
        if (isLineMatch(para, pattern, mode, caseSensitive)) {
          const stripped = stripLineInline(para, pattern, mode, caseSensitive);
          if (stripped !== para) {
            chapModified = true;
            totalRemovedCount++;
          }
          return stripped;
        }
        return para;
      }).filter(p => p.length > 0); // Drop if it became completely empty
    } else {
      // 'exact', 'contains', 'regex' - drop entire matching paragraphs/lines
      newContent = chap.content.filter(para => {
        const matches = isLineMatch(para, pattern, mode, caseSensitive);
        if (matches) {
          chapModified = true;
          totalRemovedCount++;
          return false; // Remove this line
        }
        return true;
      });
    }

    if (chapModified) {
      affectedChaptersCount++;
      return {
        ...chap,
        content: newContent
      };
    }

    return chap;
  });

  return {
    updatedChapters,
    totalRemovedCount,
    affectedChaptersCount
  };
}

/**
 * Execute all enabled saved cleaner rules across chapters.
 */
export function executeAllCleanerRules(
  chapters: Chapter[],
  rules: LineCleanerRule[],
  currentBookTitle?: string
): { updatedChapters: Chapter[]; totalRemoved: number } {
  let currentChapters = [...chapters];
  let totalRemoved = 0;

  const activeRules = rules.filter(r => {
    if (!r.enabled || !r.pattern.trim()) return false;
    if (r.scope === 'novel' && r.bookTitle && currentBookTitle && r.bookTitle !== currentBookTitle) {
      return false;
    }
    return true;
  });

  for (const rule of activeRules) {
    const res = executeCleanChapters(
      currentChapters,
      rule.pattern,
      rule.mode,
      rule.caseSensitive
    );
    currentChapters = res.updatedChapters;
    totalRemoved += res.totalRemovedCount;
    rule.removedCount = (rule.removedCount || 0) + res.totalRemovedCount;
  }

  return {
    updatedChapters: currentChapters,
    totalRemoved
  };
}

export interface CleanerPreset {
  title: string;
  description: string;
  pattern: string;
  mode: CleanerMatchMode;
}

export const COMMON_CLEANER_PRESETS: CleanerPreset[] = [
  {
    title: 'Errors & Broken Links Notice',
    description: 'Removes common "If you find any errors... please let us know" disclaimers',
    pattern: 'If you find any errors (non-standard content, ads redirect, broken links, etc..), Please let us know so we can fix it as soon as possible.',
    mode: 'contains'
  },
  {
    title: 'Short Error Report Prompt',
    description: 'Removes "Please report any errors to..." footer lines',
    pattern: 'Please report any errors',
    mode: 'contains'
  },
  {
    title: 'Translator Patreon / Discord Notice',
    description: 'Removes Patreon support and Discord community invite footers',
    pattern: 'support us on patreon',
    mode: 'contains'
  },
  {
    title: 'Webnovel Watermark Disclaimer',
    description: 'Removes "Find authorized novels in Webnovel..." watermarks',
    pattern: 'Find authorized novels in Webnovel, faster updates, better experience',
    mode: 'contains'
  },
  {
    title: 'Pirate Aggregator Watermark',
    description: 'Removes "Read latest chapters at..." watermarks',
    pattern: 'Read latest Chapters at',
    mode: 'contains'
  }
];

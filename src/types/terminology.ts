export type TermCategory = 
  | 'Characters' 
  | 'Places' 
  | 'Organizations' 
  | 'Skills' 
  | 'Items' 
  | 'Titles' 
  | 'Creatures' 
  | 'Other';

export const TERMINOLOGY_CATEGORIES: TermCategory[] = [
  'Characters',
  'Places',
  'Organizations',
  'Skills',
  'Items',
  'Titles',
  'Creatures',
  'Other'
];

export interface TerminologyRule {
  id: string;
  original: string;
  replacement: string;
  category: TermCategory;
  enabled: boolean;
  scope: 'global' | 'novel';
  bookTitle?: string; // Optional: associated novel title if scope is 'novel'
  isCaseAware: boolean; // Retains casing (e.g. Rune, rune, RUNE)
  wholeWord: boolean; // Use word boundaries
  matchCount: number;
  createdAt: number;
}

export interface IgnoreTerm {
  id: string;
  term: string;
  enabled: boolean;
  scope: 'global' | 'novel';
  bookTitle?: string;
  createdAt: number;
}

export interface TerminologyDictionaryExport {
  version: number;
  exportedAt: string;
  rules: TerminologyRule[];
  ignoreTerms: IgnoreTerm[];
  cleanerRules?: LineCleanerRule[];
}

export type CleanerMatchMode = 'contains' | 'exact' | 'regex' | 'inline_strip';

export interface LineCleanerRule {
  id: string;
  pattern: string;
  mode: CleanerMatchMode;
  enabled: boolean;
  scope: 'global' | 'novel';
  bookTitle?: string;
  caseSensitive?: boolean;
  removedCount?: number;
  createdAt: number;
}

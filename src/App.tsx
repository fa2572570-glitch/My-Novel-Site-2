import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  BookOpen, 
  Settings, 
  Plus, 
  Trash2, 
  Edit3, 
  Search, 
  Download, 
  Upload, 
  RotateCcw, 
  Menu, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Check, 
  Sparkles, 
  EyeOff, 
  Info,
  AlertTriangle,
  Maximize2,
  Minimize2,
  FileText,
  Play,
  Pause,
  Link,
  CheckSquare,
  Copy,
  Book,
  Layers,
  Palette,
  Headphones,
  Infinity,
  Sliders,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Wand2,
  History
} from 'lucide-react';
import { TerminologyRule, IgnoreTerm, LineCleanerRule } from './types/terminology';
import { applyTerminology, getDefaultTerminologyRules, getDefaultIgnoreTerms } from './utils/terminology';
import { TerminologyManagerModal } from './components/TerminologyManagerModal';
import { TerminologyErrorBoundary } from './components/TerminologyErrorBoundary';
import { TTSSentenceParagraph } from './components/TTSSentenceParagraph';
import { TTSActivePosition } from './types/tts';
import { useEdgeReadAloud } from './hooks/useEdgeReadAloud';
import { EdgeReadAloudBar } from './components/EdgeReadAloudBar';
import { EdgeVoiceOptionsModal } from './components/EdgeVoiceOptionsModal';
import { TTSRecenterFloatingButton } from './components/TTSRecenterFloatingButton';

// Define Interface for Chapter
interface Chapter {
  id: string;
  number: number;
  title: string;
  content: string[];
  url?: string;
}

// Initial default chapters - now empty by default so chapters only appear when fetched or added manually
const DEFAULT_CHAPTERS: Chapter[] = [];

// Helper function to clean and filter a list of paragraphs to remove script blocks and HTML boilerplate while preserving all story text
const cleanChapterParagraphs = (paragraphs: string[]): string[] => {
  if (!paragraphs || !Array.isArray(paragraphs)) return [];
  
  return paragraphs
    .map(p => (typeof p === 'string' ? p.trim() : ''))
    .filter(p => {
      if (!p) return false;
      const lower = p.toLowerCase();
      
      // Only filter out pure HTML/JS script declarations or comment form markup, NEVER prose sentences
      if (
        lower.startsWith('<script') || 
        lower.startsWith('<style') ||
        lower.includes('<![cdata[') ||
        lower === ']]>' ||
        lower.includes('document.getelementbyid(') ||
        lower.includes('window.adsbygoogle')
      ) {
        return false;
      }
      
      return true;
    });
};

// Function to clean a chapter without dropping valid prose or sentences
const cleanGenericChapter = (chap: Chapter): Chapter => {
  if (!chap) return chap;
  
  const cleanedContent = cleanChapterParagraphs(chap.content || []);
  if (cleanedContent.length === 0) {
    return { ...chap, content: [] };
  }
  
  const titleText = (chap.title || "").trim();
  if (!titleText) return { ...chap, content: cleanedContent };

  const firstPara = cleanedContent[0].trim();
  let newTitle = titleText;
  let newContent = [...cleanedContent];
  
  // Is the current title a known generic site banner?
  const isBrandTitle = /^(novellunar|novelbin|webnovel|readnovelfull|freewebnovel|novel|chapter)$/i.test(titleText) || titleText.includes('404');
  const isGenericTitle = /^(chapter|chap\.?|ch\.?|chapiter)\s*\d+$/i.test(titleText);
  
  // Matches "Chapter 1", "Volume 1 Chapter 2", "Chapter 1: Title", "Chapter 1 - Title", "第1章"
  const chapterHeaderRegex = /^(?:#+\s*|\[|\(|==\s*)?(?:volume\s+\d+[\s,:-]+)?(?:chapter|chap\.?|ch\.?|chapiter|第)\s*(\d+|[ivxlcdm]+|[一二三四五六七八九十]+)(?:章|[:.\-–—\s]+(.*))?/i;

  const normTitle = titleText.replace(/[\s\W_]+/g, '').toLowerCase();
  const normPara = firstPara.replace(/[\s\W_]+/g, '').toLowerCase();

  // 1. If the title is bad (brand name or generic), and the first paragraph actually contains a real chapter header, promote it!
  if ((isBrandTitle || isGenericTitle) && chapterHeaderRegex.test(firstPara) && firstPara.length < 150) {
    newTitle = firstPara;
    newContent = newContent.slice(1);
  } 
  // 2. Otherwise, check if the first paragraph is effectively a duplicate of the title
  else if (firstPara.length < 150) {
    if (normPara === normTitle) {
      // Exact match after removing spacing/punctuation (e.g. "Chapter 2 : Title" vs "Chapter 2: Title")
      newContent = newContent.slice(1);
    } else if (normPara.includes(normTitle) || normTitle.includes(normPara)) {
      // One is a substring of the other. Only strip if one of them is explicitly a chapter header
      // e.g. Title: "Born a Sword Maniac", Para: "Chapter 1: Born a Sword Maniac"
      if (chapterHeaderRegex.test(firstPara) || chapterHeaderRegex.test(titleText)) {
        newContent = newContent.slice(1);
      }
    }
  }
  
  return {
    ...chap,
    title: newTitle,
    content: newContent
  };
};

const ReadAloudIcon = (props: React.SVGProps<SVGSVGElement>) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Capital R with horizontal loop and stem */}
      <path d="M6 4h5.5a3.5 3.5 0 0 1 0 7H6" />
      <path d="M6 4v16" />
      <path d="M6 11h3.5l4.5 9" />
      {/* Custom sound waves on the upper-right */}
      <path d="M16 6a3.5 3.5 0 0 1 0 5" />
      <path d="M19 4a6 6 0 0 1 0 9" />
    </svg>
  );
};
const MemoizedChapterView = React.memo(({
  chap,
  idx,
  isFirstRendered,
  currentChapterIndex,
  frameEnabled,
  frameStyles,
  frameBorder,
  currentTheme,
  bookTitle,
  highlightedParagraph,
  renderTransformedText,
  activeTTSPosition,
  isTTSActive,
  highlightMode,
  onSentenceClick
}: any) => {
  return (
    <article 
      id={`chap-article-${chap.id}`}
      data-chapter-index={idx}
      className={frameEnabled ? `chapter-article ${frameStyles.cardClass} mb-12 scroll-mt-20` : "chapter-article relative transition-all duration-300 mb-12 select-text scroll-mt-20"}
      aria-hidden={idx < currentChapterIndex ? "true" : undefined}
      style={{
        ...(frameEnabled ? frameStyles.cardStyle : {}),
        paddingBottom: 'var(--p-margin)'
      }}
    >
      {frameEnabled && frameBorder === 'ornament' && (
        <div 
          className="absolute inset-3 pointer-events-none rounded-[inherit] border border-dashed opacity-40"
          style={{ borderColor: frameStyles.cardStyle?.borderColor || 'rgba(0,0,0,0.15)' }} 
        />
      )}

      {!isFirstRendered && (
        <div id={`hearts-separator-${idx}`} className="text-center py-12 select-none relative">
          <hr className="w-1/3 mx-auto opacity-10 mb-8" style={{ borderColor: frameEnabled ? (frameStyles.cardStyle?.color || currentTheme.text) : currentTheme.text }} />
          <h2 className="font-serif text-2xl md:text-3xl font-semibold mb-2" style={{ letterSpacing: '0.05em' }}>
            {bookTitle}
          </h2>
          <hr className="w-1/12 mx-auto opacity-20 mt-4" style={{ borderColor: currentTheme.accent }} />
        </div>
      )}

      {isFirstRendered && (
        <div id="first-chapter-header" className="text-center pb-8 select-none">
          <h1 className="font-serif text-4xl md:text-5xl font-bold mb-4 tracking-tight">{bookTitle}</h1>
          <hr className="w-1/12 mx-auto opacity-20 mb-8" style={{ borderColor: currentTheme.accent }} />
        </div>
      )}

      <div className="mb-10 text-left">
        <h3 
          className="font-serif font-semibold tracking-tight leading-snug select-text opacity-90 border-b pb-2" 
          style={{ 
            fontSize: 'var(--title-font-size)',
            borderColor: frameEnabled ? (frameStyles.cardStyle?.borderColor || currentTheme.border) : currentTheme.border
          }}
        >
          <TTSSentenceParagraph
            text={renderTransformedText(chap.title)}
            chapterId={chap.id}
            chapterIndex={idx}
            paragraphIndex={-1}
            activeTTSPosition={activeTTSPosition}
            isTTSActive={isTTSActive}
            highlightMode={highlightMode}
            onSentenceClick={onSentenceClick}
            isTitle={true}
          />
        </h3>
      </div>

      <div className="select-text transition-all duration-300 columns-1">
        {chap.content.map((para: string, pIdx: number) => {
          const isHighlighted = highlightedParagraph?.chapterId === chap.id && highlightedParagraph?.paragraphIndex === pIdx;
          return (
            <p 
              id={`chap-${chap.id}-p-${pIdx}`}
              key={pIdx} 
              className={`leading-relaxed rounded px-2 py-1 transition-all duration-1000 ${
                isHighlighted 
                  ? 'bg-[#FF79B0]/25 dark:bg-[#FF79B0]/35 ring-2 ring-[#FF79B0]/60 shadow-lg' 
                  : 'hover:bg-black/5 dark:hover:bg-white/5'
              }`}
              style={{ marginBottom: 'var(--p-margin)' }}
            >
              <TTSSentenceParagraph
                text={renderTransformedText(para)}
                chapterId={chap.id}
                chapterIndex={idx}
                paragraphIndex={pIdx}
                activeTTSPosition={activeTTSPosition}
                isTTSActive={isTTSActive}
                highlightMode={highlightMode}
                onSentenceClick={onSentenceClick}
              />
            </p>
          );
        })}
      </div>
    </article>
  );
}, (prevProps, nextProps) => {
  if (prevProps.chap !== nextProps.chap) return false;
  if (prevProps.idx !== nextProps.idx) return false;
  if (prevProps.isFirstRendered !== nextProps.isFirstRendered) return false;
  
  const prevHidden = prevProps.idx < prevProps.currentChapterIndex;
  const nextHidden = nextProps.idx < nextProps.currentChapterIndex;
  if (prevHidden !== nextHidden) return false;
  
  if (prevProps.frameEnabled !== nextProps.frameEnabled) return false;
  if (prevProps.frameBorder !== nextProps.frameBorder) return false;
  if (prevProps.bookTitle !== nextProps.bookTitle) return false;
  if (prevProps.renderTransformedText !== nextProps.renderTransformedText) return false;
  
  if (prevProps.currentTheme !== nextProps.currentTheme) return false;
  if (prevProps.frameStyles !== nextProps.frameStyles) return false;
  if (Boolean(prevProps.onSentenceClick) !== Boolean(nextProps.onSentenceClick)) return false;
  
  const prevHighlight = prevProps.highlightedParagraph?.chapterId === prevProps.chap.id ? prevProps.highlightedParagraph.paragraphIndex : -1;
  const nextHighlight = nextProps.highlightedParagraph?.chapterId === nextProps.chap.id ? nextProps.highlightedParagraph.paragraphIndex : -1;
  if (prevHighlight !== nextHighlight) return false;
  
  // Re-render only if this specific chapter is involved with active TTS position
  const prevActiveChap = prevProps.activeTTSPosition?.chapterId === prevProps.chap.id;
  const nextActiveChap = nextProps.activeTTSPosition?.chapterId === nextProps.chap.id;
  if (prevActiveChap || nextActiveChap) {
    if (prevProps.activeTTSPosition?.paragraphIndex !== nextProps.activeTTSPosition?.paragraphIndex) return false;
    if (prevProps.activeTTSPosition?.sentenceIndex !== nextProps.activeTTSPosition?.sentenceIndex) return false;
    if (prevProps.activeTTSPosition?.wordIndex !== nextProps.activeTTSPosition?.wordIndex) return false;
    if (prevProps.isTTSActive !== nextProps.isTTSActive) return false;
  }
  
  return true;
});
export default function App() {
  // --- LIBRARY STATE ---
  const [chapters, setChapters] = useState<Chapter[]>(() => {
    const saved = localStorage.getItem('novel_chapters');
    const raw = saved ? JSON.parse(saved) : DEFAULT_CHAPTERS;
    return raw.map(cleanGenericChapter);
  });

  const [bookTitle, setBookTitle] = useState(() => {
    return localStorage.getItem('novel_book_title') || "Deep Sea Embers";
  });

  const [currentChapterIndex, setCurrentChapterIndex] = useState(() => {
    // 1. Synchronously load saved chapters to map the ?chapter parameter or saved position to an array index
    let loadedChapters: Chapter[] = [];
    try {
      const savedChaps = localStorage.getItem('novel_chapters');
      if (savedChaps) {
        const raw = JSON.parse(savedChaps);
        if (Array.isArray(raw)) {
          loadedChapters = raw.map(cleanGenericChapter);
        }
      }
    } catch (e) {
      console.error("Error loading chapters on init:", e);
    }

    if (loadedChapters.length === 0) {
      loadedChapters = DEFAULT_CHAPTERS.map(cleanGenericChapter);
    }

    // 2. Try loading from URL parameter
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlChap = params.get('chapter');
      if (urlChap) {
        // Match by real chapter number first
        const parsedNum = parseInt(urlChap, 10);
        if (!isNaN(parsedNum)) {
          const idx = loadedChapters.findIndex(c => c.number === parsedNum);
          if (idx !== -1) return idx;
        }
        // Match by chapter ID
        const idxById = loadedChapters.findIndex(c => c.id === urlChap);
        if (idxById !== -1) return idxById;

        // Legacy/fallback: index-based
        if (!isNaN(parsedNum) && parsedNum > 0 && parsedNum <= loadedChapters.length) {
          return parsedNum - 1;
        }
      }
    }

    // 3. Try loading from saved active chapter ID or chapter number
    const savedChapId = localStorage.getItem('novel_current_chapter_id');
    if (savedChapId && loadedChapters.length > 0) {
      const idx = loadedChapters.findIndex(c => c.id === savedChapId);
      if (idx !== -1) return idx;
    }
    const savedChapNum = localStorage.getItem('novel_current_chapter_number');
    if (savedChapNum && loadedChapters.length > 0) {
      const parsedNum = parseInt(savedChapNum, 10);
      if (!isNaN(parsedNum)) {
        const idx = loadedChapters.findIndex(c => c.number === parsedNum);
        if (idx !== -1) return idx;
      }
    }

    // Backwards compatibility fallback to saved index
    const savedIdx = localStorage.getItem('novel_current_index');
    if (savedIdx) {
      const parsed = parseInt(savedIdx, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed < loadedChapters.length) {
        return parsed;
      }
    }

    return 0;
  });

  // --- UI LAYOUT STATE ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'reader' | 'add' | 'paste' | 'fetch'>('reader');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'chapters' | 'text'>('chapters');
  const [highlightedParagraph, setHighlightedParagraph] = useState<{ chapterId: string; paragraphIndex: number } | null>(null);
  const [isDistractionFree, setIsDistractionFree] = useState(false);
  const [isReadingSettingsOpen, setIsReadingSettingsOpen] = useState(false);
  const [isQuickNavOpen, setIsQuickNavOpen] = useState(false);
  const [quickNavSearch, setQuickNavSearch] = useState('');

  // Recently visited / reading history tracking (last 8 chapters)
  const [readingHistory, setReadingHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('novel_reading_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (chapters.length === 0) return;
    const activeChap = chapters[currentChapterIndex];
    if (!activeChap) return;
    setReadingHistory(prev => {
      const filtered = prev.filter(id => id !== activeChap.id);
      const next = [activeChap.id, ...filtered].slice(0, 8);
      try {
        localStorage.setItem('novel_reading_history', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, [currentChapterIndex, chapters]);

  const recentChapters = useMemo(() => {
    return readingHistory
      .map(id => chapters.find(c => c.id === id))
      .filter((c): c is Chapter => Boolean(c));
  }, [readingHistory, chapters]);

  // Auto-scroll Quick Chapter Navigator to currently reading chapter on open
  useEffect(() => {
    if (isQuickNavOpen) {
      const activeChap = chapters[currentChapterIndex];
      if (!activeChap) return;
      const timer = setTimeout(() => {
        const targetEl = document.getElementById(`quick-nav-item-${activeChap.id}`);
        if (targetEl) {
          targetEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, 75);
      return () => clearTimeout(timer);
    }
  }, [isQuickNavOpen, currentChapterIndex, chapters]);

  // --- TERMINOLOGY MANAGER STATE ---
  const [isTerminologyEnabled, setIsTerminologyEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('novel_terminology_enabled');
    return saved !== null ? saved === 'true' : true;
  });

  const [terminologyRules, setTerminologyRules] = useState<TerminologyRule[]>(() => {
    try {
      const saved = localStorage.getItem('novel_terminology_rules');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((r): r is TerminologyRule => Boolean(r && typeof r === 'object' && r.original && r.replacement)).map(r => ({
            id: r.id || `term-${Math.random().toString(36).substring(2, 7)}`,
            original: String(r.original),
            replacement: String(r.replacement),
            category: r.category || 'Other',
            enabled: r.enabled !== false,
            scope: r.scope === 'novel' ? 'novel' : 'global',
            bookTitle: r.bookTitle,
            isCaseAware: r.isCaseAware !== false,
            wholeWord: r.wholeWord !== false,
            matchCount: typeof r.matchCount === 'number' ? r.matchCount : 0,
            createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now()
          }));
        }
      }
    } catch (e) {
      console.error('Error loading terminology rules:', e);
    }
    return getDefaultTerminologyRules("Deep Sea Embers");
  });

  const [ignoreTerms, setIgnoreTerms] = useState<IgnoreTerm[]>(() => {
    try {
      const saved = localStorage.getItem('novel_ignore_terms');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((i): i is IgnoreTerm => Boolean(i && typeof i === 'object' && i.term)).map(i => ({
            id: i.id || `ignore-${Math.random().toString(36).substring(2, 7)}`,
            term: String(i.term),
            enabled: i.enabled !== false,
            scope: i.scope === 'novel' ? 'novel' : 'global',
            bookTitle: i.bookTitle,
            createdAt: typeof i.createdAt === 'number' ? i.createdAt : Date.now()
          }));
        }
      }
    } catch (e) {
      console.error('Error loading ignore terms:', e);
    }
    return getDefaultIgnoreTerms();
  });

  const [cleanerRules, setCleanerRules] = useState<LineCleanerRule[]>(() => {
    try {
      const saved = localStorage.getItem('novel_cleaner_rules');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((r): r is LineCleanerRule => Boolean(r && typeof r === 'object' && r.pattern)).map(r => ({
            id: r.id || `cleaner-${Math.random().toString(36).substring(2, 7)}`,
            pattern: String(r.pattern),
            mode: r.mode || 'contains',
            enabled: r.enabled !== false,
            scope: r.scope === 'novel' ? 'novel' : 'global',
            bookTitle: r.bookTitle,
            caseSensitive: r.caseSensitive === true,
            removedCount: typeof r.removedCount === 'number' ? r.removedCount : 0,
            createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now()
          }));
        }
      }
    } catch (e) {
      console.error('Error loading cleaner rules:', e);
    }
    return [];
  });

  const [isTerminologyModalOpen, setIsTerminologyModalOpen] = useState(false);

  // Reset Terminology Rules & Recover from corrupted storage
  const handleResetTerminologyToDefaults = useCallback(() => {
    const defaultRules = getDefaultTerminologyRules(bookTitle || "Deep Sea Embers");
    const defaultIgnores = getDefaultIgnoreTerms();
    setTerminologyRules(defaultRules);
    setIgnoreTerms(defaultIgnores);
    setIsTerminologyEnabled(true);
    try {
      localStorage.removeItem('novel_terminology_rules');
      localStorage.removeItem('novel_ignore_terms');
      localStorage.setItem('novel_terminology_enabled', 'true');
    } catch (e) {
      console.error('Error resetting terminology in localStorage:', e);
    }
    showCustomNotification("Reset terminology dictionary to default rules", "info");
  }, [bookTitle]);

  // Persist Terminology Settings
  useEffect(() => {
    localStorage.setItem('novel_terminology_enabled', isTerminologyEnabled.toString());
  }, [isTerminologyEnabled]);

  useEffect(() => {
    localStorage.setItem('novel_terminology_rules', JSON.stringify(terminologyRules));
  }, [terminologyRules]);

  useEffect(() => {
    localStorage.setItem('novel_ignore_terms', JSON.stringify(ignoreTerms));
  }, [ignoreTerms]);

  useEffect(() => {
    localStorage.setItem('novel_cleaner_rules', JSON.stringify(cleanerRules));
  }, [cleanerRules]);

  // Helper to dynamically apply terminology replacements to chapter title or text without modifying source data
  const renderTransformedText = useCallback((text: string) => {
    if (!text) return '';
    return applyTerminology(text, terminologyRules, ignoreTerms, bookTitle, isTerminologyEnabled);
  }, [terminologyRules, ignoreTerms, bookTitle, isTerminologyEnabled]);

  // Sequential click/tap tracker for Exit Fullscreen button in distraction-free mode
  const [dfClickCount, setDfClickCount] = useState(0);
  const [showDfExit, setShowDfExit] = useState(false);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!isDistractionFree) return;
    
    // Ignore clicks on buttons/inputs inside distraction-free mode
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input')) {
      return;
    }

    setDfClickCount(prev => {
      const next = prev + 1;
      if (next >= 3) {
        setShowDfExit(prevShow => !prevShow); // Toggle exit button visibility
        return 0; // reset
      }
      return next;
    });

    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }
    clickTimeoutRef.current = setTimeout(() => {
      setDfClickCount(0);
    }, 1000); // 1 second window to tap 3 times
  };

  // Consolidated & debounced toggle for distraction-free mode (hiding application chapter header)
  const lastDoubleTapActionRef = useRef<number>(0);
  const toggleDistractionFree = useCallback(() => {
    const now = Date.now();
    // Guard against duplicate execution when touch generates both touchend & synthetic dblclick
    if (now - lastDoubleTapActionRef.current < 400) {
      return;
    }
    lastDoubleTapActionRef.current = now;

    setIsDistractionFree(prev => !prev);
  }, []);

  // Touch tracking for mobile double-tap to toggle distraction-free header bar
  const lastTouchTimeRef = useRef<number>(0);
  const handleCanvasTouchEnd = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('textarea')) {
      return;
    }
    const now = Date.now();
    if (now - lastTouchTimeRef.current < 250) {
      lastTouchTimeRef.current = 0;
      toggleDistractionFree();
    } else {
      lastTouchTimeRef.current = now;
    }
  };

  // --- READING CONTROLS STATE ---
  const [theme, setTheme] = useState<'dark' | 'light' | 'sepia' | 'custom'>(() => {
    const saved = localStorage.getItem('novel_theme');
    if (saved) return saved as any;
    const def = localStorage.getItem('novel_default_profile_theme');
    return (def as any) || 'dark';
  });
  const [customBgColor, setCustomBgColor] = useState(() => {
    return localStorage.getItem('novel_custom_bg') || localStorage.getItem('novel_default_profile_custom_bg') || '#1E2128';
  });
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('novel_font_size') || localStorage.getItem('novel_default_profile_font_size');
    return saved ? parseInt(saved, 10) : 21;
  });
  const [lineHeight, setLineHeight] = useState(() => {
    const saved = localStorage.getItem('novel_line_height') || localStorage.getItem('novel_default_profile_line_height');
    return saved ? parseFloat(saved) : 2.0;
  });
  const [paragraphSpacing, setParagraphSpacing] = useState(() => {
    const saved = localStorage.getItem('novel_paragraph_spacing') || localStorage.getItem('novel_default_profile_paragraph_spacing');
    return saved ? parseFloat(saved) : 2.5;
  });
  const [fontFamily, setFontFamily] = useState<string>(() => {
    return localStorage.getItem('novel_font_family') || localStorage.getItem('novel_default_profile_font_family') || 'Georgia';
  });
  const [pageWidth, setPageWidth] = useState<'narrow' | 'medium' | 'wide' | 'full'>(() => {
    const saved = localStorage.getItem('novel_page_width');
    if (saved) return saved as any;
    const def = localStorage.getItem('novel_default_profile_page_width');
    return (def as any) || 'narrow';
  });
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(orientation: landscape)').matches;
    }
    return false;
  });
  const [infiniteScroll, setInfiniteScroll] = useState(() => {
    const saved = localStorage.getItem('novel_infinite_scroll');
    if (saved !== null) return saved === 'true';
    const def = localStorage.getItem('novel_default_profile_infinite_scroll');
    return def !== null ? def === 'true' : true;
  });

  const [listenMode, setListenMode] = useState(() => {
    const saved = localStorage.getItem('novel_listen_mode');
    return saved === 'true';
  });

  const isInfiniteScrollingMode = infiniteScroll && !listenMode;
  const useWindowScrolling = isInfiniteScrollingMode || listenMode;

  // --- MICROSOFT EDGE READ ALOUD (PART 4: SETTINGS, SLEEP TIMER & CACHE) ---
  const [isVoiceOptionsOpen, setIsVoiceOptionsOpen] = useState(false);
  const {
    state: ttsState,
    SPEED_OPTIONS: ttsSpeedOptions,
    settings: ttsSettings,
    togglePlayPause: ttsTogglePlayPause,
    seekToSentence: ttsSeekToSentence,
    seekToChapterSentence: ttsSeekToChapterSentence,
    nextSentence: ttsNextSentence,
    prevSentence: ttsPrevSentence,
    setPlaybackSpeed: ttsSetPlaybackSpeed,
    stopReadAloud: ttsStopReadAloud,
    setVoice: ttsSetVoice,
    setPitch: ttsSetPitch,
    setHighlightMode: ttsSetHighlightMode,
    setAutoScrollMode: ttsSetAutoScrollMode,
    setVolume: ttsSetVolume,
    setSyncOffset: ttsSetSyncOffset,
    setShowClockInBar: ttsSetShowClockInBar,
    setSleepTimer: ttsSetSleepTimer,
    preloadChapter: ttsPreloadChapter,
    preloadNextChapters: ttsPreloadNextChapters,
    clearCache: ttsClearCache,
    getCacheStats: ttsGetCacheStats,
    getLastSavedPosition: ttsGetLastSavedPosition,
    resumeLastPosition: ttsResumeLastPosition,
    isDetached: ttsIsDetached,
    detachedDirection: ttsDetachedDirection,
    recenterOnActiveSentence: ttsRecenterOnActiveSentence
  } = useEdgeReadAloud({
    chapters,
    currentChapterIndex,
    novelId: bookTitle || 'novel',
    novelTitle: bookTitle,
    onChapterChange: (newIndex) => {
      setCurrentChapterIndex(newIndex);
      const nextChap = chapters[newIndex];
      if (nextChap) {
        const el = document.getElementById(`chapter-${nextChap.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }
  });

  const activeTTSPosition = ttsState.activePosition;
  const isTTSActive = ttsState.isPlaying || ttsState.isActive;

  // Tap-to-Listen Activation State (Defaults to OFF so tapping text does not accidentally play audio)
  const [isTapToListenEnabled, setIsTapToListenEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('novel_tap_to_listen');
    return saved === 'true';
  });

  const handleToggleTapToListen = useCallback(() => {
    setIsTapToListenEnabled(prev => {
      const next = !prev;
      localStorage.setItem('novel_tap_to_listen', next ? 'true' : 'false');
      return next;
    });
  }, []);

  const handleSentenceClick = useCallback((
    chapterId: string,
    chapterIndex: number,
    paragraphIndex: number,
    sentenceIndex: number,
    _sentenceText: string
  ) => {
    if (!isTapToListenEnabled) return;
    ttsSeekToSentence(chapterId, chapterIndex, paragraphIndex, sentenceIndex);
  }, [isTapToListenEnabled, ttsSeekToSentence]);


  // --- AESTHETIC BOOK-PAGE FRAMING STATE ---
  const [frameEnabled, setFrameEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('novel_frame_enabled');
    if (saved !== null) return saved === 'true';
    const def = localStorage.getItem('novel_default_profile_frame_enabled');
    return def !== null ? def === 'true' : false;
  });
  const [frameTheme, setFrameTheme] = useState<'cream' | 'paper' | 'dark' | 'amber' | 'match'>(() => {
    return (localStorage.getItem('novel_frame_theme') as any) || (localStorage.getItem('novel_default_profile_frame_theme') as any) || 'cream';
  });
  const [frameRadius, setFrameRadius] = useState<'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'>(() => {
    return (localStorage.getItem('novel_frame_radius') as any) || (localStorage.getItem('novel_default_profile_frame_radius') as any) || 'lg';
  });
  const [frameBorder, setFrameBorder] = useState<'none' | 'thin' | 'medium' | 'double' | 'ornament'>(() => {
    return (localStorage.getItem('novel_frame_border') as any) || (localStorage.getItem('novel_default_profile_frame_border') as any) || 'thin';
  });
  const [frameShadow, setFrameShadow] = useState<'none' | 'soft' | 'medium' | 'deep'>(() => {
    return (localStorage.getItem('novel_frame_shadow') as any) || (localStorage.getItem('novel_default_profile_frame_shadow') as any) || 'medium';
  });
  const [framePadding, setFramePadding] = useState<'compact' | 'standard' | 'relaxed'>(() => {
    return (localStorage.getItem('novel_frame_padding') as any) || (localStorage.getItem('novel_default_profile_frame_padding') as any) || 'standard';
  });
  const [portraitFrameWidth, setPortraitFrameWidth] = useState<number>(() => {
    const savedPortrait = localStorage.getItem('novel_portrait_frame_width');
    if (savedPortrait !== null) return parseInt(savedPortrait, 10);
    const saved = localStorage.getItem('novel_frame_width');
    if (saved !== null) return parseInt(saved, 10);
    const def = localStorage.getItem('novel_default_profile_frame_width');
    return def !== null ? parseInt(def, 10) : 105;
  });
  const [frameWidth, setFrameWidth] = useState<number>(() => {
    const isL = typeof window !== 'undefined' && (window.matchMedia('(orientation: landscape)').matches || window.innerWidth > window.innerHeight);
    if (isL) {
      return 100;
    }
    const savedPortrait = localStorage.getItem('novel_portrait_frame_width');
    if (savedPortrait !== null) return parseInt(savedPortrait, 10);
    const saved = localStorage.getItem('novel_frame_width');
    if (saved !== null) return parseInt(saved, 10);
    const def = localStorage.getItem('novel_default_profile_frame_width');
    return def !== null ? parseInt(def, 10) : 105;
  });
  const portraitFrameWidthRef = useRef<number>(portraitFrameWidth);
  portraitFrameWidthRef.current = portraitFrameWidth;

  const handleUpdateFrameWidth = (w: number) => {
    setFrameWidth(w);
    if (!isLandscape) {
      setPortraitFrameWidth(w);
      portraitFrameWidthRef.current = w;
      localStorage.setItem('novel_portrait_frame_width', w.toString());
    }
  };

  // --- ADD / PASTE CHAPTER FORMS ---
  const [newNumber, setNewNumber] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const [pasteMultipleText, setPasteMultipleText] = useState('');
  const [pasteSplitMode, setPasteSplitMode] = useState<'chapter' | 'custom'>('chapter');
  const [pasteCustomDelimiter, setPasteCustomDelimiter] = useState('---');

  // --- SMART URL SCRAPER RANGE STATE ---
  const [startUrl, setStartUrl] = useState('');
  const [endUrl, setEndUrl] = useState('');
  const [scrapingQueue, setScrapingQueue] = useState<{ number: number; url: string; status: 'idle' | 'fetching' | 'completed' | 'failed'; error?: string; title?: string }[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeProgressIndex, setScrapeProgressIndex] = useState(0);
  const isScrapingPaused = useRef(false);

  // --- EDIT MODAL STATE ---
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNumber, setEditNumber] = useState('');
  const [editContent, setEditContent] = useState('');

  // --- BULK SELECTION AND MODIFICATION STATES ---
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkTitlePrefix, setBulkTitlePrefix] = useState('');
  const [bulkTitleSuffix, setBulkTitleSuffix] = useState('');
  const [bulkNumberOffset, setBulkNumberOffset] = useState('');
  const [bulkFindText, setBulkFindText] = useState('');
  const [bulkReplaceText, setBulkReplaceText] = useState('');

  // --- CUSTOM DIALOGS & NOTIFICATION STATE ---
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    isDanger: false
  });

  const [pasteAuditDialog, setPasteAuditDialog] = useState<{
    isOpen: boolean;
    chaptersToImport: Chapter[];
    warnings: string[];
    totalWords: number;
    totalParagraphs: number;
    totalCharacters: number;
    hasIncompleteLastSentence: boolean;
  }>({
    isOpen: false,
    chaptersToImport: [],
    warnings: [],
    totalWords: 0,
    totalParagraphs: 0,
    totalCharacters: 0,
    hasIncompleteLastSentence: false,
  });

  const [notification, setNotification] = useState<{
    isOpen: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    isOpen: false,
    message: '',
    type: 'info'
  });

  const showCustomConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    isDanger = false,
    confirmText = 'Confirm',
    cancelText = 'Cancel'
  ) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      },
      confirmText,
      cancelText,
      isDanger
    });
  };

  const showCustomNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({
      isOpen: true,
      message,
      type
    });
    // Autohide after 3 seconds
    setTimeout(() => {
      setNotification(prev => {
        // Only close if it matches current notification message or is still open
        return { ...prev, isOpen: false };
      });
    }, 3000);
  };

  const handleToggleReadingMode = () => {
    setListenMode(prev => !prev);
  };


  // --- ELEMENT REFS ---
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const readerFrameRef = useRef<HTMLDivElement>(null);
  const chaptersEndRef = useRef<HTMLDivElement>(null);
  const infiniteObserverRef = useRef<IntersectionObserver | null>(null);

  // --- LOCAL STATE / FLAGS ---
  const isScrollingFromObserver = useRef(false);
  const isProgrammaticScrolling = useRef(false);

  // --- SCROLL POSITION PRESERVATION ENGINE ---
  const withScrollPreservation = (fn: () => void) => {
    const activeChap = chapters[currentChapterIndex];
    const activeChapId = activeChap ? activeChap.id : null;
    let relativeOffset = 0;
    let targetElement: HTMLElement | null = null;
    const isWinScroll = infiniteScroll && !listenMode;
    const originalScrollY = isWinScroll ? window.scrollY : (readerFrameRef.current?.scrollTop || 0);

    if (activeChapId) {
      const targetId = isWinScroll 
        ? `chap-article-${activeChapId}` 
        : `single-chapter-view`;
      targetElement = document.getElementById(targetId) || document.getElementById(`reader-canvas`);
      if (targetElement) {
        relativeOffset = targetElement.getBoundingClientRect().top;
      }
    }

    // Set programmatic scroll lock to prevent observer/scroll listeners during reflow
    isProgrammaticScrolling.current = true;

    // Call state updater
    fn();

    // Restoration function
    const restore = () => {
      if (activeChapId) {
        const targetId = isWinScroll 
          ? `chap-article-${activeChapId}` 
          : `single-chapter-view`;
        const target = document.getElementById(targetId) || document.getElementById(`reader-canvas`);
        if (target) {
          if (isWinScroll) {
            const currentRectTop = target.getBoundingClientRect().top;
            const delta = currentRectTop - relativeOffset;
            window.scrollBy(0, delta);
          } else {
            const frameEl = readerFrameRef.current;
            if (frameEl) {
              const currentRectTop = target.getBoundingClientRect().top;
              const delta = currentRectTop - relativeOffset;
              frameEl.scrollBy(0, delta);
            }
          }
        }
      } else {
        if (isWinScroll) {
          window.scrollTo(0, originalScrollY);
        } else if (readerFrameRef.current) {
          readerFrameRef.current.scrollTop = originalScrollY;
        }
      }
    };

    // Restore multiple times during the transition to ensure no visible jump
    const delays = [0, 50, 100, 150, 200, 250, 300, 350, 400];
    delays.forEach(delay => {
      setTimeout(() => {
        restore();
        if (delay === 400) {
          isProgrammaticScrolling.current = false;
        }
      }, delay);
    });
  };

  const handleSetSidebarOpen = (open: boolean) => {
    withScrollPreservation(() => {
      setIsSidebarOpen(open);
    });
  };

  const handleSetDistractionFree = (df: boolean) => {
    withScrollPreservation(() => {
      setIsDistractionFree(df);
    });
  };

  const handleSetReadingSettingsOpen = (open: boolean) => {
    withScrollPreservation(() => {
      setIsReadingSettingsOpen(open);
    });
  };

  // Keep active chapter index synchronized with the active chapter ID when chapters array changes
  const activeChapterIdRef = useRef<string | null>(null);
  const viewportUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    const activeChap = chapters[currentChapterIndex];
    if (activeChap) {
      activeChapterIdRef.current = activeChap.id;
    }
  }, [currentChapterIndex, chapters]);

  // Adjust current chapter index if chapter list shifts or modifies
  useEffect(() => {
    if (chapters.length === 0) return;
    const previousId = activeChapterIdRef.current;
    if (previousId) {
      const newIdx = chapters.findIndex(c => c.id === previousId);
      if (newIdx !== -1 && newIdx !== currentChapterIndex) {
        isProgrammaticScrolling.current = true;
        setCurrentChapterIndex(newIdx);
        setTimeout(() => {
          isProgrammaticScrolling.current = false;
        }, 50);
      }
    }
  }, [chapters]);

  // --- LOCAL PERSISTENCE AUTOSAVE ---
  useEffect(() => {
    try {
      localStorage.setItem('novel_chapters', JSON.stringify(chapters));
    } catch (e) {
      console.warn("Storage limit reached when saving chapters:", e);
    }
  }, [chapters]);

  useEffect(() => {
    localStorage.setItem('novel_book_title', bookTitle);
  }, [bookTitle]);

  useEffect(() => {
    localStorage.setItem('novel_current_index', currentChapterIndex.toString());
    const activeChap = chapters[currentChapterIndex];
    if (activeChap) {
      localStorage.setItem('novel_current_chapter_id', activeChap.id);
      localStorage.setItem('novel_current_chapter_number', activeChap.number.toString());
    }
  }, [currentChapterIndex, chapters]);

  useEffect(() => {
    localStorage.setItem('novel_theme', theme);
    const isDark = theme === 'dark' || (theme === 'custom' && isBgDark(customBgColor));
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme, customBgColor]);

  useEffect(() => {
    localStorage.setItem('novel_custom_bg', customBgColor);
  }, [customBgColor]);

  useEffect(() => {
    localStorage.setItem('novel_font_size', fontSize.toString());
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('novel_line_height', lineHeight.toString());
  }, [lineHeight]);

  useEffect(() => {
    localStorage.setItem('novel_paragraph_spacing', paragraphSpacing.toString());
  }, [paragraphSpacing]);

  useEffect(() => {
    localStorage.setItem('novel_font_family', fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    localStorage.setItem('novel_page_width', pageWidth);
  }, [pageWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(orientation: landscape)');
    const handleOrientationChange = () => {
      const isL = mediaQuery.matches || window.innerWidth > window.innerHeight;
      setIsLandscape(isL);
    };
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleOrientationChange);
    } else {
      mediaQuery.addListener(handleOrientationChange);
    }
    window.addEventListener('resize', handleOrientationChange);
    window.addEventListener('orientationchange', handleOrientationChange);
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleOrientationChange);
      } else {
        mediaQuery.removeListener(handleOrientationChange);
      }
      window.removeEventListener('resize', handleOrientationChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  // Automatic sheet width adaptation: 100% in landscape, restores to original setting in vertical/portrait
  const prevIsLandscapeRef = useRef<boolean>(isLandscape);
  useEffect(() => {
    if (prevIsLandscapeRef.current !== isLandscape) {
      if (isLandscape) {
        // Going to Landscape:
        // Save current frameWidth as portrait width
        const currentPortrait = portraitFrameWidthRef.current || 105;
        setPortraitFrameWidth(currentPortrait);
        localStorage.setItem('novel_portrait_frame_width', currentPortrait.toString());
        setFrameWidth(100);
      } else {
        // Going back to Vertical / Portrait:
        // Restore to what was originally set
        const savedPortrait = localStorage.getItem('novel_portrait_frame_width');
        const restoreVal = savedPortrait ? parseInt(savedPortrait, 10) : portraitFrameWidthRef.current;
        setFrameWidth(restoreVal || 105);
      }
      prevIsLandscapeRef.current = isLandscape;
    }
  }, [isLandscape]);

  useEffect(() => {
    localStorage.setItem('novel_infinite_scroll', infiniteScroll.toString());
  }, [infiniteScroll]);

  useEffect(() => {
    localStorage.setItem('novel_listen_mode', listenMode.toString());
  }, [listenMode]);

  useEffect(() => {
    localStorage.setItem('novel_frame_enabled', frameEnabled.toString());
  }, [frameEnabled]);

  useEffect(() => {
    localStorage.setItem('novel_frame_theme', frameTheme);
  }, [frameTheme]);

  useEffect(() => {
    localStorage.setItem('novel_frame_radius', frameRadius);
  }, [frameRadius]);

  useEffect(() => {
    localStorage.setItem('novel_frame_border', frameBorder);
  }, [frameBorder]);

  useEffect(() => {
    localStorage.setItem('novel_frame_shadow', frameShadow);
  }, [frameShadow]);

  useEffect(() => {
    localStorage.setItem('novel_frame_padding', framePadding);
  }, [framePadding]);

  useEffect(() => {
    localStorage.setItem('novel_frame_width', frameWidth.toString());
    if (!isLandscape) {
      localStorage.setItem('novel_portrait_frame_width', frameWidth.toString());
    }
  }, [frameWidth, isLandscape]);

  // Reset distraction-free click tracking when state changes
  useEffect(() => {
    if (!isDistractionFree) {
      setShowDfExit(false);
      setDfClickCount(0);
    }
  }, [isDistractionFree]);

  // Update document title, browser history URL, and page metadata for the current active chapter
  useEffect(() => {
    if (chapters.length === 0) return;
    const activeChap = chapters[currentChapterIndex];
    if (!activeChap) return;

    // 1. Update document title
    const pageTitle = `${activeChap.title} - ${bookTitle}`;
    document.title = pageTitle;

    // 2. Update metadata (description and OpenGraph)
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    const excerpt = activeChap.content && activeChap.content[0]
      ? activeChap.content[0].substring(0, 150) + '...'
      : `Read ${activeChap.title} from ${bookTitle}`;
    metaDesc.setAttribute('content', excerpt);

    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) {
      ogTitle = document.createElement('meta');
      ogTitle.setAttribute('property', 'og:title');
      document.head.appendChild(ogTitle);
    }
    ogTitle.setAttribute('content', pageTitle);

    let ogDesc = document.querySelector('meta[property="og:description"]');
    if (!ogDesc) {
      ogDesc = document.createElement('meta');
      ogDesc.setAttribute('property', 'og:description');
      document.head.appendChild(ogDesc);
    }
    ogDesc.setAttribute('content', excerpt);

    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    const currentUrl = new URL(window.location.href);
    const chapIdentifier = (activeChap.number !== undefined && activeChap.number !== null) 
      ? activeChap.number.toString() 
      : activeChap.id;
    currentUrl.searchParams.set('chapter', chapIdentifier);
    canonicalLink.setAttribute('href', currentUrl.toString());

    // 3. Update browser history state to reflect the current active chapter
    window.history.replaceState(
      { 
        chapterIndex: currentChapterIndex,
        chapterId: activeChap.id,
        chapterNumber: activeChap.number,
        chapterIdentifier: chapIdentifier
      },
      pageTitle,
      `?chapter=${chapIdentifier}`
    );
  }, [currentChapterIndex, chapters, bookTitle]);

  // Listen for browser popstate (Back/Forward history navigation)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (chapters.length === 0) return;

      // 1. Check history state object
      if (event.state) {
        if (event.state.chapterNumber !== undefined && event.state.chapterNumber !== null) {
          const idx = chapters.findIndex(c => c.number === event.state.chapterNumber);
          if (idx !== -1) {
            setCurrentChapterIndex(idx);
            return;
          }
        }
        if (event.state.chapterId) {
          const idx = chapters.findIndex(c => c.id === event.state.chapterId);
          if (idx !== -1) {
            setCurrentChapterIndex(idx);
            return;
          }
        }
      }

      // 2. Check URL search parameters
      const params = new URLSearchParams(window.location.search);
      const urlChap = params.get('chapter');
      if (urlChap) {
        const parsedNum = parseInt(urlChap, 10);
        if (!isNaN(parsedNum)) {
          const idx = chapters.findIndex(c => c.number === parsedNum);
          if (idx !== -1) {
            setCurrentChapterIndex(idx);
            return;
          }
        }
        const idxById = chapters.findIndex(c => c.id === urlChap);
        if (idxById !== -1) {
          setCurrentChapterIndex(idxById);
          return;
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [chapters]);

  // Track currentChapterIndex in ref to avoid stale closures
  const currentChapterIndexRef = useRef(currentChapterIndex);
  useEffect(() => {
    currentChapterIndexRef.current = currentChapterIndex;
  }, [currentChapterIndex]);

  // Determine which chapter is currently visible in the viewport and update active index
  const updateActiveChapterFromViewport = useCallback(() => {
    if (!useWindowScrolling || chapters.length === 0) return;
    if (isProgrammaticScrolling.current) return;

    if (viewportUpdateTimeoutRef.current) {
      clearTimeout(viewportUpdateTimeoutRef.current);
    }
    viewportUpdateTimeoutRef.current = setTimeout(() => {
      const articles = document.querySelectorAll('.chapter-article');
      if (articles.length === 0) return;

      const viewportHeight = window.innerHeight;
      // Focal line for active reading: 150px below top of viewport (accounting for header ~60px)
      const focalY = Math.min(180, Math.max(100, viewportHeight * 0.25));

      let bestIndex = -1;
      let maxVisibleHeight = -1;
      let closestDistance = Number.POSITIVE_INFINITY;

      const articleList = Array.from(articles);

      // Priority 1: Chapter spans across the focal line
      for (const art of articleList) {
        const indexAttr = art.getAttribute('data-chapter-index');
        if (indexAttr === null) continue;
        const index = parseInt(indexAttr, 10);
        if (isNaN(index)) continue;

        const rect = art.getBoundingClientRect();
        if (rect.top <= focalY && rect.bottom > focalY) {
          bestIndex = index;
          break; // Stop immediately once active chapter spanning focal reading line is found
        }
      }

      // Priority 2: If no chapter covers focal line, find chapter with maximum visible height in viewport
      if (bestIndex === -1) {
        let maxVisibleHeight2 = -1;
        let closestDistance2 = Number.POSITIVE_INFINITY;

        for (const art of articleList) {
          const indexAttr = art.getAttribute('data-chapter-index');
          if (indexAttr === null) continue;
          const index = parseInt(indexAttr, 10);
          if (isNaN(index)) continue;

          const rect = art.getBoundingClientRect();
          const visibleTop = Math.max(0, rect.top);
          const visibleBottom = Math.min(viewportHeight, rect.bottom);
          const visibleHeight = visibleBottom - visibleTop;

          if (visibleHeight > maxVisibleHeight2 && visibleHeight > 0) {
            maxVisibleHeight2 = visibleHeight;
            bestIndex = index;
          } else if (maxVisibleHeight2 <= 0) {
            const distance = Math.abs(rect.top - focalY);
            if (distance < closestDistance2) {
              closestDistance2 = distance;
              bestIndex = index;
            }
          }
        }
      }

      if (bestIndex !== -1 && bestIndex !== currentChapterIndexRef.current) {
        isScrollingFromObserver.current = true;
        setCurrentChapterIndex(bestIndex);
      }
    }, 150);
  }, [useWindowScrolling, chapters]);

  // Load last scroll position or scroll to top on chapter change
  useEffect(() => {
    if (listenMode) {
      window.scrollTo(0, 0);
      if (readerFrameRef.current) {
        readerFrameRef.current.scrollTo(0, 0);
      }
      return;
    }

    if (infiniteScroll) {
      if (isScrollingFromObserver.current) {
        // Change was triggered by natural scrolling - do NOT scroll/jump
        isScrollingFromObserver.current = false;
        return;
      }
      // Jump/snap to targeted chapter article if triggered explicitly
      const targetElement = document.getElementById(`chap-article-${chapters[currentChapterIndex]?.id}`);
      if (targetElement) {
        isProgrammaticScrolling.current = true;
        targetElement.scrollIntoView({ behavior: 'auto', block: 'start' });
        setTimeout(() => {
          isProgrammaticScrolling.current = false;
          updateActiveChapterFromViewport();
        }, 150);
      }
      return;
    }

    // Single chapter mode: standard scroll restore or scroll to top inside readerFrameRef
    const activeChap = chapters[currentChapterIndex];
    const scrollKey = activeChap ? `scroll_pos_${activeChap.id}` : `scroll_pos_idx_${currentChapterIndex}`;
    const savedScrollY = localStorage.getItem(scrollKey) || (activeChap ? localStorage.getItem(`scroll_pos_${currentChapterIndex}`) : null);
    if (savedScrollY && readerFrameRef.current) {
      readerFrameRef.current.scrollTo(0, parseInt(savedScrollY, 10));
    } else if (readerFrameRef.current) {
      readerFrameRef.current.scrollTo(0, 0);
    }
  }, [currentChapterIndex, infiniteScroll, listenMode, updateActiveChapterFromViewport]);

  // Restore saved overall infinite scroll position on mount
  useEffect(() => {
    if (isInfiniteScrollingMode) {
      const savedInfiniteScroll = localStorage.getItem('scroll_pos_infinite');
      if (savedInfiniteScroll) {
        setTimeout(() => {
          isProgrammaticScrolling.current = true;
          window.scrollTo(0, parseInt(savedInfiniteScroll, 10));
          setTimeout(() => {
            isProgrammaticScrolling.current = false;
            updateActiveChapterFromViewport();
          }, 500);
        }, 100);
      }
    }
  }, [isInfiniteScrollingMode, updateActiveChapterFromViewport]);

  // Handle scroll tracking to auto-save position and update active chapter on scroll
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout | null = null;
    let lastScrollTime = 0;

    const executeScrollLogic = () => {
      if (useWindowScrolling) {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        if (isInfiniteScrollingMode) {
          localStorage.setItem(`scroll_pos_infinite`, scrollTop.toString());
        }
        if (!isProgrammaticScrolling.current) {
          updateActiveChapterFromViewport();
        }
      } else {
        if (!readerFrameRef.current) return;
        const scrollTop = readerFrameRef.current.scrollTop;
        const chapId = activeChapterIdRef.current;
        if (chapId) {
          localStorage.setItem(`scroll_pos_${chapId}`, scrollTop.toString());
        }
        localStorage.setItem(`scroll_pos_${currentChapterIndexRef.current}`, scrollTop.toString());
      }
    };

    const handleScroll = () => {
      const now = Date.now();
      if (now - lastScrollTime < 150) {
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          lastScrollTime = Date.now();
          executeScrollLogic();
        }, 150);
        return;
      }
      lastScrollTime = now;
      executeScrollLogic();
    };

    if (useWindowScrolling) {
      window.addEventListener('scroll', handleScroll, { passive: true });
      window.addEventListener('resize', handleScroll, { passive: true });
    } else {
      const frameEl = readerFrameRef.current;
      if (frameEl) {
        frameEl.addEventListener('scroll', handleScroll, { passive: true });
      }
    }

    return () => {
      if (scrollTimeout) clearTimeout(scrollTimeout);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (readerFrameRef.current) {
        readerFrameRef.current.removeEventListener('scroll', handleScroll);
      }
    };
  }, [useWindowScrolling, isInfiniteScrollingMode, listenMode, updateActiveChapterFromViewport]);

  // Setup IntersectionObserver as additional helper for Infinite Scroll
  useEffect(() => {
    if (!useWindowScrolling || chapters.length === 0) return;

    if (infiniteObserverRef.current) {
      infiniteObserverRef.current.disconnect();
    }

    infiniteObserverRef.current = new IntersectionObserver(() => {
      if (!isProgrammaticScrolling.current) {
        updateActiveChapterFromViewport();
      }
    }, {
      root: null,
      rootMargin: '-10% 0px -40% 0px'
    });

    const articles = document.querySelectorAll('.chapter-article');
    articles.forEach(art => {
      infiniteObserverRef.current?.observe(art);
    });

    return () => {
      infiniteObserverRef.current?.disconnect();
    };
  }, [useWindowScrolling, chapters, updateActiveChapterFromViewport]);

  // Sync active chapter on chapter list load/updates in Infinity Mode
  useEffect(() => {
    if (isInfiniteScrollingMode && chapters.length > 0) {
      const timer = setTimeout(() => {
        updateActiveChapterFromViewport();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [chapters, isInfiniteScrollingMode, updateActiveChapterFromViewport]);

  // Auto-scroll sidebar's active chapter item into view
  useEffect(() => {
    const activeChap = chapters[currentChapterIndex];
    if (activeChap) {
      const sidebarItem = document.getElementById(`chapter-item-${activeChap.id}`);
      if (sidebarItem) {
        sidebarItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentChapterIndex, chapters]);

  // --- THEME COLOR MAPS ---
  const isBgDark = (bgColor: string) => {
    const cleanHex = bgColor.replace('#', '');
    if (cleanHex.length !== 6) return true;
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq < 128;
  };

  const themeStyles = {
    dark: {
      bg: '#1E2128', // Exact HEX requested by user
      text: '#E2E8F0', // Highly readable light-gray
      secondaryText: '#94A3B8',
      border: 'rgba(255, 255, 255, 0.08)',
      accent: '#FF79B0', // Rosy pink to match the glowing pink/yellow heart aesthetic
      cardBg: '#181B21',
      sidebarBg: '#15181F'
    },
    light: {
      bg: '#FAF8F5',
      text: '#1F2937',
      secondaryText: '#4B5563',
      border: 'rgba(0, 0, 0, 0.08)',
      accent: '#E11D48',
      cardBg: '#FFFFFF',
      sidebarBg: '#F3F4F6'
    },
    sepia: {
      bg: '#F5EFEB',
      text: '#3E2A14',
      secondaryText: '#725E43',
      border: 'rgba(62, 42, 20, 0.08)',
      accent: '#B45309',
      cardBg: '#FBF8F6',
      sidebarBg: '#EAE1D9'
    }
  };

  const getThemeDetails = () => {
    if (theme === 'custom') {
      const dark = isBgDark(customBgColor);
      return {
        bg: customBgColor,
        text: dark ? '#E2E8F0' : '#1F2937',
        secondaryText: dark ? '#94A3B8' : '#4B5563',
        border: dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
        accent: dark ? '#FF79B0' : '#E11D48',
        cardBg: customBgColor,
        sidebarBg: dark ? '#15181F' : '#F3F4F6'
      };
    }
    return themeStyles[theme];
  };

  const currentTheme = getThemeDetails();

  // --- GET BEAUTIFUL BOOK-PAGE FRAME STYLES ---
  const getFrameStyles = () => {
    if (!frameEnabled) return { cardClass: '', cardStyle: {}, outerStyle: {} };

    // 1. Theme/background & text colors
    let cardBg = '#FDFBF7';
    let cardText = '#2D251E';
    let cardBorderColor = 'rgba(215, 203, 185, 0.6)';

    if (frameTheme === 'paper') {
      cardBg = '#FFFFFF';
      cardText = '#1A1A1A';
      cardBorderColor = 'rgba(0, 0, 0, 0.08)';
    } else if (frameTheme === 'amber') {
      cardBg = '#FDF6E2';
      cardText = '#4A2A00';
      cardBorderColor = 'rgba(217, 119, 6, 0.2)';
    } else if (frameTheme === 'dark') {
      cardBg = '#141721';
      cardText = '#E2E8F0';
      cardBorderColor = 'rgba(255, 255, 255, 0.08)';
    } else if (frameTheme === 'match') {
      cardBg = currentTheme.cardBg;
      cardText = currentTheme.text;
      cardBorderColor = currentTheme.border;
    }

    // 2. Rounded Corners (Radius)
    let radiusClass = 'rounded-xl';
    if (frameRadius === 'none') radiusClass = 'rounded-none';
    else if (frameRadius === 'sm') radiusClass = 'rounded-md';
    else if (frameRadius === 'md') radiusClass = 'rounded-xl';
    else if (frameRadius === 'lg') radiusClass = 'rounded-2xl';
    else if (frameRadius === 'xl') radiusClass = 'rounded-3xl';
    else if (frameRadius === '2xl') radiusClass = 'rounded-[32px]';

    // 3. Border style
    let borderClass = 'border';
    let borderStyle: React.CSSProperties = { borderColor: cardBorderColor };
    if (frameBorder === 'none') {
      borderClass = 'border-0';
    } else if (frameBorder === 'thin') {
      borderClass = 'border';
    } else if (frameBorder === 'medium') {
      borderClass = 'border-2';
    } else if (frameBorder === 'double') {
      borderClass = 'border-4 border-double';
    } else if (frameBorder === 'ornament') {
      borderClass = 'border';
    }

    // 4. Shadow depth
    let shadowClass = 'shadow-md';
    if (frameShadow === 'none') shadowClass = 'shadow-none';
    else if (frameShadow === 'soft') shadowClass = 'shadow-sm';
    else if (frameShadow === 'medium') shadowClass = 'shadow-md md:shadow-lg';
    else if (frameShadow === 'deep') shadowClass = 'shadow-xl md:shadow-2xl';

    // 5. Padding
    let paddingClass = 'p-6 md:p-12';
    if (framePadding === 'compact') paddingClass = 'p-4 md:p-8';
    else if (framePadding === 'standard') paddingClass = 'p-6 md:p-12';
    else if (framePadding === 'relaxed') paddingClass = 'p-8 md:p-16';

    // Surround the app reader-canvas with a slightly different depth color to make card pop!
    let outerStyle: React.CSSProperties = {};
    const isThemeDark = isBgDark(currentTheme.bg);
    if (isThemeDark) {
      outerStyle.backgroundColor = '#0E1015'; // beautiful midnight background to frame card
    } else {
      outerStyle.backgroundColor = '#F0EDE8'; // soft stone-tabletop color to frame card
    }

    return {
      cardClass: `${radiusClass} ${borderClass} ${shadowClass} ${paddingClass} mx-auto transition-all duration-300 relative select-text`,
      cardStyle: {
        backgroundColor: cardBg,
        color: cardText,
        borderColor: cardBorderColor,
        ...borderStyle
      },
      outerStyle
    };
  };

  const frameStyles = getFrameStyles();

  // --- FONT STYLE MAPS & LISTS ---
  const FONT_MAP: Record<string, string> = {
    Lora: "'Lora', Georgia, serif",
    Merriweather: "'Merriweather', Georgia, serif",
    Georgia: "Georgia, Cambria, 'Times New Roman', serif",
    Inter: "'Inter', system-ui, -apple-system, sans-serif",
    "DM Sans": "'DM Sans', system-ui, -apple-system, sans-serif",
    System: "system-ui, -apple-system, sans-serif"
  };

  const FONTS_LIST = [
    { name: 'Lora', type: 'Serif' },
    { name: 'Merriweather', type: 'Serif' },
    { name: 'Georgia', type: 'Serif' },
    { name: 'Inter', type: 'Sans-serif' },
    { name: 'DM Sans', type: 'Sans-serif' },
    { name: 'System', type: 'Sans-serif' },
  ];

  const COLOR_PRESETS = [
    { name: 'dark-default', hex: '#1E2128', text: '#E2E8F0' },
    { name: 'light-default', hex: '#FAF8F5', text: '#1F2937' },
    { name: 'light-white', hex: '#FFFFFF', text: '#111827' },
    { name: 'sepia', hex: '#F4ECD8', text: '#3E2A14' },
    { name: 'peach', hex: '#FAF5EB', text: '#3E2A14' },
    { name: 'gray', hex: '#F3F4F6', text: '#1F2937' },
    { name: 'navy', hex: '#0F172A', text: '#F1F5F9' },
  ];

  // --- CHAPTER CRUD HANDLERS ---
  const handleAddChapter = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(newNumber, 10);
    if (isNaN(num) || !newTitle.trim() || !newContent.trim()) {
      alert("Please fill in all fields with valid values.");
      return;
    }

    const newChapter: Chapter = cleanGenericChapter({
      id: `manual-${Date.now()}`,
      number: num,
      title: newTitle.trim(),
      content: newContent.split('\n').map(p => p.trim()).filter(Boolean)
    });

    const updated = [...chapters, newChapter].sort((a, b) => a.number - b.number);
    setChapters(updated);
    
    // Switch to reader, select new chapter
    const newIdx = updated.findIndex(c => c.id === newChapter.id);
    if (newIdx !== -1) {
      setCurrentChapterIndex(newIdx);
    }
    
    // Clear form
    setNewNumber('');
    setNewTitle('');
    setNewContent('');
    setActiveTab('reader');
  };

  const handleDeleteChapter = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    showCustomConfirm(
      "Delete Chapter",
      "Are you sure you want to delete this chapter? This action cannot be undone.",
      () => {
        const updated = chapters.filter(c => c.id !== id);
        if (updated.length === 0) {
          setChapters([]);
          setCurrentChapterIndex(0);
          showCustomNotification("Chapter deleted successfully.", "success");
          return;
        }

        setChapters(updated);
        if (currentChapterIndex >= updated.length) {
          setCurrentChapterIndex(updated.length - 1);
        }
        showCustomNotification("Chapter deleted successfully.", "success");
      },
      true, // isDanger
      "Delete",
      "Cancel"
    );
  };

  const handleEditChapter = (chapter: Chapter, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChapter(chapter);
    setEditTitle(chapter.title);
    setEditNumber(chapter.number.toString());
    setEditContent(chapter.content.join('\n\n'));
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChapter) return;

    const num = parseInt(editNumber, 10);
    if (isNaN(num) || !editTitle.trim() || !editContent.trim()) {
      showCustomNotification("Please enter valid title, number, and content.", "error");
      return;
    }

    const updatedChapters = chapters.map(c => {
      if (c.id === editingChapter.id) {
        return {
          ...c,
          number: num,
          title: editTitle.trim(),
          content: editContent.split('\n').map(p => p.trim()).filter(Boolean)
        };
      }
      return c;
    }).sort((a, b) => a.number - b.number);

    setChapters(updatedChapters);
    
    // Find new index
    const newIdx = updatedChapters.findIndex(c => c.id === editingChapter.id);
    if (newIdx !== -1) {
      setCurrentChapterIndex(newIdx);
    }

    setEditingChapter(null);
  };

  // --- BULK OPERATIONS HANDLERS ---
  const handleBulkCopy = () => {
    const selected = chapters.filter(c => selectedChapterIds.includes(c.id));
    if (selected.length === 0) return;

    const textToCopy = selected.map(c => {
      return `${c.title}\n\n${c.content.join('\n\n')}`;
    }).join('\n\n---\n\n');

    navigator.clipboard.writeText(textToCopy)
      .then(() => showCustomNotification(`Copied ${selected.length} chapters to your clipboard!`, "success"))
      .catch(err => showCustomNotification("Failed to copy chapters: " + err, "error"));
  };

  const handleBulkDelete = () => {
    if (selectedChapterIds.length === 0) return;
    showCustomConfirm(
      "Bulk Delete Chapters",
      `Are you sure you want to delete the ${selectedChapterIds.length} selected chapters? This action cannot be undone.`,
      () => {
        const updated = chapters.filter(c => !selectedChapterIds.includes(c.id));
        setChapters(updated);
        setSelectedChapterIds([]);
        setIsSelectMode(false);

        setCurrentChapterIndex(0);
        showCustomNotification(`Deleted ${selectedChapterIds.length} chapters successfully.`, "success");
      },
      true, // isDanger
      "Delete Selected",
      "Cancel"
    );
  };

  const handleBulkEdit = () => {
    if (selectedChapterIds.length === 0) return;
    if (selectedChapterIds.length === 1) {
      const target = chapters.find(c => c.id === selectedChapterIds[0]);
      if (target) {
        setEditingChapter(target);
        setEditTitle(target.title);
        setEditNumber(target.number.toString());
        setEditContent(target.content.join('\n\n'));
      }
    } else {
      setIsBulkEditOpen(true);
    }
  };

  const handleSaveBulkEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const offset = parseInt(bulkNumberOffset, 10);
    const hasOffset = !isNaN(offset);
    const findText = bulkFindText;
    const replaceText = bulkReplaceText;
    const hasFindReplace = findText.length > 0;
    const prefix = bulkTitlePrefix;
    const suffix = bulkTitleSuffix;

    if (!prefix && !suffix && !hasOffset && !hasFindReplace) {
      showCustomNotification("Please enter at least one bulk editing modification.", "info");
      return;
    }

    const updatedChapters = chapters.map(c => {
      if (selectedChapterIds.includes(c.id)) {
        let updatedTitle = c.title;
        if (prefix) updatedTitle = prefix + updatedTitle;
        if (suffix) updatedTitle = updatedTitle + suffix;

        let updatedNumber = c.number;
        if (hasOffset) updatedNumber += offset;

        let updatedContent = [...c.content];
        if (hasFindReplace) {
          updatedContent = updatedContent.map(para => {
            return para.replaceAll(findText, replaceText);
          });
        }

        return {
          ...c,
          title: updatedTitle,
          number: updatedNumber,
          content: updatedContent
        };
      }
      return c;
    }).sort((a, b) => a.number - b.number);

    setChapters(updatedChapters);
    setIsBulkEditOpen(false);
    setBulkTitlePrefix('');
    setBulkTitleSuffix('');
    setBulkNumberOffset('');
    setBulkFindText('');
    setBulkReplaceText('');
    setSelectedChapterIds([]);
    setIsSelectMode(false);

    showCustomNotification("Bulk modifications applied successfully!", "success");
  };

  // --- BULK PASTE & PARSER HANDLER WITH INTEGRITY AUDIT ---
  const analyzeAndParsePastedText = (
    text: string,
    splitMode: 'chapter' | 'custom',
    customDelimiter: string,
    existingChapters: Chapter[]
  ) => {
    const rawText = text;
    const totalCharacters = rawText.length;
    const warnings: string[] = [];
    const parsedChapters: Chapter[] = [];

    if (!rawText.trim()) {
      return { chapters: [], warnings: ["Pasted text is empty."], totalWords: 0, totalParagraphs: 0, totalCharacters: 0, hasIncompleteLastSentence: false };
    }

    // Check if the overall pasted text buffer ends mid-sentence without closing punctuation
    const trimmedRaw = rawText.trim();
    const lastChar = trimmedRaw.slice(-1);
    const closingPunctuationRegex = /[.!?…”"'\)\]\}’]$/;
    const hasIncompleteLastSentence = !closingPunctuationRegex.test(lastChar);

    if (hasIncompleteLastSentence) {
      warnings.push(
        `⚠️ Warning: The pasted text ends mid-sentence without closing punctuation (ends with "...${trimmedRaw.slice(-30)}"). Please check if your clipboard or copy source was cut off.`
      );
    }

    const existingMaxNumber = existingChapters.length > 0 ? Math.max(...existingChapters.map(c => c.number)) : 0;
    let chapCounter = existingMaxNumber > 0 ? existingMaxNumber + 1 : 1;

    if (splitMode === 'chapter') {
      // Extensive chapter header detection regex:
      // Matches "Chapter 1", "CHAPTER 1", "Ch 1", "Ch. 1", "Chap 1", "Volume 1 Chapter 2", "Chapter 1: Title", "Chapter 1 - Title", "[Chapter 1]", "### Chapter 1", "Chapter IV", "第1章"
      const lines = rawText.split(/\r?\n/);
      let currentChap: Chapter | null = null;
      const CHAPTER_HEADER_REGEX = /^(?:#+\s*|\[|\(|==\s*)?(?:volume\s+\d+[\s,:-]+)?(?:chapter|chap\.?|ch\.?|chapiter|第)\s*(\d+|[ivxlcdm]+|[一二三四五六七八九十]+)\s*(?:章|[:.\-–—\s]+(.*))?$/i;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const match = line.match(CHAPTER_HEADER_REGEX);
        if (match) {
          if (currentChap) {
            parsedChapters.push(currentChap);
          }
          let num = parseInt(match[1], 10);
          if (isNaN(num)) {
            num = chapCounter++;
          } else {
            chapCounter = Math.max(chapCounter, num + 1);
          }

          const rawSubTitle = match[2]?.trim() || `Chapter ${num}`;
          const finalTitle = line.length < 120 ? line : `Chapter ${num}: ${rawSubTitle}`;

          currentChap = {
            id: `paste-${Date.now()}-${num}-${Math.random().toString(36).substr(2, 5)}`,
            number: num,
            title: finalTitle,
            content: []
          };
        } else {
          if (currentChap) {
            currentChap.content.push(line);
          } else {
            // Text before first chapter header
            currentChap = {
              id: `paste-${Date.now()}-initial-${Math.random().toString(36).substr(2, 5)}`,
              number: chapCounter++,
              title: `Chapter ${chapCounter - 1}: Imported Chapter`,
              content: [line]
            };
          }
        }
      }
      if (currentChap) {
        parsedChapters.push(currentChap);
      }
    } else {
      // Custom Delimiter Split
      const delimiter = customDelimiter || '---';
      const parts = rawText.split(delimiter);

      parts.forEach((part, index) => {
        const trimmedPart = part.trim();
        if (!trimmedPart) return;

        const lines = trimmedPart.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) return;

        const title = lines[0].length < 100 ? lines[0] : `Chapter ${chapCounter}`;
        const content = lines[0].length < 100 ? lines.slice(1) : lines;

        parsedChapters.push({
          id: `paste-custom-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
          number: chapCounter++,
          title: title.startsWith('Chapter') || title.startsWith('Ch') ? title : `Chapter ${chapCounter - 1}: ${title}`,
          content
        });
      });
    }

    // Health and integrity checks across parsed chapters
    let totalWords = 0;
    let totalParagraphs = 0;

    parsedChapters.forEach(c => {
      totalParagraphs += c.content.length;
      let cWordCount = 0;
      c.content.forEach(p => {
        cWordCount += p.split(/\s+/).filter(Boolean).length;
      });
      totalWords += cWordCount;

      if (c.content.length === 0) {
        warnings.push(`⚠️ Chapter "${c.title}" has no body paragraphs.`);
      } else {
        const lastParagraph = c.content[c.content.length - 1].trim();
        const lastChapChar = lastParagraph.slice(-1);
        if (!closingPunctuationRegex.test(lastChapChar)) {
          warnings.push(`⚠️ Chapter "${c.title}" ends without closing punctuation (ends with: "...${lastParagraph.slice(-35)}").`);
        }
      }

      if (cWordCount > 15000 && splitMode === 'chapter') {
        warnings.push(`⚠️ Chapter "${c.title}" is exceptionally long (${cWordCount.toLocaleString()} words). Verify that no unparsed sub-chapter headers exist.`);
      }
    });

    if (parsedChapters.length === 1 && totalWords > 10000 && splitMode === 'chapter') {
      warnings.push(`⚠️ Only 1 single chapter was detected for ${totalWords.toLocaleString()} words. If your novel contains multiple chapters with custom separators, try switching Split Logic to "Custom Separator".`);
    }

    return {
      chapters: parsedChapters,
      warnings,
      totalWords,
      totalParagraphs,
      totalCharacters,
      hasIncompleteLastSentence
    };
  };

  const executeImportChapters = (parsedChapters: Chapter[]) => {
    const cleanedParsedChapters = parsedChapters.map(cleanGenericChapter);
    const updated = [...chapters, ...cleanedParsedChapters].sort((a, b) => a.number - b.number);
    setChapters(updated);

    const firstAddedId = cleanedParsedChapters[0]?.id || '';
    const newIdx = updated.findIndex(c => c.id === firstAddedId);
    if (newIdx !== -1) {
      setCurrentChapterIndex(newIdx);
    }

    setPasteMultipleText('');
    setPasteAuditDialog(prev => ({ ...prev, isOpen: false }));
    setActiveTab('reader');
    showCustomNotification(
      `Successfully imported ${parsedChapters.length} chapters (${parsedChapters.reduce((acc, c) => acc + c.content.join(' ').split(/\s+/).filter(Boolean).length, 0).toLocaleString()} words)!`,
      "success"
    );
  };

  const handlePasteMultiple = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteMultipleText.trim()) return;

    const analysis = analyzeAndParsePastedText(pasteMultipleText, pasteSplitMode, pasteCustomDelimiter, chapters);

    if (analysis.chapters.length === 0) {
      showCustomNotification("No chapters could be parsed. Check your split settings or delimiter.", "error");
      return;
    }

    if (analysis.warnings.length > 0) {
      setPasteAuditDialog({
        isOpen: true,
        chaptersToImport: analysis.chapters,
        warnings: analysis.warnings,
        totalWords: analysis.totalWords,
        totalParagraphs: analysis.totalParagraphs,
        totalCharacters: analysis.totalCharacters,
        hasIncompleteLastSentence: analysis.hasIncompleteLastSentence,
      });
    } else {
      executeImportChapters(analysis.chapters);
    }
  };

  // --- AUTOMATED RANGE SCRAPER ENGINE ---
  const handleCalculateRange = () => {
    try {
      // Find all sequences of numbers in start and end URLs
      const regex = /\d+/g;
      const startMatches = [...startUrl.matchAll(regex)];
      const endMatches = [...endUrl.matchAll(regex)];
      
      if (startMatches.length === 0 || endMatches.length === 0) {
        showCustomNotification("Could not find any chapter numbers in the URLs. Please make sure the URLs contain numbers (e.g. /chapter-100/ or /chapter-173.html).", "error");
        return;
      }
      
      // We look at the very last sequence of digits in each URL
      const startMatch = startMatches[startMatches.length - 1];
      const endMatch = endMatches[endMatches.length - 1];
      
      const startNum = parseInt(startMatch[0], 10);
      const endNum = parseInt(endMatch[0], 10);
      
      if (isNaN(startNum) || isNaN(endNum)) {
        showCustomNotification("Invalid chapter numbers extracted from the URLs.", "error");
        return;
      }

      const startIdx = startMatch.index!;
      const startLength = startMatch[0].length;
      
      const urlTemplatePrefix = startUrl.substring(0, startIdx);
      const urlTemplateSuffix = startUrl.substring(startIdx + startLength);
      
      const queue: typeof scrapingQueue = [];
      const min = Math.min(startNum, endNum);
      const max = Math.max(startNum, endNum);
      
      for (let i = min; i <= max; i++) {
        // Handle padding if initial URL had leading zeroes
        let numStr = i.toString();
        if (startMatch[0].startsWith('0') && startMatch[0].length > numStr.length) {
          numStr = numStr.padStart(startMatch[0].length, '0');
        }
        
        queue.push({
          number: i,
          url: `${urlTemplatePrefix}${numStr}${urlTemplateSuffix}`,
          status: 'idle'
        });
      }

      setScrapingQueue(queue);
      setScrapeProgressIndex(0);
      isScrapingPaused.current = false;
      
    } catch (e: any) {
      showCustomNotification(`Error calculating range: ${e.message}`, "error");
    }
  };

  const startScrapingLoop = async () => {
    if (scrapingQueue.length === 0) return;
    setIsScraping(true);
    isScrapingPaused.current = false;

    let currentIndex = scrapeProgressIndex;

    while (currentIndex < scrapingQueue.length && !isScrapingPaused.current) {
      const activeItem = scrapingQueue[currentIndex];

      // Update item status to fetching
      setScrapingQueue(prev => prev.map((item, idx) => 
        idx === currentIndex ? { ...item, status: 'fetching' } : item
      ));

      try {
        const response = await fetch('/api/fetch-page', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: activeItem.url })
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error);
        }

        // Add to our chapters list or update existing
        const scrapedChapter: Chapter = cleanGenericChapter({
          id: `scraped-${activeItem.number}-${Date.now()}`,
          number: activeItem.number,
          title: data.title || `Chapter ${activeItem.number}`,
          content: data.paragraphs && data.paragraphs.length > 0 ? data.paragraphs : ["No content extracted from this page."]
        });

        setChapters(prev => {
          // Check if chapter already exists to overwrite or update
          const filtered = prev.filter(c => c.number !== scrapedChapter.number);
          return [...filtered, scrapedChapter].sort((a, b) => a.number - b.number);
        });

        // Update item status to completed
        setScrapingQueue(prev => prev.map((item, idx) => 
          idx === currentIndex ? { ...item, status: 'completed', title: scrapedChapter.title } : item
        ));

      } catch (err: any) {
        console.error(`Scrape failed for chapter ${activeItem.number}:`, err);
        setScrapingQueue(prev => prev.map((item, idx) => 
          idx === currentIndex ? { ...item, status: 'failed', error: err.message || 'Unknown error' } : item
        ));
      }

      currentIndex++;
      setScrapeProgressIndex(currentIndex);

      // Polite delay between requests to avoid hitting the target server too aggressively, but only if not paused
      if (currentIndex < scrapingQueue.length && !isScrapingPaused.current) {
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
    }

    setIsScraping(false);
    if (currentIndex >= scrapingQueue.length) {
      showCustomNotification("Range fetching sequence completed!", "success");
    }
  };

  const pauseScraping = () => {
    isScrapingPaused.current = true;
    setIsScraping(false);
  };

  const clearScrapeQueue = () => {
    setScrapingQueue([]);
    setScrapeProgressIndex(0);
    setIsScraping(false);
    isScrapingPaused.current = false;
  };


  // --- IMPORT / EXPORT LIBRARY HANDLERS ---
  const exportLibrary = () => {
    const dataStr = JSON.stringify({
      bookTitle,
      chapters
    }, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `${bookTitle.toLowerCase().replace(/\s+/g, '_')}_library.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const importLibrary = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed.chapters && Array.isArray(parsed.chapters)) {
            setChapters(parsed.chapters);
            if (parsed.bookTitle) {
              setBookTitle(parsed.bookTitle);
            }
            setCurrentChapterIndex(0);
            showCustomNotification("Library successfully imported!", "success");
          } else {
            showCustomNotification("Invalid library file format. Missing chapters list.", "error");
          }
        } catch (err) {
          showCustomNotification("Error parsing JSON file. Please check that it is a valid exported library.", "error");
        }
      };
    }
  };

  const handleResetLibrary = () => {
    showCustomConfirm(
      "Clear Library",
      "Are you sure you want to clear your library? This will delete all your custom and scraped chapters.",
      () => {
        setChapters(DEFAULT_CHAPTERS);
        setBookTitle("Deep Sea Embers");
        setCurrentChapterIndex(0);
        localStorage.removeItem('novel_current_index');
        showCustomNotification("Library cleared successfully.", "success");
      },
      true, // isDanger
      "Clear Library",
      "Cancel"
    );
  };

  const handleFixTitles = () => {
    const updatedChapters = chapters.map(chap => {
      // Re-run the cleanGenericChapter logic on all existing chapters
      const cleaned = cleanGenericChapter({ ...chap, title: chap.title.trim() });
      return cleaned;
    });

    let fixedCount = 0;
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].title !== updatedChapters[i].title || chapters[i].content.length !== updatedChapters[i].content.length) {
        fixedCount++;
      }
    }

    if (fixedCount > 0) {
      setChapters(updatedChapters);
      showCustomNotification(`Successfully fixed titles and formatting for ${fixedCount} chapters!`, "success");
    } else {
      showCustomNotification("No chapters needed fixing.", "info");
    }
  };

  const handleSaveAsDefault = () => {
    localStorage.setItem('novel_default_profile_theme', theme);
    localStorage.setItem('novel_default_profile_custom_bg', customBgColor);
    localStorage.setItem('novel_default_profile_font_size', fontSize.toString());
    localStorage.setItem('novel_default_profile_line_height', lineHeight.toString());
    localStorage.setItem('novel_default_profile_paragraph_spacing', paragraphSpacing.toString());
    localStorage.setItem('novel_default_profile_font_family', fontFamily);
    localStorage.setItem('novel_default_profile_page_width', pageWidth);
    localStorage.setItem('novel_default_profile_infinite_scroll', infiniteScroll.toString());
    localStorage.setItem('novel_default_profile_frame_enabled', frameEnabled.toString());
    localStorage.setItem('novel_default_profile_frame_theme', frameTheme);
    localStorage.setItem('novel_default_profile_frame_radius', frameRadius);
    localStorage.setItem('novel_default_profile_frame_border', frameBorder);
    localStorage.setItem('novel_default_profile_frame_shadow', frameShadow);
    localStorage.setItem('novel_default_profile_frame_padding', framePadding);
    localStorage.setItem('novel_default_profile_frame_width', frameWidth.toString());
    localStorage.setItem('novel_has_custom_defaults', 'true');
    showCustomNotification("These settings are now saved as your custom default!", "success");
  };

  const handleRestoreDefaults = () => {
    const hasCustom = localStorage.getItem('novel_has_custom_defaults') === 'true';
    if (hasCustom) {
      setTheme((localStorage.getItem('novel_default_profile_theme') as any) || 'dark');
      setCustomBgColor(localStorage.getItem('novel_default_profile_custom_bg') || '#1E2128');
      setFontSize(parseInt(localStorage.getItem('novel_default_profile_font_size') || '21', 10));
      setLineHeight(parseFloat(localStorage.getItem('novel_default_profile_line_height') || '2.0'));
      setParagraphSpacing(parseFloat(localStorage.getItem('novel_default_profile_paragraph_spacing') || '2.5'));
      setFontFamily(localStorage.getItem('novel_default_profile_font_family') || 'Georgia');
      setPageWidth((localStorage.getItem('novel_default_profile_page_width') as any) || 'narrow');
      setInfiniteScroll(localStorage.getItem('novel_default_profile_infinite_scroll') !== 'false');
      setFrameEnabled(localStorage.getItem('novel_default_profile_frame_enabled') === 'true');
      setFrameTheme((localStorage.getItem('novel_default_profile_frame_theme') as any) || 'cream');
      setFrameRadius((localStorage.getItem('novel_default_profile_frame_radius') as any) || 'lg');
      setFrameBorder((localStorage.getItem('novel_default_profile_frame_border') as any) || 'thin');
      setFrameShadow((localStorage.getItem('novel_default_profile_frame_shadow') as any) || 'medium');
      setFramePadding((localStorage.getItem('novel_default_profile_frame_padding') as any) || 'standard');
      setFrameWidth(parseInt(localStorage.getItem('novel_default_profile_frame_width') || '70', 10));
      showCustomNotification("Restored to your saved default configuration.", "success");
    } else {
      // Factory defaults
      setTheme('dark');
      setCustomBgColor('#1E2128');
      setFontSize(21);
      setLineHeight(2.0);
      setParagraphSpacing(2.5);
      setFontFamily('Georgia');
      setPageWidth('narrow');
      setInfiniteScroll(true);
      setFrameEnabled(false);
      setFrameTheme('cream');
      setFrameRadius('lg');
      setFrameBorder('thin');
      setFrameShadow('medium');
      setFramePadding('standard');
      setFrameWidth(70);
      showCustomNotification("Reading settings restored to original factory defaults.", "success");
    }
  };

  const handleResetToFactoryDefaults = () => {
    showCustomConfirm(
      "Reset to Factory",
      "Are you sure you want to restore reading settings back to the original factory defaults?",
      () => {
        localStorage.removeItem('novel_has_custom_defaults');
        localStorage.removeItem('novel_default_profile_theme');
        localStorage.removeItem('novel_default_profile_custom_bg');
        localStorage.removeItem('novel_default_profile_font_size');
        localStorage.removeItem('novel_default_profile_line_height');
        localStorage.removeItem('novel_default_profile_paragraph_spacing');
        localStorage.removeItem('novel_default_profile_font_family');
        localStorage.removeItem('novel_default_profile_page_width');
        localStorage.removeItem('novel_default_profile_infinite_scroll');
        localStorage.removeItem('novel_default_profile_frame_enabled');
        localStorage.removeItem('novel_default_profile_frame_theme');
        localStorage.removeItem('novel_default_profile_frame_radius');
        localStorage.removeItem('novel_default_profile_frame_border');
        localStorage.removeItem('novel_default_profile_frame_shadow');
        localStorage.removeItem('novel_default_profile_frame_padding');
        localStorage.removeItem('novel_default_profile_frame_width');

        setTheme('dark');
        setCustomBgColor('#1E2128');
        setFontSize(21);
        setLineHeight(2.0);
        setParagraphSpacing(2.5);
        setFontFamily('Georgia');
        setPageWidth('narrow');
        setInfiniteScroll(true);
        setFrameEnabled(false);
        setFrameTheme('cream');
        setFrameRadius('lg');
        setFrameBorder('thin');
        setFrameShadow('medium');
        setFramePadding('standard');
        setFrameWidth(70);
        showCustomNotification("Restored to original factory defaults.", "success");
      },
      false
    );
  };

  // --- HELPER RENDERING GETTERS ---
  const filteredChapters = chapters.filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.content.some(p => p.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const textMatches = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    const query = searchQuery.toLowerCase();
    const results: Array<{
      chapterId: string;
      chapterTitle: string;
      chapterIndex: number;
      paragraphIndex: number;
      text: string;
      previewBefore: string;
      matchText: string;
      previewAfter: string;
    }> = [];

    chapters.forEach((chap, cIdx) => {
      chap.content.forEach((para, pIdx) => {
        const lowerPara = para.toLowerCase();
        let startIdx = 0;
        while (true) {
          const matchIdx = lowerPara.indexOf(query, startIdx);
          if (matchIdx === -1) break;

          const snippetStart = Math.max(0, matchIdx - 40);
          const snippetEnd = Math.min(para.length, matchIdx + query.length + 50);

          const previewBefore = para.substring(snippetStart, matchIdx);
          const matchText = para.substring(matchIdx, matchIdx + query.length);
          const previewAfter = para.substring(matchIdx + query.length, snippetEnd);

          results.push({
            chapterId: chap.id,
            chapterTitle: chap.title,
            chapterIndex: cIdx,
            paragraphIndex: pIdx,
            text: para,
            previewBefore: snippetStart > 0 ? '...' + previewBefore : previewBefore,
            matchText,
            previewAfter: snippetEnd < para.length ? previewAfter + '...' : previewAfter
          });

          if (results.length >= 150) {
            return;
          }
          startIdx = matchIdx + query.length;
        }
      });
    });

    return results;
  }, [chapters, searchQuery]);

  const handleJumpToParagraph = (chapterId: string, paragraphIndex: number) => {
    const chapIndex = chapters.findIndex(c => c.id === chapterId);
    if (chapIndex === -1) return;

    setCurrentChapterIndex(chapIndex);
    setHighlightedParagraph({ chapterId, paragraphIndex });

    setTimeout(() => {
      const targetId = infiniteScroll 
        ? `chap-${chapterId}-p-${paragraphIndex}` 
        : `p-single-${paragraphIndex}`;
      
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);

    setTimeout(() => {
      setHighlightedParagraph(prev => {
        if (prev?.chapterId === chapterId && prev?.paragraphIndex === paragraphIndex) {
          return null;
        }
        return prev;
      });
    }, 3000);
  };

  const activeChapter = chapters[currentChapterIndex] || null;

  // Premium automated adjustments when reading in landscape mode on a tablet/desktop
  const activeFontSize = isLandscape ? fontSize + 1 : fontSize;
  const activeLineHeight = isLandscape ? Math.min(lineHeight * 1.05, 2.3) : lineHeight;
  const activeParagraphSpacing = isLandscape ? paragraphSpacing * 1.08 : paragraphSpacing;

  const currentWidthClass = isLandscape
    ? (pageWidth === 'narrow' ? 'max-w-[780px]' : pageWidth === 'medium' ? 'max-w-[920px]' : pageWidth === 'wide' ? 'max-w-[1060px]' : 'max-w-full px-12 md:px-24')
    : (pageWidth === 'narrow' ? 'max-w-[720px]' : pageWidth === 'medium' ? 'max-w-[880px]' : pageWidth === 'wide' ? 'max-w-[1020px]' : 'max-w-full px-4');

  return (
    <div 
      id="app-container"
      className={`flex w-full transition-colors duration-300 select-none relative ${
        useWindowScrolling ? 'min-h-screen overflow-y-visible' : 'h-screen overflow-hidden'
      }`}
      style={{ 
        backgroundColor: currentTheme.bg, 
        color: currentTheme.text,
        fontFamily: FONT_MAP[fontFamily] || FONT_MAP['Georgia']
      }}
    >
      
      {/* Sidebar Mobile Backdrop Overlay */}
      {isSidebarOpen && (
        <div 
          id="sidebar-mobile-backdrop"
          onClick={() => handleSetSidebarOpen(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 md:hidden animate-in fade-in duration-200"
        />
      )}

      {/* 1. SIDEBAR (Collapsible table of contents, search, import/export) */}
      <div 
        id="app-sidebar"
        className={`fixed top-0 left-0 h-screen flex-shrink-0 border-r border-white/10 transition-all duration-300 flex flex-col overflow-hidden z-40 bg-[#16181D] text-slate-100 ${
          isSidebarOpen 
            ? 'w-80 sm:w-88 md:w-[380px] lg:w-[420px] opacity-100 translate-x-0 shadow-2xl' 
            : 'w-0 opacity-0 pointer-events-none -translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div id="sidebar-header" className="p-5 border-b border-white/10 flex items-center justify-between flex-shrink-0 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#FF79B0]/15 text-[#FF79B0] border border-[#FF79B0]/25 shadow-sm">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <input 
                id="book-title-input"
                type="text"
                value={bookTitle}
                onChange={(e) => setBookTitle(e.target.value)}
                className="bg-transparent font-serif font-bold text-base sm:text-lg text-white focus:outline-none focus:ring-1 focus:ring-[#FF79B0] rounded-lg px-1.5 py-0.5 border border-transparent hover:border-white/10 transition-all max-w-[200px] sm:max-w-[240px]"
                title="Click to rename book"
              />
              <span className="text-[10px] text-white/40 pl-1.5 font-medium tracking-wide uppercase">Ebook Library</span>
            </div>
          </div>
          <button 
            id="close-sidebar-btn"
            onClick={() => handleSetSidebarOpen(false)}
            className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-white/80 hover:text-white transition-all border border-white/10 cursor-pointer active:scale-95"
            title="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs Segmented Pill Bar */}
        <div id="sidebar-tabs" className="px-5 py-3 border-b border-white/10 flex-shrink-0 bg-white/[0.01]">
          <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-white/5 border border-white/10">
            <button 
              id="tab-reader"
              onClick={() => { setActiveTab('reader'); }}
              className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'reader'
                  ? 'bg-[#FF79B0] text-slate-950 shadow-sm'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              Home
            </button>
            <button 
              id="tab-add"
              onClick={() => { setActiveTab('add'); }}
              className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'add'
                  ? 'bg-[#FF79B0] text-slate-950 shadow-sm'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              + Chapter
            </button>
            <button 
              id="tab-paste"
              onClick={() => { setActiveTab('paste'); }}
              className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'paste'
                  ? 'bg-[#FF79B0] text-slate-950 shadow-sm'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              Paste Multi
            </button>
            <button 
              id="tab-fetch"
              onClick={() => { setActiveTab('fetch'); }}
              className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'fetch'
                  ? 'bg-[#FF79B0] text-slate-950 shadow-sm'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              Auto Fetch
            </button>
          </div>
        </div>

        {/* Sidebar Tab Contents */}
        <div id="sidebar-content" className="flex-1 flex flex-col overflow-hidden p-5 select-text">
          
          {/* TAB: Table of Contents & Search */}
          {activeTab === 'reader' && (
            <div id="toc-container" className="flex flex-col flex-1 overflow-hidden space-y-4">
              {/* Search Box */}
              <div id="search-box" className="relative flex items-center">
                <Search className="w-5 h-5 absolute left-3.5 text-white/40 pointer-events-none" />
                <input 
                  id="search-chapters-input"
                  type="text"
                  placeholder="Search title or content..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-9 py-3 rounded-2xl text-sm bg-white/5 border border-white/15 text-white placeholder-white/40 focus:outline-none focus:border-[#FF79B0] focus:ring-2 focus:ring-[#FF79B0]/20 transition-all shadow-inner"
                />
                {searchQuery && (
                  <button 
                    id="clear-search-btn"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 p-1 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {searchQuery ? (
                <div id="search-results-wrapper" className="flex-1 flex flex-col overflow-hidden space-y-3">
                  {/* Search Segment Tabs */}
                  <div id="search-segment-tabs" className="grid grid-cols-2 gap-1 p-1.5 rounded-2xl bg-white/5 border border-white/10 flex-shrink-0">
                    <button
                      id="search-mode-chapters-btn"
                      type="button"
                      onClick={() => setSearchMode('chapters')}
                      className={`py-2 text-center text-xs font-bold rounded-xl transition-all cursor-pointer ${
                        searchMode === 'chapters'
                          ? 'bg-[#FF79B0] text-slate-950 shadow-sm'
                          : 'text-white/70 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      Chapters ({filteredChapters.length})
                    </button>
                    <button
                      id="search-mode-text-btn"
                      type="button"
                      onClick={() => setSearchMode('text')}
                      className={`py-2 text-center text-xs font-bold rounded-xl transition-all cursor-pointer ${
                        searchMode === 'text'
                          ? 'bg-[#FF79B0] text-slate-950 shadow-sm'
                          : 'text-white/70 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      Text Passages ({textMatches.length})
                    </button>
                  </div>

                  {searchMode === 'chapters' ? (
                    /* Search Mode: Chapters List matching query */
                    <div id="search-chapters-results" className="flex-1 flex flex-col overflow-hidden">
                      {filteredChapters.length === 0 ? (
                        <div className="text-center py-8 text-sm flex-1 text-white/50">
                          No chapters match your search.
                        </div>
                      ) : (
                        <div id="search-chapters-list" className="space-y-3 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                          {filteredChapters.map((chap) => {
                            const chapterIdx = chapters.indexOf(chap);
                            const isSelected = !isInfiniteScrollingMode && currentChapterIndex === chapterIdx;
                            const isHighlighted = isInfiniteScrollingMode && currentChapterIndex === chapterIdx;
                            
                            let displayTitle = chap.title;
                            if (displayTitle.match(/^chapter\s+\d+[:\s-]/i)) {
                              const parts = displayTitle.split(/[:\-]/);
                              if (parts.length > 1) {
                                displayTitle = parts.slice(1).join(':').trim();
                              }
                            }

                            return (
                              <div 
                                id={`search-chapter-item-${chap.id}`}
                                key={chap.id}
                                onClick={() => {
                                  setCurrentChapterIndex(chapterIdx);
                                }}
                                className={`group w-full text-left p-4 rounded-2xl transition-all duration-200 relative overflow-hidden cursor-pointer ${
                                  isSelected 
                                    ? 'bg-[#FF79B0]/15 border-[#FF79B0]/50 shadow-lg shadow-[#FF79B0]/10 scale-[1.01] before:absolute before:left-0 before:top-2.5 before:bottom-2.5 before:w-1.5 before:bg-[#FF79B0] before:rounded-r-full' 
                                    : isHighlighted 
                                      ? 'bg-white/10 border-[#FF79B0]/30 border-dashed before:absolute before:left-0 before:top-2.5 before:bottom-2.5 before:w-1 before:bg-[#FF79B0]/60'
                                      : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 hover:scale-[1.01] active:scale-[0.99] shadow-sm'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#FF79B0] flex items-center gap-1">
                                    📖 Chapter {chap.number}
                                  </span>
                                  {isSelected && (
                                    <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest rounded-md bg-[#FF79B0] text-slate-950 shadow-sm flex items-center gap-1 flex-shrink-0 animate-in fade-in">
                                      Reading
                                    </span>
                                  )}
                                </div>
                                <div className="font-bold text-sm text-white leading-snug mb-2 line-clamp-2">
                                  {displayTitle}
                                </div>
                                <div className="text-xs text-white/50 pt-1 border-t border-white/5">
                                  {chap.content.length} paragraphs
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Search Mode: Text Matches matching query */
                    <div id="search-text-results" className="flex-1 flex flex-col overflow-hidden">
                      {textMatches.length === 0 ? (
                        <div className="text-center py-8 text-sm flex-1 space-y-2 text-white/50">
                          <p>No matching text passages found.</p>
                          <p className="text-xs opacity-75">Try typing a more specific phrase.</p>
                        </div>
                      ) : (
                        <div id="text-matches-list" className="space-y-3 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                          {textMatches.map((match, mIdx) => {
                            const isActiveChapter = currentChapterIndex === match.chapterIndex;
                            const isMatchHighlighted = highlightedParagraph?.chapterId === match.chapterId && highlightedParagraph?.paragraphIndex === match.paragraphIndex;
                            return (
                              <button
                                key={mIdx}
                                type="button"
                                onClick={() => handleJumpToParagraph(match.chapterId, match.paragraphIndex)}
                                className={`w-full text-left p-3.5 rounded-2xl text-xs border transition-all duration-200 flex flex-col overflow-hidden cursor-pointer ${
                                  isMatchHighlighted 
                                    ? 'bg-[#FF79B0]/20 border-[#FF79B0] ring-1 ring-[#FF79B0]/40 shadow-md'
                                    : isActiveChapter
                                      ? 'bg-white/10 hover:bg-white/15 border-white/20'
                                      : 'bg-white/5 hover:bg-white/10 border-white/10'
                                }`}
                              >
                                <div className="flex items-center justify-between font-bold mb-1.5 w-full text-[#FF79B0]">
                                  <span className="truncate max-w-[190px]">📖 {match.chapterTitle}</span>
                                  <span className="text-[10px] opacity-80 whitespace-nowrap bg-[#FF79B0]/15 px-1.5 py-0.5 rounded font-mono">Para {match.paragraphIndex + 1}</span>
                                </div>
                                <div className="leading-relaxed text-white/80 break-words select-none text-left">
                                  <span>{match.previewBefore}</span>
                                  <mark className="bg-[#FF79B0]/40 text-white font-bold px-1 rounded">{match.matchText}</mark>
                                  <span>{match.previewAfter}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Chapters List (Normal T.O.C. when no Search Query) */
                <div id="chapters-list-wrapper" className="flex-1 flex flex-col overflow-hidden space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider mb-2 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white/60 font-bold">Chapters</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-[#FF79B0]/20 text-[#FF79B0] font-mono text-xs font-bold border border-[#FF79B0]/30">
                        {filteredChapters.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {chapters.length > 0 && (
                        <button
                          id="toggle-select-mode-btn"
                          onClick={() => {
                            setIsSelectMode(!isSelectMode);
                            if (isSelectMode) setSelectedChapterIds([]);
                          }}
                          className="text-xs hover:underline flex items-center gap-1 text-[#FF79B0] font-medium cursor-pointer"
                          title="Toggle Multi-Select Mode to Delete, Edit or Copy multiple chapters"
                        >
                          <CheckSquare className="w-3.5 h-3.5" />
                          {isSelectMode ? "Cancel Select" : "Select Mode"}
                        </button>
                      )}
                      {chapters.length > 0 && (
                        <button 
                          id="fix-titles-btn"
                          onClick={handleFixTitles}
                          className="text-xs hover:underline flex items-center gap-1 text-white/50 hover:text-white transition-colors cursor-pointer"
                          title="Auto-fix generic chapter titles (e.g. Novellunar or Chapter 1) using the first paragraph"
                        >
                          <Wand2 className="w-3.5 h-3.5" />
                          Fix
                        </button>
                      )}
                      {chapters.length > 0 && (
                        <button 
                          id="reset-library-btn"
                          onClick={handleResetLibrary}
                          className="text-xs hover:underline flex items-center gap-1 text-white/50 hover:text-white transition-colors cursor-pointer"
                          title="Clear all chapters in library"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Clear All
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Bulk Controls & Select All Options when in Select Mode */}
                  {isSelectMode && (
                    <div className="space-y-2 mb-2 animate-in fade-in slide-in-from-top-1 duration-150 flex-shrink-0">
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs">
                        <label className="flex items-center gap-2 cursor-pointer font-medium select-none text-white">
                          <input 
                            type="checkbox"
                            checked={selectedChapterIds.length === filteredChapters.length && filteredChapters.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedChapterIds(filteredChapters.map(c => c.id));
                              } else {
                                setSelectedChapterIds([]);
                              }
                            }}
                            className="rounded border-gray-300 text-pink-600 focus:ring-pink-500 w-3.5 h-3.5 cursor-pointer accent-[#FF79B0]"
                          />
                          <span>Select All ({selectedChapterIds.length} of {filteredChapters.length})</span>
                        </label>
                        {selectedChapterIds.length > 0 && (
                          <button 
                            onClick={() => setSelectedChapterIds([])}
                            className="text-[10px] hover:underline text-white/70"
                          >
                            Deselect All
                          </button>
                        )}
                      </div>

                      {selectedChapterIds.length > 0 && (
                        <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-xl bg-white/10 border border-white/10 flex-shrink-0">
                          <button
                            onClick={handleBulkCopy}
                            className="flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-[11px] font-bold text-[#FF79B0] transition-colors"
                            title="Copy content of selected chapters to clipboard"
                          >
                            <Copy className="w-3 h-3" />
                            Copy
                          </button>
                          <button
                            onClick={handleBulkEdit}
                            className="flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-[11px] font-bold text-[#FF79B0] transition-colors"
                            title="Edit prefix, title additions, offsets or content replacements in selected chapters"
                          >
                            <Edit3 className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            onClick={handleBulkDelete}
                            className="flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 text-[11px] font-bold transition-colors animate-pulse"
                            title="Delete selected chapters"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {filteredChapters.length === 0 ? (
                    <div className="text-center py-8 text-sm flex-1 text-white/50">
                      No chapters in your library yet. Add or scrape some!
                    </div>
                  ) : (
                    <div id="chapters-list" className="space-y-3 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                      {filteredChapters.map((chap, index) => {
                        const chapterIdx = chapters.indexOf(chap);
                        const isSelected = !isInfiniteScrollingMode && currentChapterIndex === index;
                        const isHighlighted = isInfiniteScrollingMode && currentChapterIndex === index;
                        const isChecked = selectedChapterIds.includes(chap.id);

                        let displayTitle = chap.title;
                        if (displayTitle.match(/^chapter\s+\d+[:\s-]/i)) {
                          const parts = displayTitle.split(/[:\-]/);
                          if (parts.length > 1) {
                            displayTitle = parts.slice(1).join(':').trim();
                          }
                        } else if (displayTitle.match(/^chapter\s+\d+/i)) {
                          displayTitle = displayTitle.replace(/^chapter\s+\d+\s*/i, '').trim();
                        }
                        
                        if (!displayTitle) {
                          displayTitle = chap.title;
                        }

                        return (
                          <div 
                            id={`chapter-item-${chap.id}`}
                            key={chap.id}
                            onClick={(e) => {
                              if (isSelectMode) {
                                e.stopPropagation();
                                setSelectedChapterIds(prev => {
                                  if (prev.includes(chap.id)) {
                                    return prev.filter(id => id !== chap.id);
                                  } else {
                                    return [...prev, chap.id];
                                  }
                                });
                              } else {
                                setCurrentChapterIndex(chapterIdx);
                              }
                            }}
                            className={`group w-full text-left p-4 rounded-2xl transition-all duration-200 relative overflow-hidden cursor-pointer ${
                              isSelectMode && isChecked
                                ? 'bg-white/10 border-[#FF79B0] ring-1 ring-[#FF79B0]/40 shadow-md scale-[1.01]'
                                : isSelected 
                                  ? 'bg-[#FF79B0]/15 border-[#FF79B0]/50 shadow-lg shadow-[#FF79B0]/10 scale-[1.01] before:absolute before:left-0 before:top-2.5 before:bottom-2.5 before:w-1.5 before:bg-[#FF79B0] before:rounded-r-full' 
                                  : isHighlighted 
                                    ? 'bg-white/10 border-[#FF79B0]/30 border-dashed before:absolute before:left-0 before:top-2.5 before:bottom-2.5 before:w-1 before:bg-[#FF79B0]/60'
                                    : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 hover:scale-[1.01] active:scale-[0.99] shadow-sm'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {isSelectMode && (
                                  <input 
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {}} 
                                    className="rounded border-gray-300 text-pink-600 focus:ring-pink-500 w-4 h-4 cursor-pointer accent-[#FF79B0] flex-shrink-0 mt-0.5"
                                  />
                                )}
                                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#FF79B0] flex items-center gap-1">
                                  📖 Chapter {chap.number}
                                </span>
                              </div>

                              {isSelected && !isSelectMode && (
                                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest rounded-md bg-[#FF79B0] text-slate-950 shadow-sm flex items-center gap-1 flex-shrink-0 animate-in fade-in">
                                  Reading
                                </span>
                              )}
                            </div>

                            <div className="font-bold text-sm text-white leading-snug mb-2 line-clamp-2">
                              {displayTitle}
                            </div>

                            <div className="flex items-center justify-between text-xs text-white/50 pt-2 border-t border-white/5">
                              <span>{chap.content.length} paragraphs</span>

                              {!isSelectMode && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button 
                                    id={`edit-chapter-${chap.id}`}
                                    onClick={(e) => handleEditChapter(chap, e)}
                                    className="p-1 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors"
                                    title="Edit Chapter"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    id={`delete-chapter-${chap.id}`}
                                    onClick={(e) => handleDeleteChapter(chap.id, e)}
                                    className="p-1 rounded-lg hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors"
                                    title="Delete Chapter"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: Add Single Chapter */}
          {activeTab === 'add' && (
            <form id="add-chapter-form" onSubmit={handleAddChapter} className="space-y-4">
              <h3 className="font-semibold text-sm">Add New Chapter</h3>
              
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase block" style={{ color: currentTheme.secondaryText }}>Chapter Number</label>
                <input 
                  id="add-chapter-number"
                  type="number"
                  required
                  placeholder="e.g. 174"
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value)}
                  className="w-full p-2 rounded-lg bg-black/10 dark:bg-white/10 border text-sm focus:outline-none"
                  style={{ borderColor: currentTheme.border }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase block" style={{ color: currentTheme.secondaryText }}>Chapter Title</label>
                <input 
                  id="add-chapter-title"
                  type="text"
                  required
                  placeholder="e.g. Chapter 174: Setting Sail"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full p-2 rounded-lg bg-black/10 dark:bg-white/10 border text-sm focus:outline-none"
                  style={{ borderColor: currentTheme.border }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase block" style={{ color: currentTheme.secondaryText }}>Content (Double line break for paragraphs)</label>
                <textarea 
                  id="add-chapter-content"
                  required
                  rows={12}
                  placeholder="Paste chapter text content here..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full p-2 rounded-lg bg-black/10 dark:bg-white/10 border text-sm font-sans focus:outline-none"
                  style={{ borderColor: currentTheme.border }}
                />
              </div>

              <button 
                id="btn-add-chapter-submit"
                type="submit"
                className="w-full py-2.5 rounded-lg font-bold text-white transition-all hover:brightness-110"
                style={{ backgroundColor: currentTheme.accent }}
              >
                Add to Library
              </button>
            </form>
          )}

          {/* TAB: Paste Multiple Chapters */}
          {activeTab === 'paste' && (
            <form id="paste-chapters-form" onSubmit={handlePasteMultiple} className="space-y-4">
              <div className="space-y-1">
                <h3 className="font-semibold text-sm">Paste Multiple Chapters</h3>
                <p className="text-xs" style={{ color: currentTheme.secondaryText }}>
                  Paste large novels or multiple chapters. Automatically split without losing any text or sentences!
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase block" style={{ color: currentTheme.secondaryText }}>Split Logic</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    id="btn-split-auto"
                    type="button"
                    onClick={() => setPasteSplitMode('chapter')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border ${
                      pasteSplitMode === 'chapter' ? 'bg-black/15 dark:bg-white/15 border-current' : ''
                    }`}
                    style={{ borderColor: pasteSplitMode === 'chapter' ? currentTheme.accent : currentTheme.border }}
                  >
                    By "Chapter X" Heading
                  </button>
                  <button 
                    id="btn-split-custom"
                    type="button"
                    onClick={() => setPasteSplitMode('custom')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border ${
                      pasteSplitMode === 'custom' ? 'bg-black/15 dark:bg-white/15 border-current' : ''
                    }`}
                    style={{ borderColor: pasteSplitMode === 'custom' ? currentTheme.accent : currentTheme.border }}
                  >
                    Custom Separator
                  </button>
                </div>
              </div>

              {pasteSplitMode === 'custom' && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase block" style={{ color: currentTheme.secondaryText }}>Separator Characters</label>
                  <input 
                    id="custom-delimiter-input"
                    type="text"
                    value={pasteCustomDelimiter}
                    onChange={(e) => setPasteCustomDelimiter(e.target.value)}
                    className="w-full p-2 rounded-lg bg-black/10 dark:bg-white/10 border text-sm focus:outline-none"
                    style={{ borderColor: currentTheme.border }}
                    placeholder="e.g. ---"
                  />
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase block" style={{ color: currentTheme.secondaryText }}>Raw Chapter Dump</label>
                  {pasteMultipleText.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPasteMultipleText('')}
                      className="text-[10px] uppercase font-bold text-rose-400 hover:underline"
                    >
                      Clear Text
                    </button>
                  )}
                </div>
                <textarea 
                  id="paste-multiple-textarea"
                  required
                  rows={14}
                  placeholder={`Chapter 174: First Chapter...\n\nText here...\n\nChapter 175: Second Chapter...\n\nText here...`}
                  value={pasteMultipleText}
                  onChange={(e) => setPasteMultipleText(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-black/10 dark:bg-white/10 border text-sm font-sans focus:outline-none transition-all"
                  style={{ borderColor: currentTheme.border }}
                />

                {/* Live Text Diagnostics & Integrity Bar */}
                {pasteMultipleText.trim().length > 0 && (() => {
                  const charCount = pasteMultipleText.length;
                  const wordCount = pasteMultipleText.split(/\s+/).filter(Boolean).length;
                  const estimatedChaps = (pasteMultipleText.match(/^(?:#+\s*|\[|\(|==\s*)?(?:volume\s+\d+[\s,:-]+)?(?:chapter|chap\.?|ch\.?|chapiter|第)\s*(\d+|[ivxlcdm]+|[一二三四五六七八九十]+)/gim) || []).length;
                  const trimmed = pasteMultipleText.trim();
                  const lastChar = trimmed.slice(-1);
                  const isCutOff = !/[.!?…”"'\)\]\}’]$/.test(lastChar);

                  return (
                    <div className="space-y-2 mt-2">
                      <div className="flex flex-wrap items-center justify-between text-[11px] px-2 py-1.5 rounded-lg bg-black/10 dark:bg-white/5 border border-white/10" style={{ color: currentTheme.secondaryText }}>
                        <span><strong>{charCount.toLocaleString()}</strong> chars • <strong>{wordCount.toLocaleString()}</strong> words</span>
                        <span className="font-semibold text-emerald-500 dark:text-emerald-400">
                          ⚡ ~{estimatedChaps > 0 ? estimatedChaps : 1} chapter(s) detected
                        </span>
                      </div>

                      {isCutOff && (
                        <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-xs flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold block">Pasted text may be cut off mid-sentence!</span>
                            <span className="text-[11px] opacity-90 block mt-0.5">
                              Text ends with: <code className="bg-black/20 px-1 py-0.5 rounded text-[10px]">"...{trimmed.slice(-30)}"</code> (missing closing period or quote).
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <button 
                id="btn-paste-chapters-submit"
                type="submit"
                className="w-full py-2.5 rounded-lg font-bold text-white transition-all hover:brightness-110 shadow-md flex items-center justify-center gap-2 cursor-pointer"
                style={{ backgroundColor: currentTheme.accent }}
              >
                Split & Import Chapters
              </button>
            </form>
          )}

          {/* TAB: Automated Chapter Range Scraper */}
          {activeTab === 'fetch' && (
            <div id="fetch-range-container" className="space-y-4">
              <div className="space-y-1">
                <h3 className="font-semibold text-sm">Automated Fetch Range</h3>
                <p className="text-xs" style={{ color: currentTheme.secondaryText }}>
                  Input a Start Chapter URL and an End Chapter URL. We will calculate the sequence and copy everything in between automatically!
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase block" style={{ color: currentTheme.secondaryText }}>Start Chapter URL</label>
                <div className="relative flex items-center">
                  <Link className="w-3.5 h-3.5 absolute left-2.5" style={{ color: currentTheme.secondaryText }} />
                  <input 
                    id="scraper-start-url"
                    type="url"
                    value={startUrl}
                    onChange={(e) => setStartUrl(e.target.value)}
                    className="w-full pl-8 pr-2 py-1.5 rounded-lg bg-black/10 dark:bg-white/10 border text-xs focus:outline-none"
                    style={{ borderColor: currentTheme.border }}
                    placeholder="e.g. https://site.com/chapter-100/"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase block" style={{ color: currentTheme.secondaryText }}>End Chapter URL</label>
                <div className="relative flex items-center">
                  <Link className="w-3.5 h-3.5 absolute left-2.5" style={{ color: currentTheme.secondaryText }} />
                  <input 
                    id="scraper-end-url"
                    type="url"
                    value={endUrl}
                    onChange={(e) => setEndUrl(e.target.value)}
                    className="w-full pl-8 pr-2 py-1.5 rounded-lg bg-black/10 dark:bg-white/10 border text-xs focus:outline-none"
                    style={{ borderColor: currentTheme.border }}
                    placeholder="e.g. https://site.com/chapter-200/"
                  />
                </div>
              </div>

              <button 
                id="btn-calculate-range"
                onClick={handleCalculateRange}
                className="w-full py-2 rounded-lg font-bold text-sm border transition-all bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10"
                style={{ borderColor: currentTheme.border }}
              >
                1. Calculate Range Sequence
              </button>

              {/* Range Queue Results */}
              {scrapingQueue.length > 0 && (
                <div className="space-y-3 pt-2 border-t" style={{ borderColor: currentTheme.border }}>
                  <div className="flex items-center justify-between text-xs font-bold uppercase" style={{ color: currentTheme.secondaryText }}>
                    <span>Sequence Queue ({scrapingQueue.length} chapters)</span>
                    <button id="btn-clear-queue" onClick={clearScrapeQueue} className="hover:underline">Clear</button>
                  </div>

                  {/* Scrape Actions */}
                  <div className="flex gap-2">
                    {!isScraping ? (
                      <button 
                        id="btn-start-scrape"
                        onClick={startScrapingLoop}
                        className="flex-1 py-2 rounded-lg font-bold text-xs text-white flex items-center justify-center gap-1 hover:brightness-110"
                        style={{ backgroundColor: currentTheme.accent }}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Start Copying
                      </button>
                    ) : (
                      <button 
                        id="btn-pause-scrape"
                        onClick={pauseScraping}
                        className="flex-1 py-2 rounded-lg font-bold text-xs bg-amber-600 text-white flex items-center justify-center gap-1 hover:bg-amber-700"
                      >
                        <Pause className="w-3.5 h-3.5 fill-current" />
                        Pause
                      </button>
                    )}
                  </div>

                  {/* Overall Progress Bar */}
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span>Progress: {scrapeProgressIndex} / {scrapingQueue.length}</span>
                      <span>{Math.round((scrapeProgressIndex / scrapingQueue.length) * 100)}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                      <div 
                        className="h-full transition-all duration-300"
                        style={{ 
                          width: `${(scrapeProgressIndex / scrapingQueue.length) * 100}%`,
                          backgroundColor: currentTheme.accent 
                        }}
                      />
                    </div>
                  </div>

                  {/* Queue Scrape Progress Logs */}
                  <div id="scrape-logs" className="max-h-48 overflow-y-auto space-y-1 bg-black/10 dark:bg-white/5 rounded-lg p-2 font-mono text-[10px]">
                    {scrapingQueue.map((item, index) => (
                      <div key={index} className="flex items-start justify-between py-0.5 border-b border-white/5">
                        <span className="truncate pr-1 max-w-[150px]">
                          Chapter {item.number} {item.title && `(${item.title})`}
                        </span>
                        <span>
                          {item.status === 'idle' && <span className="text-gray-500">Pending</span>}
                          {item.status === 'fetching' && <span className="text-blue-400 animate-pulse">Copying...</span>}
                          {item.status === 'completed' && <span className="text-green-500 font-bold">✓ Saved</span>}
                          {item.status === 'failed' && <span className="text-red-500 font-bold" title={item.error}>✕ Error</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Help tip */}
              <div id="fetch-range-help" className="p-3 rounded-lg text-xs flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block mb-0.5">How it works:</strong>
                  Our backend bypasses client-side CORS blocks to fetch pages sequentially. It extracts clean paragraphs and titles from standard web layouts, saving them to your device!
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. MAIN READING FRAME */}
      <div 
        id="reader-frame" 
        ref={readerFrameRef} 
        className={`flex-1 flex flex-col relative min-w-0 transition-all duration-300 ${
          useWindowScrolling ? 'min-h-screen overflow-y-visible' : 'h-screen overflow-y-auto overflow-x-hidden'
        } ${isSidebarOpen ? 'md:pl-[380px] lg:pl-[420px]' : 'md:pl-0'}`}
        style={frameEnabled ? frameStyles.outerStyle : {}}
      >
        
        {/* Microsoft Edge Read Aloud Floating Top Bar */}
        <EdgeReadAloudBar
          state={ttsState}
          speedOptions={ttsSpeedOptions}
          currentTheme={currentTheme}
          chapterTitle={chapters[ttsState.currentChapterIndex]?.title}
          onTogglePlayPause={ttsTogglePlayPause}
          onPrevSentence={ttsPrevSentence}
          onNextSentence={ttsNextSentence}
          onSetSpeed={ttsSetPlaybackSpeed}
          onClose={ttsStopReadAloud}
          onOpenVoiceOptions={() => setIsVoiceOptionsOpen(true)}
          onSeekToChapterSentence={ttsSeekToChapterSentence}
          isDetached={ttsIsDetached}
          onRecenter={ttsRecenterOnActiveSentence}
        />

        {/* Floating Controls Overlay (Visible when not distraction free, or on hover/trigger) */}
        {!isDistractionFree && (
          <header 
            id="reader-top-bar"
            className="px-3 sm:px-6 py-3 border-b flex items-center justify-between flex-shrink-0 sticky top-0 z-30 select-none backdrop-blur-md shadow-sm transition-all gap-2 sm:gap-4"
            style={{ 
              borderColor: currentTheme.border,
              backgroundColor: currentTheme.bg === '#111827' || currentTheme.bg === '#000000' || currentTheme.bg.startsWith('#1') 
                ? `${currentTheme.bg}E6` 
                : `${currentTheme.bg}F2`,
              color: currentTheme.text
            }}
          >
            {/* Left side: Menu button + Chapter Title Quick Nav trigger */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <button 
                id="toggle-sidebar-btn-header"
                onClick={() => handleSetSidebarOpen(!isSidebarOpen)}
                className="p-2 sm:p-2.5 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition-all duration-150 flex-shrink-0 cursor-pointer"
                title="Toggle Table of Contents Sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
              
              {/* Quick Chapter Navigator Trigger (Title Button) */}
              <button
                id="header-chapter-title-btn"
                onClick={() => setIsQuickNavOpen(!isQuickNavOpen)}
                className="group flex items-center gap-2 min-w-0 py-1 px-2 sm:px-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 border border-transparent hover:border-current/10 transition-all cursor-pointer text-left max-w-[280px] sm:max-w-[450px] md:max-w-[600px] lg:max-w-[750px]"
                title="Click to open Quick Chapter Navigator"
              >
                <div 
                  key={activeChapter?.id || 'book-title'} 
                  className="animate-in fade-in slide-in-from-top-1 duration-200 truncate font-serif font-bold text-sm sm:text-base md:text-lg tracking-tight flex-1 min-w-0"
                >
                  {activeChapter ? activeChapter.title : bookTitle}
                </div>
                <ChevronDown className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-y-0.5 transition-all flex-shrink-0" />
              </button>
            </div>

            {/* Right side: Infinity Toggle, Search, and Aa Settings */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {/* Listen Mode Toggle Button (Replaces Read Aloud playback toggle) */}
              <button 
                id="reading-mode-toggle-btn"
                onClick={handleToggleReadingMode}
                className={`p-2 sm:p-2.5 rounded-xl transition-all duration-150 flex items-center justify-center cursor-pointer active:scale-95 border ${
                  listenMode 
                    ? 'shadow-sm ring-1' 
                    : 'border hover:bg-black/10 dark:hover:bg-white/10 opacity-70 hover:opacity-100'
                }`}
                style={{
                  borderColor: listenMode ? currentTheme.accent : currentTheme.border,
                  backgroundColor: listenMode ? `${currentTheme.accent}20` : 'transparent',
                  color: listenMode ? currentTheme.accent : currentTheme.secondaryText,
                  boxShadow: listenMode ? `0 0 10px ${currentTheme.accent}25` : undefined
                }}
                title={listenMode ? "Listen Mode: On (Optimized for Edge read aloud)" : "Listen Mode: Off"}
                aria-label={`Listen mode is ${listenMode ? 'On' : 'Off'}`}
              >
                <ReadAloudIcon 
                  className={`w-4.5 h-4.5 ${listenMode ? 'animate-pulse' : ''}`} 
                  style={{ color: listenMode ? currentTheme.accent : undefined }}
                />
              </button>


              {/* Tap to Listen / Read Aloud by Clicking Text Activation Toggle (Replaces Search Button) */}
              <button 
                id="search-header-btn"
                onClick={handleToggleTapToListen}
                className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl transition-all duration-150 flex items-center justify-center cursor-pointer active:scale-95 font-semibold text-xs min-w-[38px] sm:min-w-[42px] ${
                  isTapToListenEnabled 
                    ? 'border shadow-sm ring-1' 
                    : 'border hover:bg-black/10 dark:hover:bg-white/10 opacity-70 hover:opacity-100'
                }`}
                style={{
                  borderColor: isTapToListenEnabled ? currentTheme.accent : currentTheme.border,
                  backgroundColor: isTapToListenEnabled ? `${currentTheme.accent}20` : 'transparent',
                  color: isTapToListenEnabled ? currentTheme.accent : currentTheme.secondaryText,
                  boxShadow: isTapToListenEnabled ? `0 0 10px ${currentTheme.accent}25` : undefined
                }}
                title={isTapToListenEnabled ? "Tap to listen: On (Clicking text plays audio)" : "Tap to listen: Off (Clicking text does nothing)"}
                aria-label={`Tap to listen is ${isTapToListenEnabled ? 'On' : 'Off'}`}
              >
                <span>
                  {isTapToListenEnabled ? 'On' : 'Off'}
                </span>
              </button>

              {/* Terminology Manager Trigger Button */}
              <button 
                id="terminology-header-btn"
                onClick={() => setIsTerminologyModalOpen(true)}
                className="p-2 sm:p-2.5 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition-all duration-150 cursor-pointer flex items-center gap-1.5 font-bold"
                style={{ color: '#FF79B0' }}
                title="Open Terminology Manager (Auto-Translation Dictionary)"
              >
                <Sparkles className="w-4.5 h-4.5 text-[#FF79B0]" />
                <span className="hidden lg:inline text-xs">Terms</span>
              </button>

              {/* Reading Settings Page Settings "Aa" button */}
              <button 
                id="reading-settings-btn"
                onClick={() => handleSetReadingSettingsOpen(true)}
                className="p-2 sm:p-2.5 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition-all duration-150 flex items-center gap-1.5 text-sm font-semibold border border-transparent hover:border-current/10 cursor-pointer"
                style={{ color: currentTheme.accent }}
                title="Adjust Text, Theme, and Layout Settings"
              >
                <Settings className="w-4.5 h-4.5" />
              </button>
            </div>
          </header>
        )}

        {/* Quick Chapter Navigator Modal/Popup */}
        {isQuickNavOpen && (
          <div 
            id="quick-nav-backdrop" 
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-16 sm:pt-20 px-4 animate-in fade-in duration-200"
            onClick={() => setIsQuickNavOpen(false)}
          >
            <div 
              id="quick-nav-dialog"
              className="w-full max-w-lg rounded-2xl border shadow-2xl p-5 space-y-3.5 text-slate-100 bg-[#16181D] border-white/15 animate-in zoom-in-95 duration-200 select-none max-h-[88vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[#FF79B0]/20 text-[#FF79B0]">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-base text-white font-serif">Quick Chapter Navigator</h3>
                </div>
                <button 
                  onClick={() => setIsQuickNavOpen(false)}
                  className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Active Chapter Card with Prev / Next Navigation */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3 flex-shrink-0">
                <div className="flex items-center justify-between text-xs text-[#FF79B0] font-bold uppercase tracking-wider">
                  <span>Current Chapter</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#FF79B0]/20 text-[#FF79B0] text-[10px] font-mono border border-[#FF79B0]/30 font-bold">
                    {currentChapterIndex + 1} of {chapters.length}
                  </span>
                </div>
                <div className="font-serif font-bold text-base sm:text-lg text-white leading-snug">
                  {activeChapter ? activeChapter.title : bookTitle}
                </div>

                {/* Prev / Next buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button 
                    disabled={currentChapterIndex <= 0}
                    onClick={() => {
                      if (currentChapterIndex > 0) {
                        setCurrentChapterIndex(currentChapterIndex - 1);
                      }
                    }}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      currentChapterIndex <= 0
                        ? 'opacity-40 cursor-not-allowed bg-white/5 text-white/40'
                        : 'bg-white/10 hover:bg-white/20 text-white active:scale-95'
                    }`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous Chapter</span>
                  </button>

                  <button 
                    disabled={currentChapterIndex >= chapters.length - 1}
                    onClick={() => {
                      if (currentChapterIndex < chapters.length - 1) {
                        setCurrentChapterIndex(currentChapterIndex + 1);
                      }
                    }}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      currentChapterIndex >= chapters.length - 1
                        ? 'opacity-40 cursor-not-allowed bg-white/5 text-white/40'
                        : 'bg-[#FF79B0] hover:bg-[#FF79B0]/90 text-slate-950 shadow-sm active:scale-95'
                    }`}
                  >
                    <span>Next Chapter</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Recently Visited / Reading History Pills */}
              {recentChapters.length > 0 && (
                <div className="space-y-1.5 pt-0.5 flex-shrink-0">
                  <div className="flex items-center justify-between text-[11px] text-white/50 font-bold uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-[#FF79B0]" />
                      <span>Reading History</span>
                    </span>
                    <span className="text-[10px] text-white/40 font-normal">Recent {Math.min(recentChapters.length, 4)} chapters</span>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 custom-scrollbar">
                    {recentChapters.slice(0, 4).map((chap) => {
                      const index = chapters.findIndex(c => c.id === chap.id);
                      const isCurrent = index === currentChapterIndex;
                      return (
                        <button
                          key={chap.id}
                          onClick={() => {
                            setCurrentChapterIndex(index);
                            setIsQuickNavOpen(false);
                            setQuickNavSearch('');
                          }}
                          className={`flex-shrink-0 px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                            isCurrent
                              ? 'bg-[#FF79B0]/25 text-[#FF79B0] border-[#FF79B0]/50 shadow-sm'
                              : 'bg-white/5 hover:bg-white/15 text-white/80 hover:text-white border-white/10 active:scale-95'
                          }`}
                          title={`Jump to Chapter ${chap.number}: ${chap.title}`}
                        >
                          <span className="font-mono text-[10px] text-[#FF79B0] font-bold">Ch.{chap.number}</span>
                          <span className="truncate max-w-[110px] sm:max-w-[130px]">{chap.title}</span>
                          {isCurrent && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FF79B0] ml-0.5"></span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quick Search */}
              <div className="relative flex items-center flex-shrink-0">
                <Search className="w-4 h-4 absolute left-3.5 text-white/40 pointer-events-none" />
                <input 
                  type="text"
                  placeholder="Filter chapters..."
                  value={quickNavSearch}
                  onChange={(e) => setQuickNavSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2.5 rounded-xl text-xs bg-white/5 border border-white/15 text-white placeholder-white/40 focus:outline-none focus:border-[#FF79B0] focus:ring-1 focus:ring-[#FF79B0]/30 transition-all"
                />
                {quickNavSearch && (
                  <button 
                    onClick={() => setQuickNavSearch('')}
                    className="absolute right-2.5 p-1 rounded-full bg-white/10 text-white/70 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Chapter Jump List - Expanded height for 10-14 chapters */}
              <div className="flex-1 min-h-[280px] max-h-[58vh] sm:max-h-[64vh] overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                {chapters
                  .filter(chap => !quickNavSearch || chap.title.toLowerCase().includes(quickNavSearch.toLowerCase()) || chap.number.toString().includes(quickNavSearch))
                  .map((chap) => {
                    const index = chapters.indexOf(chap);
                    const isSelected = currentChapterIndex === index;
                    return (
                      <button
                        key={chap.id}
                        id={`quick-nav-item-${chap.id}`}
                        onClick={() => {
                          setCurrentChapterIndex(index);
                          setIsQuickNavOpen(false);
                          setQuickNavSearch('');
                        }}
                        className={`w-full text-left p-3.5 rounded-xl text-xs transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-[#FF79B0]/20 border-2 border-[#FF79B0] text-white font-bold shadow-lg shadow-[#FF79B0]/15 ring-1 ring-[#FF79B0]/40'
                            : 'bg-white/5 hover:bg-white/10 border border-white/5 text-white/80 hover:text-white'
                        }`}
                      >
                        <span className="truncate pr-2 font-medium">📖 Chapter {chap.number}: {chap.title}</span>
                        {isSelected ? (
                          <span className="px-2.5 py-1 text-[11px] bg-[#FF79B0] text-slate-950 font-extrabold rounded-lg shadow-sm flex items-center gap-1.5 flex-shrink-0 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-950 inline-block"></span>
                            Currently Reading
                          </span>
                        ) : (
                          <span className="text-[10px] text-white/40 font-mono flex-shrink-0">
                            {chap.content.length} paras
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* Floating Indicator when in Distraction-Free Mode */}
        {isDistractionFree && showDfExit && (
          <div className="absolute top-4 left-4 z-50 flex gap-2 animate-in fade-in zoom-in-95 duration-200">
            <button 
              id="exit-distraction-free-btn"
              onClick={() => handleSetDistractionFree(false)}
              className="px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white text-xs backdrop-blur border border-white/10 flex items-center gap-1 shadow-lg transition-all"
              title="Show Controls"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Exit Distraction-Free Mode</span>
            </button>
          </div>
        )}

        {/* 3. READER CONTAINER (The actual canvas / screen) */}
        <div 
          id="reader-canvas"
          ref={readerContainerRef}
          onClick={handleCanvasClick}
          onTouchEnd={handleCanvasTouchEnd}
          onDoubleClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('textarea')) {
              return;
            }
            toggleDistractionFree();
          }}
          className="flex-1 px-4 md:px-8 py-10 select-text outline-none relative transition-colors duration-300"
          style={frameEnabled ? frameStyles.outerStyle : {}}
          title="Double tap or double click to toggle Distraction-Free mode"
        >
          {chapters.length === 0 ? (
            <div id="empty-reader" className="h-full flex flex-col items-center justify-center text-center p-8 max-w-lg mx-auto">
              <BookOpen className="w-16 h-16 mb-4 animate-bounce" style={{ color: currentTheme.accent }} />
              <h2 className="text-2xl font-serif font-bold mb-2">Your Library is Empty</h2>
              <p className="text-sm mb-6" style={{ color: currentTheme.secondaryText }}>
                Create a chapter manually, split-paste text blocks, or paste URLs to automatically download an entire chapter sequence!
              </p>
              <div className="flex gap-3">
                <button 
                  id="empty-add-btn"
                  onClick={() => { handleSetSidebarOpen(true); setActiveTab('add'); }}
                  className="px-4 py-2 rounded-lg font-bold text-white text-sm hover:brightness-110"
                  style={{ backgroundColor: currentTheme.accent }}
                >
                  Add Chapter
                </button>
                <button 
                  id="empty-scrape-btn"
                  onClick={() => { handleSetSidebarOpen(true); setActiveTab('fetch'); }}
                  className="px-4 py-2 rounded-lg font-bold text-sm border hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ borderColor: currentTheme.border }}
                >
                  Auto Fetch Range
                </button>
              </div>
            </div>
          ) : (
            <div 
              id="reader-content-width-wrapper"
              className={`transition-all duration-300 ${frameEnabled ? '' : 'mx-auto ' + currentWidthClass}`}
              style={{
                ...(frameEnabled ? { 
                  width: `${frameWidth}%`, 
                  marginLeft: `calc(50% - ${frameWidth / 2}%)`, 
                  marginRight: `calc(50% - ${frameWidth / 2}%)` 
                } : {}),
                fontSize: `${activeFontSize}px`,
                lineHeight: activeLineHeight,
                fontFamily: FONT_MAP[fontFamily],
                textAlign: isLandscape ? 'justify' : 'left',
                '--p-margin': `${activeParagraphSpacing}rem`,
                '--title-font-size': `${activeFontSize * 1.15}px`,
                '--single-title-font-size': `${activeFontSize * 1.2}px`
              } as React.CSSProperties}
            >
              {/* INFINITE SCROLL RENDER BLOCK */}
              {useWindowScrolling ? (
                <div id="infinite-scroll-container" className="space-y-0">
                  {(listenMode ? chapters.slice(currentChapterIndex) : chapters).map((chap) => {
                    const idx = chapters.findIndex(c => c.id === chap.id);
                    const isFirstRendered = listenMode 
                      ? chap.id === chapters[currentChapterIndex]?.id 
                      : idx === 0;
                    return (
                      <MemoizedChapterView
                        key={chap.id}
                        chap={chap}
                        idx={idx}
                        isFirstRendered={isFirstRendered}
                        currentChapterIndex={currentChapterIndex}
                        frameEnabled={frameEnabled}
                        frameStyles={frameStyles}
                        frameBorder={frameBorder}
                        currentTheme={currentTheme}
                        bookTitle={bookTitle}
                        highlightedParagraph={highlightedParagraph}
                        renderTransformedText={renderTransformedText}
                        activeTTSPosition={activeTTSPosition}
                        isTTSActive={isTTSActive}
                        highlightMode={ttsSettings.highlightMode}
                        onSentenceClick={isTapToListenEnabled ? handleSentenceClick : undefined}
                      />
                    );
                  })}
                  <div ref={chaptersEndRef} className="text-center py-12 select-none" style={{ color: currentTheme.secondaryText }}>
                    <p className="text-xs font-mono uppercase tracking-widest">End of Library • Add more chapters in Sidebar</p>
                  </div>
                </div>
              ) : (
                /* SINGLE CHAPTER RENDER BLOCK */
                <article 
                  id="single-chapter-view" 
                  className={frameEnabled ? frameStyles.cardClass : "relative transition-all duration-300 select-text"}
                  style={frameEnabled ? frameStyles.cardStyle : {}}
                >
                  {frameEnabled && frameBorder === 'ornament' && (
                    <div 
                      className="absolute inset-3 pointer-events-none rounded-[inherit] border border-dashed opacity-40"
                      style={{ borderColor: (frameStyles.cardStyle as Record<string, string>)?.borderColor || 'rgba(0,0,0,0.15)' }} 
                    />
                  )}

                  {/* Title */}
                  <div className="text-center select-none mb-4">
                    <h1 className="font-serif text-3xl md:text-4xl font-bold mb-2">{bookTitle}</h1>
                    <hr className="w-1/12 mx-auto opacity-20 mb-6" style={{ borderColor: currentTheme.accent }} />
                  </div>

                  <div className="mb-10 text-left">
                    <h2 
                      className="font-serif font-bold tracking-tight border-b pb-2" 
                      style={{ 
                        fontSize: 'var(--single-title-font-size)',
                        borderColor: frameEnabled ? ((frameStyles.cardStyle as Record<string, string>)?.borderColor || currentTheme.border) : currentTheme.border
                      }}
                    >
                      <TTSSentenceParagraph
                        text={renderTransformedText(activeChapter.title)}
                        chapterId={activeChapter.id}
                        chapterIndex={currentChapterIndex}
                        paragraphIndex={-1}
                        activeTTSPosition={activeTTSPosition}
                        isTTSActive={isTTSActive}
                        highlightMode={ttsSettings.highlightMode}
                        onSentenceClick={isTapToListenEnabled ? handleSentenceClick : undefined}
                        isTitle={true}
                      />
                    </h2>
                  </div>

                  {/* Body paragraphs */}
                  <div className="select-text mb-16 transition-all duration-300 columns-1">
                    {activeChapter.content.map((para, pIdx) => {
                      const isHighlighted = highlightedParagraph?.chapterId === activeChapter.id && highlightedParagraph?.paragraphIndex === pIdx;
                      return (
                        <p 
                          id={`p-single-${pIdx}`}
                          key={pIdx} 
                          className={`leading-relaxed rounded px-2 py-1 transition-all duration-1000 ${
                            isHighlighted 
                              ? 'bg-[#FF79B0]/25 dark:bg-[#FF79B0]/35 ring-2 ring-[#FF79B0]/60 shadow-lg' 
                              : 'hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                          style={{ marginBottom: 'var(--p-margin)' }}
                        >
                          <TTSSentenceParagraph
                            text={renderTransformedText(para)}
                            chapterId={activeChapter.id}
                            chapterIndex={currentChapterIndex}
                            paragraphIndex={pIdx}
                            activeTTSPosition={activeTTSPosition}
                            isTTSActive={isTTSActive}
                            highlightMode={ttsSettings.highlightMode}
                            onSentenceClick={isTapToListenEnabled ? handleSentenceClick : undefined}
                          />
                        </p>
                      );
                    })}
                  </div>

                  {/* Single Chapter Navigation Actions */}
                  <div id="single-chapter-nav" className="flex items-center justify-between border-t pt-8 pb-12 select-none" style={{ borderColor: currentTheme.border }}>
                    <button 
                      id="prev-chapter-btn"
                      disabled={currentChapterIndex === 0}
                      onClick={() => setCurrentChapterIndex(prev => Math.max(0, prev - 1))}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border transition-all hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none"
                      style={{ borderColor: currentTheme.border }}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous Chapter
                    </button>
                    <span className="text-xs font-mono" style={{ color: currentTheme.secondaryText }}>
                      Chapter {activeChapter ? activeChapter.number : currentChapterIndex + 1} ({currentChapterIndex + 1} of {chapters.length})
                    </span>
                    <button 
                      id="next-chapter-btn"
                      disabled={currentChapterIndex === chapters.length - 1}
                      onClick={() => setCurrentChapterIndex(prev => Math.min(chapters.length - 1, prev + 1))}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border transition-all hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none"
                      style={{ borderColor: currentTheme.border }}
                    >
                      Next Chapter
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Return to Spoken Text Floating Circle Button (Microsoft Edge style with Hold-to-drag & Smart edge snapping) */}
      <TTSRecenterFloatingButton
        isVisible={Boolean(ttsIsDetached && isTTSActive)}
        direction={ttsDetachedDirection}
        onRecenter={ttsRecenterOnActiveSentence}
        currentTheme={currentTheme}
      />

      {/* 4. CHAPTER EDITING DIALOG / MODAL */}
      {editingChapter && (
        <div id="edit-modal-overlay" className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
          <div 
            id="edit-modal-body"
            className="w-full max-w-2xl rounded-2xl border p-6 flex flex-col max-h-[85vh] shadow-2xl"
            style={{ 
              backgroundColor: currentTheme.cardBg, 
              color: currentTheme.text,
              borderColor: currentTheme.border
            }}
          >
            <div className="flex items-center justify-between pb-4 border-b mb-4" style={{ borderColor: currentTheme.border }}>
              <h3 className="text-lg font-bold font-serif flex items-center gap-2">
                <Edit3 className="w-5 h-5" style={{ color: currentTheme.accent }} />
                Edit Chapter Details
              </h3>
              <button 
                id="close-edit-modal-btn"
                onClick={() => setEditingChapter(null)}
                className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form id="edit-chapter-form-submit" onSubmit={handleSaveEdit} className="space-y-4 flex-1 overflow-y-auto pr-1 select-text">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1 space-y-1">
                  <label className="text-xs font-semibold uppercase block" style={{ color: currentTheme.secondaryText }}>Chapter Index</label>
                  <input 
                    id="edit-chapter-number-input"
                    type="number"
                    required
                    value={editNumber}
                    onChange={(e) => setEditNumber(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-black/10 dark:bg-white/10 border text-sm focus:outline-none"
                    style={{ borderColor: currentTheme.border }}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-semibold uppercase block" style={{ color: currentTheme.secondaryText }}>Chapter Title Heading</label>
                  <input 
                    id="edit-chapter-title-input"
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-black/10 dark:bg-white/10 border text-sm focus:outline-none"
                    style={{ borderColor: currentTheme.border }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase block" style={{ color: currentTheme.secondaryText }}>Paragraphs (One paragraph per double line break)</label>
                <textarea 
                  id="edit-chapter-content-input"
                  required
                  rows={14}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full p-3 rounded-lg bg-black/10 dark:bg-white/10 border text-sm font-sans focus:outline-none"
                  style={{ borderColor: currentTheme.border }}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: currentTheme.border }}>
                <button 
                  id="btn-edit-cancel"
                  type="button"
                  onClick={() => setEditingChapter(null)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ borderColor: currentTheme.border }}
                >
                  Cancel
                </button>
                <button 
                  id="btn-edit-save"
                  type="submit"
                  className="px-5 py-2 rounded-lg font-bold text-white hover:brightness-110"
                  style={{ backgroundColor: currentTheme.accent }}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK EDITING DIALOG / MODAL */}
      {isBulkEditOpen && (
        <div id="bulk-edit-modal-overlay" className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
          <div 
            id="bulk-edit-modal-body"
            className="w-full max-w-lg rounded-2xl border p-6 flex flex-col max-h-[85vh] shadow-2xl animate-in zoom-in-95 duration-150"
            style={{ 
              backgroundColor: currentTheme.cardBg, 
              color: currentTheme.text,
              borderColor: currentTheme.border
            }}
          >
            <div className="flex items-center justify-between pb-4 border-b mb-4" style={{ borderColor: currentTheme.border }}>
              <h3 className="text-lg font-bold font-serif flex items-center gap-2">
                <Edit3 className="w-5 h-5" style={{ color: currentTheme.accent }} />
                Bulk Edit ({selectedChapterIds.length} Chapters)
              </h3>
              <button 
                id="close-bulk-edit-modal-btn"
                onClick={() => setIsBulkEditOpen(false)}
                className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form id="bulk-edit-form-submit" onSubmit={handleSaveBulkEdit} className="space-y-4 flex-1 overflow-y-auto pr-1 select-text">
              <p className="text-xs opacity-70 mb-2">
                Specify any modifications you'd like to apply to all {selectedChapterIds.length} selected chapters. Leave fields blank to skip applying that modification.
              </p>

              <div className="space-y-3">
                {/* 1. Title Modification Prefix/Suffix */}
                <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 space-y-3">
                  <span className="text-xs font-semibold uppercase tracking-wider block" style={{ color: currentTheme.accent }}>Modify Titles</span>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs block opacity-80">Add to Start (Prefix)</label>
                      <input 
                        id="bulk-title-prefix"
                        type="text"
                        placeholder="e.g. Vol 1 - "
                        value={bulkTitlePrefix}
                        onChange={(e) => setBulkTitlePrefix(e.target.value)}
                        className="w-full p-2 rounded bg-black/10 dark:bg-white/10 border text-sm focus:outline-none"
                        style={{ borderColor: currentTheme.border }}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs block opacity-80">Add to End (Suffix)</label>
                      <input 
                        id="bulk-title-suffix"
                        type="text"
                        placeholder="e.g. [Draft]"
                        value={bulkTitleSuffix}
                        onChange={(e) => setBulkTitleSuffix(e.target.value)}
                        className="w-full p-2 rounded bg-black/10 dark:bg-white/10 border text-sm focus:outline-none"
                        style={{ borderColor: currentTheme.border }}
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Number Offset */}
                <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider block" style={{ color: currentTheme.accent }}>Adjust Chapter Indexing</span>
                  <div className="space-y-1">
                    <label className="text-xs block opacity-80">Index Offset (Positive or Negative number)</label>
                    <input 
                      id="bulk-number-offset"
                      type="number"
                      placeholder="e.g. +1 or -5"
                      value={bulkNumberOffset}
                      onChange={(e) => setBulkNumberOffset(e.target.value)}
                      className="w-full p-2 rounded bg-black/10 dark:bg-white/10 border text-sm focus:outline-none"
                      style={{ borderColor: currentTheme.border }}
                    />
                    <span className="text-[10px] opacity-60 block">E.g., enter 1 to shift Chapter 15 to Chapter 16, or -1 to shift Chapter 15 to Chapter 14.</span>
                  </div>
                </div>

                {/* 3. Global Find and Replace */}
                <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 space-y-3">
                  <span className="text-xs font-semibold uppercase tracking-wider block" style={{ color: currentTheme.accent }}>Find & Replace in Content</span>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs block opacity-80 font-mono">Find Text</label>
                      <input 
                        id="bulk-find-text"
                        type="text"
                        placeholder="text to find..."
                        value={bulkFindText}
                        onChange={(e) => setBulkFindText(e.target.value)}
                        className="w-full p-2 rounded bg-black/10 dark:bg-white/10 border text-sm focus:outline-none font-mono"
                        style={{ borderColor: currentTheme.border }}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs block opacity-80 font-mono">Replace With</label>
                      <input 
                        id="bulk-replace-text"
                        type="text"
                        placeholder="replacement text..."
                        value={bulkReplaceText}
                        onChange={(e) => setBulkReplaceText(e.target.value)}
                        className="w-full p-2 rounded bg-black/10 dark:bg-white/10 border text-sm focus:outline-none font-mono"
                        style={{ borderColor: currentTheme.border }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: currentTheme.border }}>
                <button 
                  id="btn-bulk-cancel"
                  type="button"
                  onClick={() => setIsBulkEditOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ borderColor: currentTheme.border }}
                >
                  Cancel
                </button>
                <button 
                  id="btn-bulk-save"
                  type="submit"
                  className="px-5 py-2 rounded-lg font-bold text-white hover:brightness-110"
                  style={{ backgroundColor: currentTheme.accent }}
                >
                  Apply Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. GORGEOUS READING SETTINGS DIALOG / MODAL */}
      {isReadingSettingsOpen && (
        <div 
          id="reading-settings-overlay" 
          onClick={() => handleSetReadingSettingsOpen(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 transition-all duration-300 animate-fade-in"
        >
          <div 
            id="reading-settings-modal"
            onClick={(e) => e.stopPropagation()} // Prevent close on click inside
            className="w-full max-w-sm sm:max-w-md md:max-w-xl lg:max-w-2xl rounded-3xl border border-white/15 p-6 sm:p-8 flex flex-col space-y-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] relative overflow-hidden bg-[#181B22]/95 text-slate-100 transition-all duration-300 transform animate-in fade-in zoom-in-95"
            style={{ 
              color: '#E2E8F0',
            }}
          >
            {/* Subtle decorative ambient glow at top */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-gradient-to-b from-[#FF79B0]/15 to-transparent blur-2xl pointer-events-none rounded-full" />

            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10 relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#FF79B0]/15 text-[#FF79B0] border border-[#FF79B0]/25">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold tracking-tight text-white">Reading Settings</h3>
                  <p className="text-[11px] text-white/50">Customize typography, theme, and layout</p>
                </div>
              </div>
              <button 
                id="close-reading-settings-btn"
                onClick={() => handleSetReadingSettingsOpen(false)}
                className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-white/80 hover:text-white transition-all transform active:scale-95 cursor-pointer border border-white/10"
                title="Close settings"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Scroll Container */}
            <div className="space-y-7 sm:space-y-8 overflow-y-auto max-h-[75vh] pr-2 custom-scrollbar relative z-10">
              
              {/* SECTION 1: Appearance & Page Color */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-[#FF79B0] flex items-center gap-1.5">
                    Appearance & Theme
                  </span>
                  <button 
                    onClick={() => {
                      // Cycle through default themes
                      if (theme === 'dark') setTheme('light');
                      else if (theme === 'light') setTheme('sepia');
                      else setTheme('dark');
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-all text-xs font-medium text-white shadow-sm hover:scale-105 active:scale-95 cursor-pointer border border-white/10"
                  >
                    <span>{theme === 'dark' ? '🌙 Dark mode' : theme === 'light' ? '☀️ Light mode' : theme === 'sepia' ? '🌾 Sepia mode' : '🎨 Custom mode'}</span>
                  </button>
                </div>

                <div className="space-y-2.5 p-4 rounded-2xl bg-white/5 border border-white/10">
                  <span className="text-xs font-medium text-white/70 block">Page Background Color</span>
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                    {COLOR_PRESETS.map((preset) => {
                      const isActive = currentTheme.bg.toLowerCase() === preset.hex.toLowerCase();
                      return (
                        <button
                          key={preset.hex}
                          type="button"
                          onClick={() => {
                            if (preset.hex === '#1E2128') setTheme('dark');
                            else if (preset.hex === '#FAF8F5') setTheme('light');
                            else if (preset.hex === '#F4ECD8') setTheme('sepia');
                            else {
                              setTheme('custom');
                              setCustomBgColor(preset.hex);
                            }
                          }}
                          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full border-2 transition-all duration-200 flex items-center justify-center relative cursor-pointer shadow-md ${
                            isActive 
                              ? 'scale-110 ring-4 ring-[#FF79B0]/30 border-[#FF79B0] shadow-lg' 
                              : 'hover:scale-105 border-white/20 hover:border-white/40'
                          }`}
                          style={{ 
                            backgroundColor: preset.hex,
                          }}
                          title={preset.name}
                        >
                          {isActive && (
                            <Check className="w-4 h-4 sm:w-5 sm:h-5 drop-shadow-sm" style={{ color: preset.hex === '#FFFFFF' || preset.hex === '#FAF5EB' || preset.hex === '#F3F4F6' ? '#000000' : '#FFFFFF' }} />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-3 pt-2 border-t border-white/5">
                    <span className="text-xs text-white/50">Custom Hex:</span>
                    <input 
                      type="text" 
                      value={customBgColor} 
                      onChange={(e) => {
                        setCustomBgColor(e.target.value);
                        setTheme('custom');
                      }}
                      className="w-24 px-2.5 py-1 rounded-lg bg-black/30 text-white/90 border border-white/15 text-xs focus:outline-none focus:border-[#FF79B0] font-mono transition-all"
                    />
                    <div className="relative w-7 h-7 rounded-lg overflow-hidden border border-white/20 flex-shrink-0 cursor-pointer shadow-inner">
                      <input 
                        type="color" 
                        value={customBgColor.startsWith('#') && customBgColor.length === 7 ? customBgColor : '#1E2128'}
                        onChange={(e) => {
                          setCustomBgColor(e.target.value);
                          setTheme('custom');
                        }}
                        className="absolute inset-0 w-full h-full cursor-pointer opacity-0 scale-150"
                      />
                      <div className="w-full h-full pointer-events-none" style={{ backgroundColor: customBgColor }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Font Style */}
              <div className="space-y-3">
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-[#FF79B0] block">Font Style</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {FONTS_LIST.map((f) => {
                    const isSelected = fontFamily === f.name;
                    return (
                      <button
                        key={f.name}
                        type="button"
                        onClick={() => setFontFamily(f.name)}
                        className={`flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all duration-200 relative cursor-pointer ${
                          isSelected 
                            ? 'border-[#FF79B0] bg-[#FF79B0]/15 shadow-[0_0_15px_rgba(255,121,176,0.25)]' 
                            : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                        }`}
                        style={{ 
                          fontFamily: FONT_MAP[f.name]
                        }}
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-white">
                            {f.name}
                          </span>
                          <span className="text-[10px] opacity-60 text-white/80 font-sans">
                            {f.type}
                          </span>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-[#FF79B0] text-slate-900 flex items-center justify-center flex-shrink-0">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 3 & 4: Font Size & Line Spacing Sliders */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Font Size */}
                <div className="space-y-2 p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-[#FF79B0]">Font Size</span>
                    <span className="px-2.5 py-0.5 rounded-md bg-[#FF79B0]/20 text-[#FF79B0] font-mono text-xs font-bold border border-[#FF79B0]/30">{fontSize}px</span>
                  </div>
                  <input 
                    type="range"
                    min="14"
                    max="28"
                    value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                    className="w-full h-2 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[#FF79B0] hover:bg-white/25 transition-all"
                  />
                  <div className="flex justify-between text-[10px] text-white/40 font-mono">
                    <span>14px</span>
                    <span>28px</span>
                  </div>
                </div>

                {/* Line Spacing */}
                <div className="space-y-2 p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-[#FF79B0]">Line Spacing</span>
                    <span className="px-2.5 py-0.5 rounded-md bg-[#FF79B0]/20 text-[#FF79B0] font-mono text-xs font-bold border border-[#FF79B0]/30">{lineHeight}</span>
                  </div>
                  <input 
                    type="range"
                    min="1.3"
                    max="2.4"
                    step="0.1"
                    value={lineHeight}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setLineHeight(val);
                      setParagraphSpacing(val * 1.25);
                    }}
                    className="w-full h-2 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[#FF79B0] hover:bg-white/25 transition-all"
                  />
                  <div className="flex justify-between text-[10px] text-white/40">
                    <span>Compact (1.3)</span>
                    <span>Airy (2.4)</span>
                  </div>
                </div>
              </div>

              {/* SECTION 5: Page Width */}
              <div className="space-y-2.5">
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-[#FF79B0] block">Page Reading Width</span>
                <div className="grid grid-cols-4 gap-1.5 p-1.5 rounded-2xl bg-white/5 border border-white/10">
                  {(['narrow', 'medium', 'wide', 'full'] as const).map((w) => {
                    const isSelected = pageWidth === w;
                    return (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setPageWidth(w)}
                        className={`py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                          isSelected 
                            ? 'bg-[#FF79B0] text-slate-950 shadow-md scale-[1.02]' 
                            : 'text-white/70 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {w}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 6: Mode Toggles & Terminology Engine */}
              <div className="space-y-3">
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-[#FF79B0] block">Reading Modes & Terminology</span>
                
                {/* Terminology Manager Banner */}
                <div className="p-4 rounded-2xl bg-[#FF79B0]/10 border border-[#FF79B0]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-[#FF79B0]/20 text-[#FF79B0] border border-[#FF79B0]/30 flex-shrink-0">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white block">Global & Per-Novel Terminology Manager</span>
                      <span className="text-[10px] text-white/60 block mt-0.5">
                        {isTerminologyEnabled 
                          ? `${terminologyRules.filter(r => r.enabled).length} replacement rules active • Auto-translating while reading`
                          : 'Replacements temporarily paused'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsReadingSettingsOpen(false);
                      setIsTerminologyModalOpen(true);
                    }}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#FF79B0] hover:bg-[#FF79B0]/90 text-slate-950 font-extrabold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5 flex-shrink-0 active:scale-95"
                  >
                    <span>Manage Dictionary</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                  {/* Infinite Scroll */}
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between hover:bg-white/[0.07] transition-all">
                    <div>
                      <span className="text-xs font-bold text-white block">Infinite Scroll</span>
                      <span className="text-[10px] text-white/50 block mt-0.5">
                        All chapters flow continuously
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInfiniteScroll(!infiniteScroll)}
                      className="w-12 h-6.5 rounded-full transition-all duration-200 relative flex items-center p-1 cursor-pointer flex-shrink-0"
                      style={{ 
                        backgroundColor: infiniteScroll ? '#FF79B0' : 'rgba(255, 255, 255, 0.15)'
                      }}
                    >
                      <div 
                        className={`w-4.5 h-4.5 rounded-full bg-slate-900 shadow-md transition-transform duration-200 ${
                          infiniteScroll ? 'translate-x-5.5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Listen Mode */}
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between hover:bg-white/[0.07] transition-all">
                    <div>
                      <span className="text-xs font-bold text-white block">Listen Mode</span>
                      <span className="text-[10px] text-white/50 block mt-0.5">
                        Optimized for Edge read aloud
                      </span>
                    </div>
                    <button
                      id="settings-listen-mode-btn"
                      type="button"
                      onClick={() => setListenMode(!listenMode)}
                      className="w-12 h-6.5 rounded-full transition-all duration-200 relative flex items-center p-1 cursor-pointer flex-shrink-0"
                      style={{ 
                        backgroundColor: listenMode ? '#FF79B0' : 'rgba(255, 255, 255, 0.15)'
                      }}
                    >
                      <div 
                        className={`w-4.5 h-4.5 rounded-full bg-slate-900 shadow-md transition-transform duration-200 ${
                          listenMode ? 'translate-x-5.5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Distraction-Free Mode */}
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between hover:bg-white/[0.07] transition-all">
                    <div>
                      <span className="text-xs font-bold text-white block">Distraction-Free</span>
                      <span className="text-[10px] text-white/50 block mt-0.5">
                        Hide header controls while reading
                      </span>
                    </div>
                    <button
                      id="settings-distraction-free-btn"
                      type="button"
                      onClick={() => handleSetDistractionFree(!isDistractionFree)}
                      className="w-12 h-6.5 rounded-full transition-all duration-200 relative flex items-center p-1 cursor-pointer flex-shrink-0"
                      style={{ 
                        backgroundColor: isDistractionFree ? '#FF79B0' : 'rgba(255, 255, 255, 0.15)'
                      }}
                    >
                      <div 
                        className={`w-4.5 h-4.5 rounded-full bg-slate-900 shadow-md transition-transform duration-200 ${
                          isDistractionFree ? 'translate-x-5.5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Aesthetic Book-Page Framing Toggle */}
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between hover:bg-white/[0.07] transition-all">
                    <div>
                      <span className="text-xs font-bold text-white block">Book-Page Framing</span>
                      <span className="text-[10px] text-white/50 block mt-0.5">
                        Wrap chapters in book sheet card
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFrameEnabled(!frameEnabled)}
                      className="w-12 h-6.5 rounded-full transition-all duration-200 relative flex items-center p-1 cursor-pointer flex-shrink-0"
                      style={{ 
                        backgroundColor: frameEnabled ? '#FF79B0' : 'rgba(255, 255, 255, 0.15)'
                      }}
                    >
                      <div 
                        className={`w-4.5 h-4.5 rounded-full bg-slate-900 shadow-md transition-transform duration-200 ${
                          frameEnabled ? 'translate-x-5.5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Extended Book Framing Options */}
                {frameEnabled && (
                  <div className="space-y-4 p-4 rounded-2xl bg-white/5 border border-white/15 animate-fade-in text-xs mt-2">
                    {/* Sheet Width Slider */}
                    <div className="space-y-2 pb-3 border-b border-white/10">
                      <div className="flex justify-between items-center text-[10px] text-white/60 uppercase font-bold tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <span>Sheet Width</span>
                          {isLandscape && (
                            <span className="px-1.5 py-0.5 rounded bg-[#FF79B0]/20 text-[#FF79B0] text-[9px] font-bold lowercase tracking-normal">
                              auto landscape: 100%
                            </span>
                          )}
                        </span>
                        <span className="text-[#FF79B0] font-mono text-xs font-bold">{frameWidth}%</span>
                      </div>
                      <input 
                        id="settings-frame-width-slider"
                        type="range"
                        min="70"
                        max="105"
                        step="5"
                        value={frameWidth}
                        onChange={(e) => handleUpdateFrameWidth(parseInt(e.target.value, 10))}
                        className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#FF79B0] hover:bg-white/30 transition-all"
                      />
                      <div className="grid grid-cols-6 gap-1 text-center mt-1.5">
                        {([70, 80, 90, 95, 100, 105] as const).map((w) => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => handleUpdateFrameWidth(w)}
                            className={`py-1 rounded-lg text-[9px] font-bold transition-all border cursor-pointer ${
                              frameWidth === w 
                                ? 'bg-[#FF79B0]/20 text-[#FF79B0] border-[#FF79B0]/50' 
                                : 'text-white/40 border-transparent hover:text-white hover:bg-white/5'
                            }`}
                          >
                            {w}%
                          </button>
                        ))}
                      </div>
                      {isLandscape && (
                        <p className="text-[10px] text-white/50 italic mt-1">
                          Vertical/portrait is saved at {portraitFrameWidth}% and will automatically restore when rotated.
                        </p>
                      )}
                    </div>

                    {/* Theme / Preset Selection */}
                    <div className="space-y-2">
                      <span className="text-[10px] text-white/60 uppercase font-bold tracking-wider block">Sheet Theme</span>
                      <div className="grid grid-cols-5 gap-1.5">
                        {(['cream', 'paper', 'amber', 'dark', 'match'] as const).map((t) => {
                          const isSelected = frameTheme === t;
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setFrameTheme(t)}
                              className={`py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border cursor-pointer ${
                                isSelected ? 'bg-[#FF79B0] text-slate-950 border-[#FF79B0] shadow-sm' : 'text-white/70 hover:text-white border-white/10 bg-white/5'
                              }`}
                            >
                              {t}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Radius / Corners */}
                    <div className="space-y-2">
                      <span className="text-[10px] text-white/60 uppercase font-bold tracking-wider block">Corner Radius</span>
                      <div className="grid grid-cols-6 gap-1.5">
                        {(['none', 'sm', 'md', 'lg', 'xl', '2xl'] as const).map((r) => {
                          const isSelected = frameRadius === r;
                          return (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setFrameRadius(r)}
                              className={`py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border cursor-pointer ${
                                isSelected ? 'bg-[#FF79B0] text-slate-950 border-[#FF79B0] shadow-sm' : 'text-white/70 hover:text-white border-white/10 bg-white/5'
                              }`}
                            >
                              {r}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Borders */}
                    <div className="space-y-2">
                      <span className="text-[10px] text-white/60 uppercase font-bold tracking-wider block">Sheet Border</span>
                      <div className="grid grid-cols-5 gap-1.5">
                        {(['none', 'thin', 'medium', 'double', 'ornament'] as const).map((b) => {
                          const isSelected = frameBorder === b;
                          return (
                            <button
                              key={b}
                              type="button"
                              onClick={() => setFrameBorder(b)}
                              className={`py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border cursor-pointer ${
                                isSelected ? 'bg-[#FF79B0] text-slate-950 border-[#FF79B0] shadow-sm' : 'text-white/70 hover:text-white border-white/10 bg-white/5'
                              }`}
                            >
                              {b}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Shadows */}
                    <div className="space-y-2">
                      <span className="text-[10px] text-white/60 uppercase font-bold tracking-wider block">Drop Shadow</span>
                      <div className="grid grid-cols-4 gap-1.5">
                        {(['none', 'soft', 'medium', 'deep'] as const).map((s) => {
                          const isSelected = frameShadow === s;
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setFrameShadow(s)}
                              className={`py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border cursor-pointer ${
                                isSelected ? 'bg-[#FF79B0] text-slate-950 border-[#FF79B0] shadow-sm' : 'text-white/70 hover:text-white border-white/10 bg-white/5'
                              }`}
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Padding / Margins */}
                    <div className="space-y-2">
                      <span className="text-[10px] text-white/60 uppercase font-bold tracking-wider block">Page Padding</span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['compact', 'standard', 'relaxed'] as const).map((p) => {
                          const isSelected = framePadding === p;
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setFramePadding(p)}
                              className={`py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border cursor-pointer ${
                                isSelected ? 'bg-[#FF79B0] text-slate-950 border-[#FF79B0] shadow-sm' : 'text-white/70 hover:text-white border-white/10 bg-white/5'
                              }`}
                            >
                              {p}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 8: Action Buttons (Save / Restore Profile Defaults) */}
              <div className="pt-5 border-t border-white/10 flex flex-col gap-3">
                <button
                  type="button"
                  id="reset-reading-settings-btn"
                  onClick={handleSaveAsDefault}
                  className="w-full py-3.5 rounded-2xl bg-[#FF79B0] hover:bg-[#FF79B0]/90 text-slate-950 font-extrabold text-xs sm:text-sm uppercase tracking-wider transition-all border border-transparent flex items-center justify-center gap-2 active:scale-98 cursor-pointer shadow-[0_10px_20px_-5px_rgba(255,121,176,0.3)]"
                  title="Save your current theme, fonts, framing & scrolling configuration as your new default settings profile"
                >
                  <CheckSquare className="w-4 h-4" />
                  Save Settings as Default Profile
                </button>
                <div className="flex items-center justify-between px-1 text-xs text-white/50">
                  <button
                    type="button"
                    onClick={handleRestoreDefaults}
                    className="hover:underline hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                    title="Restore your reading appearance to your saved default settings"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Load Saved Profile
                  </button>
                  <button
                    type="button"
                    onClick={handleResetToFactoryDefaults}
                    className="hover:underline hover:text-[#FF79B0] transition-colors cursor-pointer"
                    title="Wipe custom defaults and return to original factory dark theme settings"
                  >
                    Reset Factory Defaults
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 6. CUSTOM CONFIRMATION MODAL */}
      {confirmDialog.isOpen && (
        <div id="custom-confirm-modal-overlay" className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            id="custom-confirm-modal-body"
            className="w-full max-w-sm rounded-2xl border p-6 flex flex-col shadow-2xl animate-in zoom-in-95 duration-150 select-text"
            style={{ 
              backgroundColor: currentTheme.cardBg, 
              color: currentTheme.text,
              borderColor: currentTheme.border
            }}
          >
            <div className="flex items-start gap-3 mb-4">
              {confirmDialog.isDanger ? (
                <div className="p-2 rounded-full bg-rose-500/10 text-rose-500 flex-shrink-0 animate-pulse">
                  <AlertTriangle className="w-6 h-6" />
                </div>
              ) : (
                <div className="p-2 rounded-full bg-blue-500/10 text-blue-500 flex-shrink-0">
                  <Info className="w-6 h-6" />
                </div>
              )}
              <div>
                <h3 className="text-base font-bold font-serif">{confirmDialog.title}</h3>
                <p className="text-xs opacity-75 mt-1 leading-relaxed">
                  {confirmDialog.message}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <button 
                id="btn-confirm-cancel"
                type="button"
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                style={{ borderColor: currentTheme.border }}
              >
                {confirmDialog.cancelText || "Cancel"}
              </button>
              <button 
                id="btn-confirm-execute"
                type="button"
                onClick={confirmDialog.onConfirm}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-white hover:brightness-115 transition-all shadow"
                style={{ 
                  backgroundColor: confirmDialog.isDanger ? '#f43f5e' : currentTheme.accent 
                }}
              >
                {confirmDialog.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. CUSTOM FLOATING TOAST NOTIFICATION */}
      {notification.isOpen && (
        <div 
          id="custom-toast-notification" 
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border text-sm max-w-sm animate-in slide-in-from-bottom-6 fade-in duration-200"
          style={{ 
            backgroundColor: currentTheme.cardBg, 
            color: currentTheme.text,
            borderColor: currentTheme.border
          }}
        >
          {notification.type === 'success' && (
            <div className="p-1 rounded-full bg-emerald-500/15 text-emerald-500 flex-shrink-0">
              <Check className="w-4 h-4" />
            </div>
          )}
          {notification.type === 'error' && (
            <div className="p-1 rounded-full bg-rose-500/15 text-rose-500 flex-shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
          )}
          {notification.type === 'info' && (
            <div className="p-1 rounded-full bg-sky-500/15 text-sky-500 flex-shrink-0">
              <Info className="w-4 h-4" />
            </div>
          )}
          <span className="flex-1 font-medium text-xs leading-relaxed">{notification.message}</span>
          <button 
            id="close-toast-btn"
            onClick={() => setNotification(prev => ({ ...prev, isOpen: false }))}
            className="p-0.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 opacity-60 hover:opacity-100 transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* MICROSOFT EDGE READ ALOUD VOICE OPTIONS & ADVANCED SETTINGS MODAL */}
      <EdgeVoiceOptionsModal
        isOpen={isVoiceOptionsOpen}
        onClose={() => setIsVoiceOptionsOpen(false)}
        settings={ttsSettings}
        sleepTimerMinutes={ttsState.sleepTimerMinutes}
        sleepTimerRemainingSec={ttsState.sleepTimerRemainingSec}
        currentChapterIndex={ttsState.currentChapterIndex}
        currentTheme={currentTheme}
        onSetVoice={ttsSetVoice}
        onSetPitch={ttsSetPitch}
        onSetHighlightMode={ttsSetHighlightMode}
        onSetAutoScrollMode={ttsSetAutoScrollMode}
        onSetVolume={ttsSetVolume}
        onSetSyncOffset={ttsSetSyncOffset}
        onSetShowClockInBar={ttsSetShowClockInBar}
        onSetSleepTimer={ttsSetSleepTimer}
        onPreloadChapter={ttsPreloadChapter}
        onPreloadNextChapters={ttsPreloadNextChapters}
        onClearCache={ttsClearCache}
        onGetCacheStats={ttsGetCacheStats}
      />

      {/* GLOBAL & PER-NOVEL TERMINOLOGY MANAGER MODAL WITH ERROR BOUNDARY */}
      <TerminologyErrorBoundary
        isOpen={isTerminologyModalOpen}
        onClose={() => setIsTerminologyModalOpen(false)}
        onResetDefaults={handleResetTerminologyToDefaults}
      >
        <TerminologyManagerModal
          isOpen={isTerminologyModalOpen}
          onClose={() => setIsTerminologyModalOpen(false)}
          rules={terminologyRules}
          setRules={setTerminologyRules}
          ignoreTerms={ignoreTerms}
          setIgnoreTerms={setIgnoreTerms}
          cleanerRules={cleanerRules}
          setCleanerRules={setCleanerRules}
          chapters={chapters}
          setChapters={setChapters}
          currentChapterIndex={currentChapterIndex}
          currentBookTitle={bookTitle}
          isTerminologyEnabled={isTerminologyEnabled}
          setIsTerminologyEnabled={setIsTerminologyEnabled}
          showNotification={showCustomNotification}
        />
      </TerminologyErrorBoundary>

      {/* 8. PASTE INTEGRITY & WARNING AUDIT DIALOG */}
      {pasteAuditDialog.isOpen && (
        <div id="paste-audit-modal-overlay" className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            id="paste-audit-modal-body"
            className="w-full max-w-md rounded-2xl border p-6 flex flex-col shadow-2xl animate-in zoom-in-95 duration-150 max-h-[85vh] overflow-y-auto"
            style={{ 
              backgroundColor: currentTheme.cardBg, 
              color: currentTheme.text,
              borderColor: currentTheme.border
            }}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2.5 rounded-full bg-amber-500/15 text-amber-500 flex-shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold font-serif">Pasted Text Integrity Warning</h3>
                <p className="text-xs opacity-75 mt-1 leading-relaxed">
                  We parsed <strong>{pasteAuditDialog.chaptersToImport.length}</strong> chapter(s) ({pasteAuditDialog.totalWords.toLocaleString()} words, {pasteAuditDialog.totalParagraphs.toLocaleString()} paragraphs), but detected potential formatting anomalies or text cutoffs:
                </p>
              </div>
            </div>

            <div className="space-y-2 mb-5">
              <span className="text-xs font-bold uppercase tracking-wider block opacity-75">Warnings & Quality Audit:</span>
              <div className="p-3 rounded-xl bg-black/10 dark:bg-white/5 border border-white/10 space-y-2 text-xs max-h-48 overflow-y-auto">
                {pasteAuditDialog.warnings.map((warn, i) => (
                  <div key={i} className="text-amber-600 dark:text-amber-300 leading-relaxed flex items-start gap-1.5">
                    <span className="flex-shrink-0">•</span>
                    <span>{warn}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-black/10 dark:border-white/10">
              <button 
                id="btn-paste-audit-cancel"
                type="button"
                onClick={() => setPasteAuditDialog(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 rounded-xl text-xs font-semibold border hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                style={{ borderColor: currentTheme.border }}
              >
                Cancel & Edit Paste
              </button>
              <button 
                id="btn-paste-audit-proceed"
                type="button"
                onClick={() => executeImportChapters(pasteAuditDialog.chaptersToImport)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white hover:brightness-110 transition-all shadow cursor-pointer"
                style={{ backgroundColor: currentTheme.accent }}
              >
                Proceed & Import All Chapters
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

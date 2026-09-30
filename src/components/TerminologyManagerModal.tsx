import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Settings, 
  Plus, 
  Trash2, 
  Edit3, 
  Search, 
  Download, 
  Upload, 
  X, 
  Check, 
  Copy, 
  Filter, 
  ArrowRight, 
  ChevronDown, 
  ChevronRight, 
  BarChart2, 
  ShieldAlert, 
  Sliders, 
  RotateCcw,
  Sparkles,
  Layers,
  Globe,
  Book,
  CheckSquare,
  Square,
  Eraser,
  Undo2,
  Redo2,
  History,
  AlertCircle,
  CheckCircle2,
  Zap,
  RefreshCw,
  FileText,
  ListFilter,
  BookmarkPlus,
  HelpCircle
} from 'lucide-react';
import { 
  TerminologyRule, 
  IgnoreTerm, 
  TermCategory, 
  TERMINOLOGY_CATEGORIES,
  LineCleanerRule,
  CleanerMatchMode,
  TerminologyDictionaryExport
} from '../types/terminology';
import { Chapter } from '../types/novel';
import { testTerminologyPreview } from '../utils/terminology';
import { 
  scanChaptersForPattern, 
  executeCleanChapters, 
  executeAllCleanerRules,
  CleanerPreset,
  CleanScanResult
} from '../utils/cleaner';

interface TerminologyManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  rules: TerminologyRule[];
  setRules: React.Dispatch<React.SetStateAction<TerminologyRule[]>>;
  ignoreTerms: IgnoreTerm[];
  setIgnoreTerms: React.Dispatch<React.SetStateAction<IgnoreTerm[]>>;
  cleanerRules?: LineCleanerRule[];
  setCleanerRules?: React.Dispatch<React.SetStateAction<LineCleanerRule[]>>;
  chapters?: Chapter[];
  setChapters?: React.Dispatch<React.SetStateAction<Chapter[]>>;
  currentChapterIndex?: number;
  currentBookTitle: string;
  isTerminologyEnabled: boolean;
  setIsTerminologyEnabled: (enabled: boolean) => void;
  showNotification: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const TerminologyManagerModal: React.FC<TerminologyManagerModalProps> = ({
  isOpen,
  onClose,
  rules,
  setRules,
  ignoreTerms,
  setIgnoreTerms,
  cleanerRules = [],
  setCleanerRules,
  chapters = [],
  setChapters,
  currentChapterIndex = 0,
  currentBookTitle,
  isTerminologyEnabled,
  setIsTerminologyEnabled,
  showNotification
}) => {
  // Main Tab State
  const [activeTab, setActiveTab] = useState<'rules' | 'ignore' | 'preview' | 'stats' | 'cleaner'>('rules');
  
  // Scope Filter: 'all' | 'global' | 'novel'
  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'novel'>('all');
  
  // Category Filter
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Search Query
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sorting: 'alpha' | 'recent' | 'matches'
  const [sortBy, setSortBy] = useState<'alpha' | 'recent' | 'matches'>('recent');

  // Collapsed Category Accordions State
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Bulk Selection
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);

  // Add / Edit Rule Form Drawer State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [formOriginal, setFormOriginal] = useState('');
  const [formReplacement, setFormReplacement] = useState('');
  const [formCategory, setFormCategory] = useState<TermCategory>('Characters');
  const [formScope, setFormScope] = useState<'global' | 'novel'>('global');
  const [formIsCaseAware, setFormIsCaseAware] = useState(true);
  const [formWholeWord, setFormWholeWord] = useState(true);

  // Ignore Term Form State
  const [newIgnoreInput, setNewIgnoreInput] = useState('');

  // Live Tester Sample Text
  const [sampleTesterText, setSampleTesterText] = useState(
    `Lune walked into the cathedral of the Steam Church located inside the Black Forest. Luo En used Spirit Vision to sense the Machine Spirit.`
  );

  // Bulk Move Category Select
  const [bulkCategoryTarget, setBulkCategoryTarget] = useState<TermCategory>('Characters');

  // LINE CLEANER TAB STATE
  const [cleanerInput, setCleanerInput] = useState('');
  const [cleanerMode, setCleanerMode] = useState<CleanerMatchMode>('contains');
  const [cleanerCaseSensitive, setCleanerCaseSensitive] = useState(false);
  const [cleanerScope, setCleanerScope] = useState<'all' | 'current'>('all');
  const [saveAsPersistentRule, setSaveAsPersistentRule] = useState(true);
  const [cleanerRuleScope, setCleanerRuleScope] = useState<'global' | 'novel'>('global');
  const [isPreviewMatchesOpen, setIsPreviewMatchesOpen] = useState(false);
  
  // ADVANCED MULTI-STEP CLEANER UNDO / REDO HISTORY
  interface CleanerHistorySnapshot {
    id: string;
    timestamp: number;
    label: string;
    chapters: Chapter[];
    linesRemovedCount?: number;
  }
  const [cleanerUndoStack, setCleanerUndoStack] = useState<CleanerHistorySnapshot[]>([]);
  const [cleanerRedoStack, setCleanerRedoStack] = useState<CleanerHistorySnapshot[]>([]);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [isCleaningInProgress, setIsCleaningInProgress] = useState(false);

  // CUSTOM QUICK PRESETS STATE
  const [customPresets, setCustomPresets] = useState<CleanerPreset[]>(() => {
    try {
      const saved = localStorage.getItem('novel_cleaner_custom_presets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load custom cleaner presets:', e);
    }
    return [];
  });

  // Sync custom presets to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('novel_cleaner_custom_presets', JSON.stringify(customPresets));
    } catch (e) {
      console.error('Failed to save custom presets:', e);
    }
  }, [customPresets]);

  const [isAddPresetOpen, setIsAddPresetOpen] = useState(false);
  const [presetTitleInput, setPresetTitleInput] = useState('');
  const [presetPatternInput, setPresetPatternInput] = useState('');
  const [presetModeInput, setPresetModeInput] = useState<CleanerMatchMode>('contains');
  const [isMatchModeHelpOpen, setIsMatchModeHelpOpen] = useState(false);

  // Toggle Category Collapse
  const toggleCategoryCollapse = (cat: string) => {
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const safeRules = useMemo(() => Array.isArray(rules) ? rules.filter(Boolean) : [], [rules]);
  const safeIgnoreTerms = useMemo(() => Array.isArray(ignoreTerms) ? ignoreTerms.filter(Boolean) : [], [ignoreTerms]);
  const safeCleanerRules = useMemo(() => Array.isArray(cleanerRules) ? cleanerRules.filter(Boolean) : [], [cleanerRules]);
  const safeChapters = useMemo(() => Array.isArray(chapters) ? chapters.filter(Boolean) : [], [chapters]);

  // SOLUTION B: Auto-prune cleaner history whenever chapters are deleted or novel changes
  const previousChapterIdsRef = useRef<string[]>([]);
  const previousBookTitleRef = useRef<string | undefined>(currentBookTitle);

  useEffect(() => {
    // If novel changed, reset history completely
    if (previousBookTitleRef.current !== currentBookTitle) {
      previousBookTitleRef.current = currentBookTitle;
      setCleanerUndoStack([]);
      setCleanerRedoStack([]);
      previousChapterIdsRef.current = safeChapters.map(c => c.id || String(c.number));
      return;
    }

    const currentIds = safeChapters.map(c => c.id || String(c.number));
    const currentIdSet = new Set(currentIds);
    const prevIds = previousChapterIdsRef.current;

    // Check if any chapters were deleted (previous IDs no longer exist in current chapters)
    const wasChapterDeleted = prevIds.length > 0 && prevIds.some(id => !currentIdSet.has(id));

    if (wasChapterDeleted) {
      // Auto-prune all snapshots in Undo & Redo stacks so deleted chapters are scrubbed from history
      const pruneSnapshot = (snap: CleanerHistorySnapshot): CleanerHistorySnapshot | null => {
        const remainingChapters = snap.chapters.filter(c => currentIdSet.has(c.id || String(c.number)));
        if (remainingChapters.length === 0) return null;
        return {
          ...snap,
          chapters: remainingChapters
        };
      };

      setCleanerUndoStack(prev => 
        prev.map(pruneSnapshot).filter((s): s is CleanerHistorySnapshot => s !== null)
      );
      setCleanerRedoStack(prev => 
        prev.map(pruneSnapshot).filter((s): s is CleanerHistorySnapshot => s !== null)
      );
    }

    previousChapterIdsRef.current = currentIds;
  }, [safeChapters, currentBookTitle]);

  // Live scan result for the current cleanerInput
  const liveScanResult: CleanScanResult = useMemo(() => {
    if (!cleanerInput.trim() || safeChapters.length === 0) {
      return { totalMatchingLines: 0, matchingChaptersCount: 0, matchedChapters: [] };
    }
    return scanChaptersForPattern(
      safeChapters,
      cleanerInput,
      cleanerMode,
      cleanerCaseSensitive,
      cleanerScope === 'current' ? currentChapterIndex : undefined
    );
  }, [cleanerInput, cleanerMode, cleanerCaseSensitive, cleanerScope, safeChapters, currentChapterIndex]);

  // Execute single pattern clean
  const handleExecuteClean = () => {
    if (!cleanerInput.trim()) {
      showNotification('Please paste or type the text you want to remove', 'error');
      return;
    }

    if (safeChapters.length === 0 || !setChapters) {
      showNotification('No chapters available to clean', 'error');
      return;
    }

    setIsCleaningInProgress(true);

    try {
      // 1. Clean chapters
      const result = executeCleanChapters(
        safeChapters,
        cleanerInput,
        cleanerMode,
        cleanerCaseSensitive,
        cleanerScope === 'current' ? currentChapterIndex : undefined
      );

      if (result.totalRemovedCount === 0) {
        showNotification('No matching lines found to remove', 'info');
        setIsCleaningInProgress(false);
        return;
      }

      // 2. Push current state to multi-step Undo history before updating
      const cleanLabel = cleanerInput.trim().length > 25 
        ? `${cleanerInput.trim().slice(0, 22)}...` 
        : cleanerInput.trim();
      
      const newSnapshot: CleanerHistorySnapshot = {
        id: `clean-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        label: `Removed "${cleanLabel}" (${result.totalRemovedCount} line${result.totalRemovedCount > 1 ? 's' : ''})`,
        chapters: safeChapters.map(c => ({ ...c, content: [...c.content] })),
        linesRemovedCount: result.totalRemovedCount
      };

      setCleanerUndoStack(prev => [newSnapshot, ...prev].slice(0, 20));
      setCleanerRedoStack([]); // reset redo tree on new action

      // 3. Update chapter state & localStorage
      setChapters(result.updatedChapters);
      try {
        localStorage.setItem('novel_chapters', JSON.stringify(result.updatedChapters));
      } catch (e) {
        console.error('Failed to sync cleaned chapters to localStorage:', e);
      }

      // 4. Optionally save as persistent rule
      if (saveAsPersistentRule && setCleanerRules) {
        const trimmedPattern = cleanerInput.trim();
        const existingRule = safeCleanerRules.find(r => r.pattern.trim().toLowerCase() === trimmedPattern.toLowerCase() && r.mode === cleanerMode);
        
        if (!existingRule) {
          const newRule: LineCleanerRule = {
            id: `cleaner-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            pattern: trimmedPattern,
            mode: cleanerMode,
            enabled: true,
            scope: cleanerRuleScope,
            bookTitle: cleanerRuleScope === 'novel' ? currentBookTitle : undefined,
            caseSensitive: cleanerCaseSensitive,
            removedCount: result.totalRemovedCount,
            createdAt: Date.now()
          };
          setCleanerRules(prev => [newRule, ...prev]);
        } else {
          // Increment match count
          setCleanerRules(prev => prev.map(r => r.id === existingRule.id ? {
            ...r,
            removedCount: (r.removedCount || 0) + result.totalRemovedCount
          } : r));
        }
      }

      showNotification(
        `Successfully removed ${result.totalRemovedCount} line${result.totalRemovedCount > 1 ? 's' : ''} across ${result.affectedChaptersCount} chapter${result.affectedChaptersCount > 1 ? 's' : ''}!`,
        'success'
      );
    } catch (err) {
      console.error('Error executing chapter cleaner:', err);
      showNotification('Failed to clean chapters', 'error');
    } finally {
      setIsCleaningInProgress(false);
    }
  };

  // Multi-step Undo (SOLUTION A: Guarded by active chapter IDs - Never restores deleted chapters)
  const handleUndoClean = () => {
    if (cleanerUndoStack.length === 0 || !setChapters) return;

    const [snapshotToRestore, ...remainingUndo] = cleanerUndoStack;

    // Push current chapters into Redo stack before restoring previous state
    const redoSnapshot: CleanerHistorySnapshot = {
      id: `redo-${Date.now()}`,
      timestamp: Date.now(),
      label: snapshotToRestore.label,
      chapters: safeChapters.map(c => ({ ...c, content: [...c.content] })),
      linesRemovedCount: snapshotToRestore.linesRemovedCount
    };

    setCleanerRedoStack(prev => [redoSnapshot, ...prev].slice(0, 20));
    setCleanerUndoStack(remainingUndo);

    // Guard: Map each restored chapter's content strictly into chapters that CURRENTLY exist in the novel
    const snapshotChapterMap = new Map<string, string[]>();
    for (const snapCh of snapshotToRestore.chapters) {
      const key = snapCh.id || String(snapCh.number);
      snapshotChapterMap.set(key, snapCh.content);
    }

    const updatedChapters = safeChapters.map(currentCh => {
      const key = currentCh.id || String(currentCh.number);
      const restoredContent = snapshotChapterMap.get(key);
      if (restoredContent) {
        return {
          ...currentCh,
          content: [...restoredContent]
        };
      }
      return currentCh; // Not in snapshot or created later: keep intact
    });

    setChapters(updatedChapters);
    try {
      localStorage.setItem('novel_chapters', JSON.stringify(updatedChapters));
    } catch (e) {
      console.error('Failed to undo chapters in localStorage:', e);
    }

    showNotification(
      `Undid: ${snapshotToRestore.label}${remainingUndo.length > 0 ? ` (${remainingUndo.length} more available)` : ''}`,
      'info'
    );
  };

  // Multi-step Redo (SOLUTION A: Guarded by active chapter IDs - Never restores deleted chapters)
  const handleRedoClean = () => {
    if (cleanerRedoStack.length === 0 || !setChapters) return;

    const [snapshotToRedo, ...remainingRedo] = cleanerRedoStack;

    // Push current chapters into Undo stack before reapplying
    const undoSnapshot: CleanerHistorySnapshot = {
      id: `undo-${Date.now()}`,
      timestamp: Date.now(),
      label: snapshotToRedo.label,
      chapters: safeChapters.map(c => ({ ...c, content: [...c.content] })),
      linesRemovedCount: snapshotToRedo.linesRemovedCount
    };

    setCleanerUndoStack(prev => [undoSnapshot, ...prev].slice(0, 20));
    setCleanerRedoStack(remainingRedo);

    // Guard: Map each redone chapter's content strictly into chapters that CURRENTLY exist in the novel
    const snapshotChapterMap = new Map<string, string[]>();
    for (const snapCh of snapshotToRedo.chapters) {
      const key = snapCh.id || String(snapCh.number);
      snapshotChapterMap.set(key, snapCh.content);
    }

    const updatedChapters = safeChapters.map(currentCh => {
      const key = currentCh.id || String(currentCh.number);
      const redoneContent = snapshotChapterMap.get(key);
      if (redoneContent) {
        return {
          ...currentCh,
          content: [...redoneContent]
        };
      }
      return currentCh;
    });

    setChapters(updatedChapters);
    try {
      localStorage.setItem('novel_chapters', JSON.stringify(updatedChapters));
    } catch (e) {
      console.error('Failed to redo chapters in localStorage:', e);
    }

    showNotification(`Redid: ${snapshotToRedo.label}`, 'success');
  };

  // Execute all saved cleaner rules on all chapters
  const handleRunAllSavedCleanerRules = () => {
    if (safeChapters.length === 0 || safeCleanerRules.length === 0 || !setChapters) {
      showNotification('No active cleaner rules or chapters found', 'info');
      return;
    }

    const { updatedChapters, totalRemoved } = executeAllCleanerRules(
      safeChapters,
      safeCleanerRules,
      currentBookTitle
    );

    if (totalRemoved === 0) {
      showNotification('All chapters are already clean. No matching lines found.', 'info');
      return;
    }

    // Push to undo stack
    const newSnapshot: CleanerHistorySnapshot = {
      id: `clean-all-${Date.now()}`,
      timestamp: Date.now(),
      label: `Ran All Cleaner Rules (${totalRemoved} line${totalRemoved > 1 ? 's' : ''})`,
      chapters: safeChapters.map(c => ({ ...c, content: [...c.content] })),
      linesRemovedCount: totalRemoved
    };

    setCleanerUndoStack(prev => [newSnapshot, ...prev].slice(0, 20));
    setCleanerRedoStack([]);

    setChapters(updatedChapters);
    try {
      localStorage.setItem('novel_chapters', JSON.stringify(updatedChapters));
    } catch (e) {
      console.error('Failed to save cleaned chapters to localStorage:', e);
    }

    if (setCleanerRules) {
      setCleanerRules([...safeCleanerRules]);
    }

    showNotification(`Cleaned ${totalRemoved} lines using saved rules!`, 'success');
  };

  // Delete a saved cleaner rule
  const handleDeleteCleanerRule = (id: string) => {
    if (setCleanerRules) {
      setCleanerRules(prev => prev.filter(r => r.id !== id));
      showNotification('Deleted cleaner rule', 'info');
    }
  };

  // Toggle saved cleaner rule enabled
  const handleToggleCleanerRule = (id: string) => {
    if (setCleanerRules) {
      setCleanerRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
    }
  };

  // Custom Quick Presets handlers
  const handleOpenAddPreset = () => {
    // If user already typed something into cleanerInput, pre-fill it!
    setPresetPatternInput(cleanerInput.trim());
    setPresetModeInput(cleanerMode);
    if (cleanerInput.trim()) {
      const cleanSnippet = cleanerInput.trim().slice(0, 24);
      setPresetTitleInput(cleanSnippet);
    } else {
      setPresetTitleInput('');
    }
    setIsAddPresetOpen(true);
  };

  const handleSaveCustomPreset = () => {
    const title = presetTitleInput.trim();
    const pattern = presetPatternInput.trim() || cleanerInput.trim();

    if (!title) {
      showNotification('Please enter a name for your preset', 'error');
      return;
    }
    if (!pattern) {
      showNotification('Please provide text to remove for this preset', 'error');
      return;
    }

    const newPreset: CleanerPreset = {
      id: `preset-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title,
      pattern,
      mode: presetModeInput
    };

    setCustomPresets(prev => [...prev, newPreset]);
    setIsAddPresetOpen(false);
    setPresetTitleInput('');
    setPresetPatternInput('');
    showNotification(`Saved custom preset: "${title}"`, 'success');
  };

  const handleDeletePreset = (idOrIndex: string | number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCustomPresets(prev => prev.filter((p, idx) => (p.id ? p.id !== idOrIndex : idx !== idOrIndex)));
    showNotification('Preset removed', 'info');
  };

  // Quick preset loader
  const handleApplyPreset = (preset: CleanerPreset) => {
    setCleanerInput(preset.pattern);
    setCleanerMode(preset.mode);
    setCleanerCaseSensitive(false);
    showNotification(`Loaded preset: "${preset.title}"`, 'info');
  };

  // Export JSON
  const handleExportJSON = () => {
    const data: TerminologyDictionaryExport = {
      version: 2,
      exportedAt: new Date().toISOString(),
      rules: safeRules,
      ignoreTerms: safeIgnoreTerms,
      cleanerRules: safeCleanerRules
    };
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `novel-terminology-dictionary.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Exported terminology & cleaner dictionary');
  };

  // Import JSON
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json && (Array.isArray(json.rules) || Array.isArray(json.cleanerRules))) {
          // Merge imported rules
          if (Array.isArray(json.rules)) {
            const existingIds = new Set(rules.map(r => r.id));
            const newRules = json.rules.map((r: any) => ({
              ...r,
              id: existingIds.has(r.id) ? `imported-${Date.now()}-${Math.random().toString(36).substring(2, 6)}` : r.id
            }));
            setRules(prev => [...newRules, ...prev]);
          }

          if (Array.isArray(json.ignoreTerms)) {
            setIgnoreTerms(prev => [...json.ignoreTerms, ...prev]);
          }

          if (Array.isArray(json.cleanerRules) && setCleanerRules) {
            const existingCleanIds = new Set(safeCleanerRules.map(c => c.id));
            const newCleanRules = json.cleanerRules.map((c: any) => ({
              ...c,
              id: existingCleanIds.has(c.id) ? `imported-clean-${Date.now()}-${Math.random().toString(36).substring(2, 6)}` : c.id
            }));
            setCleanerRules(prev => [...newCleanRules, ...prev]);
          }

          showNotification('Successfully imported rules and cleaner settings!');
        } else {
          showNotification('Invalid terminology JSON file structure', 'error');
        }
      } catch (err) {
        showNotification('Failed to parse JSON file', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };
  const filteredRules = useMemo(() => {
    return safeRules.filter(r => {
      if (!r || typeof r !== 'object') return false;
      const orig = typeof r.original === 'string' ? r.original : '';
      const repl = typeof r.replacement === 'string' ? r.replacement : '';
      const cat = typeof r.category === 'string' ? r.category : 'Other';
      const scope = r.scope || 'global';

      // Scope filter
      if (scopeFilter === 'global' && scope !== 'global') return false;
      if (scopeFilter === 'novel' && (scope !== 'novel' || (r.bookTitle || '') !== (currentBookTitle || ''))) return false;

      // Category filter
      if (selectedCategory !== 'all' && cat !== selectedCategory) return false;

      // Search query
      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchOrig = orig.toLowerCase().includes(q);
        const matchRepl = repl.toLowerCase().includes(q);
        const matchCat = cat.toLowerCase().includes(q);
        return matchOrig || matchRepl || matchCat;
      }

      return true;
    }).sort((a, b) => {
      const aOrig = typeof a?.original === 'string' ? a.original : '';
      const bOrig = typeof b?.original === 'string' ? b.original : '';
      const aMatches = typeof a?.matchCount === 'number' ? a.matchCount : 0;
      const bMatches = typeof b?.matchCount === 'number' ? b.matchCount : 0;
      const aCreated = typeof a?.createdAt === 'number' ? a.createdAt : 0;
      const bCreated = typeof b?.createdAt === 'number' ? b.createdAt : 0;

      if (sortBy === 'alpha') {
        return aOrig.localeCompare(bOrig);
      }
      if (sortBy === 'matches') {
        return bMatches - aMatches;
      }
      return bCreated - aCreated; // recent
    });
  }, [safeRules, scopeFilter, currentBookTitle, selectedCategory, searchQuery, sortBy]);

  // Group Rules by Category
  const groupedRules = useMemo(() => {
    const map: Record<TermCategory, TerminologyRule[]> = {
      Characters: [],
      Places: [],
      Organizations: [],
      Skills: [],
      Items: [],
      Titles: [],
      Creatures: [],
      Other: []
    };

    filteredRules.forEach(r => {
      if (!r) return;
      const cat = (r.category && map[r.category]) ? r.category : 'Other';
      map[cat].push(r);
    });

    return map;
  }, [filteredRules]);

  // Open Form for Add
  const handleOpenAddForm = () => {
    setEditingRuleId(null);
    setFormOriginal('');
    setFormReplacement('');
    setFormCategory('Characters');
    setFormScope('global');
    setFormIsCaseAware(true);
    setFormWholeWord(true);
    setIsFormOpen(true);
  };

  // Open Form for Edit
  const handleOpenEditForm = (rule: TerminologyRule) => {
    setEditingRuleId(rule.id);
    setFormOriginal(rule.original);
    setFormReplacement(rule.replacement);
    setFormCategory(rule.category);
    setFormScope(rule.scope);
    setFormIsCaseAware(rule.isCaseAware);
    setFormWholeWord(rule.wholeWord);
    setIsFormOpen(true);
  };

  // Save Rule (Add or Edit)
  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formOriginal.trim() || !formReplacement.trim()) {
      showNotification('Please fill in both original and replacement terms', 'error');
      return;
    }

    if (editingRuleId) {
      // Edit
      setRules(prev => prev.map(r => r.id === editingRuleId ? {
        ...r,
        original: formOriginal.trim(),
        replacement: formReplacement.trim(),
        category: formCategory,
        scope: formScope,
        bookTitle: formScope === 'novel' ? currentBookTitle : undefined,
        isCaseAware: formIsCaseAware,
        wholeWord: formWholeWord
      } : r));
      showNotification(`Updated term: ${formOriginal.trim()}`);
    } else {
      // Add
      const newRule: TerminologyRule = {
        id: `term-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        original: formOriginal.trim(),
        replacement: formReplacement.trim(),
        category: formCategory,
        enabled: true,
        scope: formScope,
        bookTitle: formScope === 'novel' ? currentBookTitle : undefined,
        isCaseAware: formIsCaseAware,
        wholeWord: formWholeWord,
        matchCount: 0,
        createdAt: Date.now()
      };
      setRules(prev => [newRule, ...prev]);
      showNotification(`Added terminology rule: ${formOriginal.trim()} → ${formReplacement.trim()}`);
    }

    setIsFormOpen(false);
  };

  // Toggle Rule Status
  const handleToggleRuleStatus = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  // Duplicate Rule
  const handleDuplicateRule = (rule: TerminologyRule) => {
    const dup: TerminologyRule = {
      ...rule,
      id: `term-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      original: `${rule.original} (Copy)`,
      createdAt: Date.now(),
      matchCount: 0
    };
    setRules(prev => [dup, ...prev]);
    showNotification(`Duplicated rule: ${rule.original}`);
  };

  // Delete Rule
  const handleDeleteRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
    setSelectedRuleIds(prev => prev.filter(i => i !== id));
    showNotification('Rule deleted', 'info');
  };

  // Bulk Selection Toggles
  const handleSelectAll = () => {
    if (selectedRuleIds.length === filteredRules.length) {
      setSelectedRuleIds([]);
    } else {
      setSelectedRuleIds(filteredRules.map(r => r.id));
    }
  };

  const handleToggleSelectRule = (id: string) => {
    setSelectedRuleIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // Bulk Actions
  const handleBulkEnable = (enable: boolean) => {
    setRules(prev => prev.map(r => selectedRuleIds.includes(r.id) ? { ...r, enabled: enable } : r));
    showNotification(`${enable ? 'Enabled' : 'Disabled'} ${selectedRuleIds.length} selected rules`);
  };

  const handleBulkDelete = () => {
    setRules(prev => prev.filter(r => !selectedRuleIds.includes(r.id)));
    showNotification(`Deleted ${selectedRuleIds.length} rules`, 'info');
    setSelectedRuleIds([]);
  };

  const handleBulkMoveCategory = () => {
    setRules(prev => prev.map(r => selectedRuleIds.includes(r.id) ? { ...r, category: bulkCategoryTarget } : r));
    showNotification(`Moved ${selectedRuleIds.length} rules to ${bulkCategoryTarget}`);
  };

  // Ignore List Operations
  const handleAddIgnoreTerm = () => {
    if (!newIgnoreInput.trim()) return;
    const term = newIgnoreInput.trim();
    const newIgnore: IgnoreTerm = {
      id: `ignore-${Date.now()}`,
      term,
      enabled: true,
      scope: 'global',
      createdAt: Date.now()
    };
    setIgnoreTerms(prev => [newIgnore, ...prev]);
    setNewIgnoreInput('');
    showNotification(`Added "${term}" to Ignore List`);
  };

  const handleDeleteIgnoreTerm = (id: string) => {
    setIgnoreTerms(prev => prev.filter(i => i.id !== id));
    showNotification('Removed term from Ignore List', 'info');
  };

  // Live Tested Output
  const liveTestedOutput = useMemo(() => {
    try {
      return testTerminologyPreview(sampleTesterText || '', safeRules, safeIgnoreTerms, currentBookTitle || '');
    } catch (e) {
      console.error('Error in live testing output:', e);
      return sampleTesterText || '';
    }
  }, [sampleTesterText, safeRules, safeIgnoreTerms, currentBookTitle]);

  // Total Replacement Stats calculation
  const totalMatchesApplied = useMemo(() => {
    return safeRules.reduce((acc, r) => acc + (r && typeof r.matchCount === 'number' ? r.matchCount : 0), 0);
  }, [safeRules]);

  if (!isOpen) return null;

  return (
    <div 
      id="terminology-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        id="terminology-modal-dialog"
        className="w-full max-w-5xl h-[90vh] max-h-[850px] bg-[#16181D] border border-white/15 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 select-none animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER BAR */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between flex-shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-[#FF79B0]/20 text-[#FF79B0] border border-[#FF79B0]/30 shadow-sm flex-shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-serif font-bold text-lg sm:text-xl text-white truncate">Terminology Manager</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF79B0]/20 text-[#FF79B0] font-mono border border-[#FF79B0]/30 font-extrabold uppercase">
                  Global & Per-Novel
                </span>
              </div>
              <p className="text-xs text-white/50 truncate">Auto-replace terms across all chapters dynamically without editing source text</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Master Toggle */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
              <span className="text-xs font-bold text-white hidden sm:inline">Terminology Engine</span>
              <button
                type="button"
                onClick={() => setIsTerminologyEnabled(!isTerminologyEnabled)}
                className={`w-11 h-6 rounded-full transition-all duration-200 relative flex items-center p-0.5 cursor-pointer ${
                  isTerminologyEnabled ? 'bg-[#FF79B0]' : 'bg-white/20'
                }`}
                title={isTerminologyEnabled ? "Disable Terminology Engine" : "Enable Terminology Engine"}
              >
                <div className={`w-5 h-5 rounded-full bg-slate-900 shadow-md transition-transform duration-200 ${
                  isTerminologyEnabled ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            <button 
              onClick={onClose}
              className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-white/80 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TABS & TOOLS BAR */}
        <div className="px-4 sm:px-6 py-3 border-b border-white/10 bg-white/[0.01] flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          {/* Main Navigation Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5">
            <button
              onClick={() => setActiveTab('rules')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'rules' 
                  ? 'bg-[#FF79B0] text-slate-950 shadow-md font-extrabold' 
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Replacement Rules ({rules.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('ignore')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'ignore' 
                  ? 'bg-[#FF79B0] text-slate-950 shadow-md font-extrabold' 
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Ignore List ({ignoreTerms.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'preview' 
                  ? 'bg-[#FF79B0] text-slate-950 shadow-md font-extrabold' 
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Live Tester</span>
            </button>

            <button
              onClick={() => setActiveTab('stats')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'stats' 
                  ? 'bg-[#FF79B0] text-slate-950 shadow-md font-extrabold' 
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Statistics</span>
            </button>

            <button
              onClick={() => setActiveTab('cleaner')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'cleaner' 
                  ? 'bg-[#FF79B0] text-slate-950 shadow-md font-extrabold' 
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>Line Cleaner {(safeCleanerRules.length > 0) ? `(${safeCleanerRules.length})` : ''}</span>
            </button>
          </div>

          {/* Action Buttons: Add, Import, Export */}
          <div className="flex items-center gap-2 ml-auto">
            <label className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95">
              <Upload className="w-3.5 h-3.5 text-[#FF79B0]" />
              <span className="hidden sm:inline">Import</span>
              <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
            </label>

            <button
              onClick={handleExportJSON}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
            >
              <Download className="w-3.5 h-3.5 text-[#FF79B0]" />
              <span className="hidden sm:inline">Export</span>
            </button>

            <button
              onClick={handleOpenAddForm}
              className="px-3.5 py-1.5 rounded-xl bg-[#FF79B0] hover:bg-[#FF79B0]/90 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all shadow-md active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add Rule</span>
            </button>
          </div>
        </div>

        {/* BODY CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">

          {/* TAB 1: RULES MANAGEMENT */}
          {activeTab === 'rules' && (
            <div className="space-y-4">
              {/* FILTERS & SEARCH CONTROLS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 p-3 rounded-2xl bg-white/5 border border-white/10 text-xs">
                {/* Search Bar */}
                <div className="relative flex items-center col-span-1 sm:col-span-2 lg:col-span-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 text-white/40 pointer-events-none" />
                  <input 
                    type="text"
                    placeholder="Search terms or categories..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-7 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder-white/40 focus:outline-none focus:border-[#FF79B0] focus:ring-1 focus:ring-[#FF79B0]/30 transition-all"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-2 p-1 text-white/40 hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Scope Filter */}
                <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/10">
                  <button 
                    onClick={() => setScopeFilter('all')}
                    className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      scopeFilter === 'all' ? 'bg-[#FF79B0] text-slate-950' : 'text-white/70 hover:text-white'
                    }`}
                  >
                    All Scopes
                  </button>
                  <button 
                    onClick={() => setScopeFilter('global')}
                    className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      scopeFilter === 'global' ? 'bg-[#FF79B0] text-slate-950' : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Global
                  </button>
                  <button 
                    onClick={() => setScopeFilter('novel')}
                    className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      scopeFilter === 'novel' ? 'bg-[#FF79B0] text-slate-950' : 'text-white/70 hover:text-white'
                    }`}
                  >
                    This Novel
                  </button>
                </div>

                {/* Category Filter */}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="py-2 px-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#FF79B0] cursor-pointer"
                >
                  <option value="all" className="bg-[#16181D]">All Categories</option>
                  {TERMINOLOGY_CATEGORIES.map(cat => (
                    <option key={cat} value={cat} className="bg-[#16181D]">{cat}</option>
                  ))}
                </select>

                {/* Sorting */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="py-2 px-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#FF79B0] cursor-pointer"
                >
                  <option value="recent" className="bg-[#16181D]">Sort: Recently Added</option>
                  <option value="alpha" className="bg-[#16181D]">Sort: Alphabetical (A-Z)</option>
                  <option value="matches" className="bg-[#16181D]">Sort: Most Matched</option>
                </select>
              </div>

              {/* BULK ACTIONS TOOLBAR */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10 text-xs flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleSelectAll}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white flex items-center gap-1.5 font-bold cursor-pointer transition-all"
                  >
                    {selectedRuleIds.length > 0 && selectedRuleIds.length === filteredRules.length ? (
                      <CheckSquare className="w-4 h-4 text-[#FF79B0]" />
                    ) : (
                      <Square className="w-4 h-4 opacity-50" />
                    )}
                    <span>Select All ({filteredRules.length})</span>
                  </button>

                  {selectedRuleIds.length > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#FF79B0]/20 text-[#FF79B0] font-mono text-[11px] font-bold border border-[#FF79B0]/30">
                      {selectedRuleIds.length} Selected
                    </span>
                  )}
                </div>

                {selectedRuleIds.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => handleBulkEnable(true)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 font-bold border border-emerald-500/30 cursor-pointer"
                    >
                      Enable
                    </button>
                    <button
                      onClick={() => handleBulkEnable(false)}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 font-bold border border-amber-500/30 cursor-pointer"
                    >
                      Disable
                    </button>

                    <div className="flex items-center gap-1">
                      <select
                        value={bulkCategoryTarget}
                        onChange={(e) => setBulkCategoryTarget(e.target.value as TermCategory)}
                        className="py-1 px-2 rounded-lg bg-white/10 border border-white/15 text-white text-[11px]"
                      >
                        {TERMINOLOGY_CATEGORIES.map(c => (
                          <option key={c} value={c} className="bg-[#16181D]">{c}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleBulkMoveCategory}
                        className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold cursor-pointer"
                      >
                        Move
                      </button>
                    </div>

                    <button
                      onClick={handleBulkDelete}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 font-bold border border-rose-500/30 cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {/* CATEGORIES ACCORDIONS & RULE LIST */}
              {filteredRules.length === 0 ? (
                <div className="text-center py-16 px-4 bg-white/5 rounded-2xl border border-white/10 space-y-3">
                  <div className="p-3 rounded-2xl bg-[#FF79B0]/20 text-[#FF79B0] w-fit mx-auto border border-[#FF79B0]/30">
                    <Sliders className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-white">No Terminology Rules Found</h3>
                  <p className="text-xs text-white/50 max-w-md mx-auto">
                    {searchQuery ? `No rules match "${searchQuery}". Try clearing search filters.` : 'Add your first translation replacement rule to auto-correct character names, place names, or skills.'}
                  </p>
                  <button
                    onClick={handleOpenAddForm}
                    className="px-4 py-2 rounded-xl bg-[#FF79B0] text-slate-950 font-extrabold text-xs shadow-md cursor-pointer hover:bg-[#FF79B0]/90 transition-all"
                  >
                    + Create First Term Rule
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {TERMINOLOGY_CATEGORIES.map(category => {
                    const categoryRules = groupedRules[category];
                    if (!categoryRules || categoryRules.length === 0) return null;

                    const isCollapsed = collapsedCategories[category];

                    return (
                      <div key={category} className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                        {/* Category Accordion Header */}
                        <div 
                          onClick={() => toggleCategoryCollapse(category)}
                          className="p-3.5 bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-between cursor-pointer border-b border-white/10 transition-all select-none"
                        >
                          <div className="flex items-center gap-2.5">
                            {isCollapsed ? <ChevronRight className="w-4 h-4 text-[#FF79B0]" /> : <ChevronDown className="w-4 h-4 text-[#FF79B0]" />}
                            <span className="font-serif font-bold text-sm text-white">{category}</span>
                            <span className="px-2 py-0.5 rounded-full bg-[#FF79B0]/20 text-[#FF79B0] text-[10px] font-mono font-extrabold border border-[#FF79B0]/30">
                              {categoryRules.length}
                            </span>
                          </div>

                          <span className="text-[10px] text-white/40 uppercase font-bold tracking-wider">
                            {isCollapsed ? 'Click to expand' : 'Click to collapse'}
                          </span>
                        </div>

                        {/* Category Rules List */}
                        {!isCollapsed && (
                          <div className="p-2 sm:p-3 space-y-2">
                            {categoryRules.map(rule => {
                              const isChecked = selectedRuleIds.includes(rule.id);
                              return (
                                <div 
                                  key={rule.id}
                                  className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                                    rule.enabled 
                                      ? 'bg-white/[0.02] border-white/10 hover:border-white/20' 
                                      : 'bg-black/20 border-white/5 opacity-60'
                                  }`}
                                >
                                  {/* Left: Checkbox + Target Terms */}
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <button 
                                      onClick={() => handleToggleSelectRule(rule.id)}
                                      className="p-1 text-white/50 hover:text-white cursor-pointer flex-shrink-0"
                                    >
                                      {isChecked ? <CheckSquare className="w-4 h-4 text-[#FF79B0]" /> : <Square className="w-4 h-4" />}
                                    </button>

                                    {/* Enable / Disable Toggle */}
                                    <button
                                      onClick={() => handleToggleRuleStatus(rule.id)}
                                      className={`w-8 h-4.5 rounded-full relative p-0.5 transition-all flex-shrink-0 cursor-pointer ${
                                        rule.enabled ? 'bg-emerald-500' : 'bg-white/20'
                                      }`}
                                      title={rule.enabled ? "Rule Enabled" : "Rule Disabled"}
                                    >
                                      <div className={`w-3.5 h-3.5 rounded-full bg-slate-900 shadow transition-transform ${
                                        rule.enabled ? 'translate-x-3.5' : 'translate-x-0'
                                      }`} />
                                    </button>

                                    {/* Original -> Replacement */}
                                    <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                                      <span className="font-mono text-xs font-bold text-white bg-white/5 px-2.5 py-1 rounded-lg border border-white/10 truncate max-w-[180px]">
                                        {rule.original}
                                      </span>
                                      <ArrowRight className="w-3.5 h-3.5 text-[#FF79B0] flex-shrink-0" />
                                      <span className="font-mono text-xs font-bold text-[#FF79B0] bg-[#FF79B0]/10 px-2.5 py-1 rounded-lg border border-[#FF79B0]/30 truncate max-w-[180px]">
                                        {rule.replacement}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Right: Badges & Actions */}
                                  <div className="flex items-center gap-2 flex-wrap ml-7 sm:ml-0 flex-shrink-0">
                                    {/* Scope badge */}
                                    {rule.scope === 'global' ? (
                                      <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-bold border border-blue-500/30 flex items-center gap-1">
                                        <Globe className="w-3 h-3" /> Global
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30 flex items-center gap-1">
                                        <Book className="w-3 h-3" /> Novel Only
                                      </span>
                                    )}

                                    {/* Options flags */}
                                    <span className="px-2 py-0.5 rounded bg-white/5 text-white/60 text-[10px] font-mono border border-white/10">
                                      {rule.isCaseAware ? 'Case-Aware' : 'Exact Case'}
                                    </span>

                                    {/* Matches count */}
                                    <span className="px-2 py-0.5 rounded bg-white/5 text-white/50 text-[10px] font-mono border border-white/10">
                                      {rule.matchCount} matches
                                    </span>

                                    {/* Edit, Duplicate, Delete Actions */}
                                    <div className="flex items-center gap-1 border-l border-white/10 pl-2">
                                      <button 
                                        onClick={() => handleOpenEditForm(rule)}
                                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-all cursor-pointer"
                                        title="Edit Rule"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      <button 
                                        onClick={() => handleDuplicateRule(rule)}
                                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-all cursor-pointer"
                                        title="Duplicate Rule"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                      </button>
                                      <button 
                                        onClick={() => handleDeleteRule(rule.id)}
                                        className="p-1.5 rounded-lg hover:bg-rose-500/20 text-rose-300 transition-all cursor-pointer"
                                        title="Delete Rule"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: IGNORE LIST MANAGEMENT */}
          {activeTab === 'ignore' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#FF79B0] uppercase tracking-wider">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Protected Terms (Ignore List)</span>
                </div>
                <p className="text-xs text-white/60 leading-relaxed">
                  Words added here will <strong className="text-white">NEVER</strong> be modified by any terminology replacement rules, protecting specific names or phrases from accidental changes.
                </p>

                {/* Add Input */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Enter word/phrase to protect e.g. Luther..."
                    value={newIgnoreInput}
                    onChange={(e) => setNewIgnoreInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddIgnoreTerm()}
                    className="flex-1 px-3.5 py-2 rounded-xl bg-white/5 border border-white/15 text-white text-xs placeholder-white/40 focus:outline-none focus:border-[#FF79B0]"
                  />
                  <button
                    onClick={handleAddIgnoreTerm}
                    className="px-4 py-2 rounded-xl bg-[#FF79B0] text-slate-950 text-xs font-extrabold shadow-sm hover:bg-[#FF79B0]/90 transition-all cursor-pointer"
                  >
                    Protect Word
                  </button>
                </div>
              </div>

              {/* List of Protected Terms */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {ignoreTerms.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-xs text-white/40">
                    No protected terms in ignore list.
                  </div>
                ) : (
                  ignoreTerms.map(item => (
                    <div 
                      key={item.id}
                      className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ShieldAlert className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        <span className="font-mono text-xs font-bold text-white truncate">{item.term}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteIgnoreTerm(item.id)}
                        className="p-1 rounded bg-white/5 hover:bg-rose-500/20 text-white/50 hover:text-rose-300 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: LIVE TESTER / PREVIEW */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#FF79B0] uppercase tracking-wider">
                    <Sparkles className="w-4 h-4" />
                    <span>Live Replacement Tester</span>
                  </div>
                  <span className="text-[10px] text-white/40">Type sample text to test terminology rules</span>
                </div>

                <textarea
                  rows={3}
                  value={sampleTesterText}
                  onChange={(e) => setSampleTesterText(e.target.value)}
                  className="w-full p-3 rounded-xl bg-white/5 border border-white/15 text-white text-xs font-serif leading-relaxed focus:outline-none focus:border-[#FF79B0] focus:ring-1 focus:ring-[#FF79B0]/30"
                  placeholder="Type or paste sample chapter text here..."
                />
              </div>

              {/* Transformed Output Preview Card */}
              <div className="p-4 rounded-2xl bg-[#FF79B0]/10 border border-[#FF79B0]/30 space-y-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#FF79B0] block">
                  Transformed Output Preview
                </span>
                <p className="font-serif text-sm text-white leading-relaxed p-3 bg-slate-950/60 rounded-xl border border-white/10 select-text">
                  {liveTestedOutput || <span className="italic text-white/30">No output</span>}
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: STATISTICS */}
          {activeTab === 'stats' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                <span className="text-xs text-white/50 uppercase tracking-wider block font-bold">Total Active Rules</span>
                <span className="text-2xl font-bold font-serif text-[#FF79B0]">{safeRules.filter(r => r?.enabled).length}</span>
                <span className="text-[10px] text-white/40 block">out of {safeRules.length} total defined</span>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                <span className="text-xs text-white/50 uppercase tracking-wider block font-bold">Replacements Applied</span>
                <span className="text-2xl font-bold font-serif text-emerald-400">{totalMatchesApplied}</span>
                <span className="text-[10px] text-white/40 block">tracked matches in reader</span>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                <span className="text-xs text-white/50 uppercase tracking-wider block font-bold">Protected Terms</span>
                <span className="text-2xl font-bold font-serif text-blue-400">{safeIgnoreTerms.length}</span>
                <span className="text-[10px] text-white/40 block">in ignore list</span>
              </div>

              {/* Most Frequently Replaced Terms */}
              <div className="md:col-span-3 p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-[#FF79B0]">Most Frequently Replaced Terms</h4>
                <div className="space-y-2">
                  {[...safeRules].sort((a, b) => (b?.matchCount || 0) - (a?.matchCount || 0)).slice(0, 5).map(r => (
                    <div key={r.id} className="p-2.5 rounded-xl bg-white/5 flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-white">{r.original} → {r.replacement}</span>
                      <span className="px-2 py-0.5 rounded-full bg-[#FF79B0]/20 text-[#FF79B0] font-mono text-[11px] font-extrabold">
                        {r.matchCount} matches
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: LINE & BOILERPLATE CLEANER */}
          {activeTab === 'cleaner' && (
            <div className="space-y-6">
              {/* Top Quick Scrub Box */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/15 shadow-xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-[#FF79B0]/20 text-[#FF79B0] border border-[#FF79B0]/30">
                      <Eraser className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white font-serif">Remove Repetitive Lines & Disclaimers</h3>
                      <p className="text-[11px] text-white/50">
                        Paste boilerplate ads, error reporting notes, or watermarks to scrub them from all chapters.
                      </p>
                    </div>
                  </div>

                  {/* Advanced Multi-step Undo & Redo Controls */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleUndoClean}
                      disabled={cleanerUndoStack.length === 0}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                        cleanerUndoStack.length > 0
                          ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40 cursor-pointer active:scale-95'
                          : 'bg-white/5 text-white/25 border-white/10 cursor-not-allowed opacity-50'
                      }`}
                      title={
                        cleanerUndoStack.length > 0
                          ? `Undo: ${cleanerUndoStack[0].label} (${cleanerUndoStack.length} step${cleanerUndoStack.length > 1 ? 's' : ''} available)`
                          : 'No clean actions to undo'
                      }
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Undo</span>
                      {cleanerUndoStack.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/30 text-amber-200 font-mono font-bold">
                          {cleanerUndoStack.length}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleRedoClean}
                      disabled={cleanerRedoStack.length === 0}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                        cleanerRedoStack.length > 0
                          ? 'bg-[#FF79B0]/20 hover:bg-[#FF79B0]/30 text-[#FF79B0] border-[#FF79B0]/40 cursor-pointer active:scale-95'
                          : 'bg-white/5 text-white/25 border-white/10 cursor-not-allowed opacity-50'
                      }`}
                      title={
                        cleanerRedoStack.length > 0
                          ? `Redo: ${cleanerRedoStack[0].label} (${cleanerRedoStack.length} step${cleanerRedoStack.length > 1 ? 's' : ''} available)`
                          : 'No clean actions to redo'
                      }
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                      <span>Redo</span>
                      {cleanerRedoStack.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#FF79B0]/30 text-[#FF79B0] font-mono font-bold">
                          {cleanerRedoStack.length}
                        </span>
                      )}
                    </button>

                    {(cleanerUndoStack.length > 0 || cleanerRedoStack.length > 0) && (
                      <button
                        type="button"
                        onClick={() => setIsHistoryDrawerOpen(!isHistoryDrawerOpen)}
                        className={`p-1.5 rounded-xl border text-xs transition-all cursor-pointer ${
                          isHistoryDrawerOpen
                            ? 'bg-white/15 text-white border-white/30 shadow-sm'
                            : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border-white/10'
                        }`}
                        title="View Clean History stack"
                        aria-label="View Clean History stack"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable History Timeline Drawer */}
                {isHistoryDrawerOpen && (cleanerUndoStack.length > 0 || cleanerRedoStack.length > 0) && (
                  <div className="p-3.5 rounded-xl bg-black/60 border border-white/10 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150 shadow-lg">
                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-white/70">
                      <span className="flex items-center gap-1.5 text-[#FF79B0]">
                        <History className="w-4 h-4" />
                        <span>Line Cleaner History Stack</span>
                      </span>
                      <span className="text-[10px] font-mono text-white/40">
                        {cleanerUndoStack.length} undo{cleanerUndoStack.length !== 1 ? 's' : ''} • {cleanerRedoStack.length} redo{cleanerRedoStack.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="max-h-44 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                      {cleanerUndoStack.map((item, idx) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/5 text-xs hover:bg-white/[0.05] transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0">
                              {idx + 1}
                            </span>
                            <span className="truncate text-white/90 font-medium">{item.label}</span>
                          </div>
                          <span className="text-[10px] font-mono text-white/40 flex-shrink-0 ml-2">
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom Quick Presets Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-[#FF79B0]" />
                      <span className="text-[11px] uppercase font-mono font-bold text-white/70 tracking-wider">
                        Quick Presets
                      </span>
                      {customPresets.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#FF79B0]/20 text-[#FF79B0] font-mono font-bold border border-[#FF79B0]/30">
                          {customPresets.length}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {cleanerInput.trim() && !isAddPresetOpen && (
                        <button
                          type="button"
                          onClick={handleOpenAddPreset}
                          className="px-2.5 py-1 rounded-lg bg-[#FF79B0]/15 hover:bg-[#FF79B0]/25 text-[#FF79B0] border border-[#FF79B0]/30 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm active:scale-95"
                          title="Save current text as a quick preset"
                        >
                          <BookmarkPlus className="w-3 h-3" />
                          <span>Save as Preset</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (isAddPresetOpen) {
                            setIsAddPresetOpen(false);
                          } else {
                            handleOpenAddPreset();
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95 ${
                          isAddPresetOpen
                            ? 'bg-white/10 text-white border-white/20'
                            : 'bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border-white/10'
                        }`}
                        title={isAddPresetOpen ? "Close preset creator" : "Create new custom preset"}
                      >
                        {isAddPresetOpen ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3 text-[#FF79B0]" />}
                        <span>{isAddPresetOpen ? 'Cancel' : '+ Add Preset'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Quick Presets Pills Container */}
                  <div className="flex flex-wrap items-center gap-1.5 min-h-[32px]">
                    {customPresets.length === 0 && !isAddPresetOpen ? (
                      <div className="w-full py-2.5 px-3 rounded-xl bg-white/[0.02] border border-dashed border-white/10 text-white/40 text-xs flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <BookmarkPlus className="w-3.5 h-3.5 text-[#FF79B0]/70 flex-shrink-0" />
                          <span>No quick presets yet. Add repetitive phrases to quickly remove them in one click!</span>
                        </span>
                        <button
                          type="button"
                          onClick={handleOpenAddPreset}
                          className="px-2.5 py-1 rounded-lg bg-[#FF79B0]/20 hover:bg-[#FF79B0]/30 text-[#FF79B0] text-[10px] font-bold border border-[#FF79B0]/30 cursor-pointer transition-all flex items-center gap-1 flex-shrink-0"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Create Preset</span>
                        </button>
                      </div>
                    ) : (
                      customPresets.map((preset, idx) => {
                        const isCurrentlyLoaded = cleanerInput === preset.pattern && cleanerMode === preset.mode;
                        return (
                          <div
                            key={preset.id || idx}
                            className={`group relative flex items-center rounded-xl border text-[11px] font-medium transition-all ${
                              isCurrentlyLoaded
                                ? 'bg-[#FF79B0]/20 border-[#FF79B0]/60 text-white shadow-sm ring-1 ring-[#FF79B0]/30'
                                : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80 hover:text-white hover:border-white/20'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleApplyPreset(preset)}
                              className="py-1 pl-2.5 pr-1.5 flex items-center gap-1.5 cursor-pointer max-w-[220px]"
                              title={`Click to load: "${preset.pattern}" (${preset.mode})`}
                            >
                              <Zap className={`w-3 h-3 flex-shrink-0 ${isCurrentlyLoaded ? 'text-[#FF79B0]' : 'text-[#FF79B0]/70'}`} />
                              <span className="truncate">{preset.title}</span>
                              <span className="text-[9px] px-1 py-0.2 rounded bg-black/40 text-white/50 font-mono flex-shrink-0">
                                {preset.mode === 'contains' ? 'phrase' : preset.mode === 'exact' ? 'exact' : preset.mode === 'inline_strip' ? 'strip' : 'regex'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeletePreset(preset.id || idx, e)}
                              className="p-1 mr-1 rounded-md text-white/30 hover:text-rose-400 hover:bg-rose-500/20 transition-all cursor-pointer"
                              title={`Delete preset "${preset.title}"`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Inline Add Preset Creator Form */}
                  {isAddPresetOpen && (
                    <div className="p-3.5 rounded-xl bg-black/40 border border-[#FF79B0]/35 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150 shadow-lg">
                      <div className="flex items-center justify-between text-xs font-bold text-white">
                        <span className="flex items-center gap-1.5 text-[#FF79B0]">
                          <BookmarkPlus className="w-4 h-4" />
                          <span>Create Custom Quick Preset</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsAddPresetOpen(false)}
                          className="p-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-white/50 tracking-wider">
                            Preset Name
                          </label>
                          <input
                            type="text"
                            value={presetTitleInput}
                            onChange={(e) => setPresetTitleInput(e.target.value)}
                            placeholder="e.g. Patreon Plug, Translator Note, Watermark"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/15 text-white text-xs placeholder-white/30 focus:outline-none focus:border-[#FF79B0]"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold uppercase text-white/50 tracking-wider">
                              Match Mode
                            </label>
                            <button
                              type="button"
                              onClick={() => setIsMatchModeHelpOpen(true)}
                              className="w-4 h-4 rounded-full bg-white/10 hover:bg-[#FF79B0]/20 text-white/50 hover:text-[#FF79B0] border border-white/15 hover:border-[#FF79B0]/40 flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-90"
                              title="Click for Match Mode examples & guide"
                              aria-label="Click for Match Mode examples & guide"
                            >
                              <HelpCircle className="w-3 h-3" />
                            </button>
                          </div>
                          <select
                            value={presetModeInput}
                            onChange={(e) => setPresetModeInput(e.target.value as CleanerMatchMode)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#16181D] border border-white/15 text-white text-xs focus:outline-none focus:border-[#FF79B0] cursor-pointer"
                          >
                            <option value="contains">Contains Phrase (Removes Whole Line)</option>
                            <option value="exact">Exact Line Match</option>
                            <option value="inline_strip">Inline Strip (Keeps Line, Removes Phrase)</option>
                            <option value="regex">Regular Expression (Regex)</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1 text-xs">
                        <label className="text-[10px] font-bold uppercase text-white/50 tracking-wider">
                          Text / Line to Remove
                        </label>
                        <textarea
                          rows={2}
                          value={presetPatternInput}
                          onChange={(e) => setPresetPatternInput(e.target.value)}
                          placeholder="Type or paste the repetitive text to be removed when this preset is clicked..."
                          className="w-full p-2.5 rounded-lg bg-white/5 border border-white/15 text-white text-xs font-mono placeholder-white/30 focus:outline-none focus:border-[#FF79B0] leading-relaxed custom-scrollbar select-text"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setIsAddPresetOpen(false)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveCustomPreset}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#FF79B0] hover:bg-[#FF79B0]/90 text-slate-950 flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 transition-all"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Save Preset</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input Textarea */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#FF79B0]">
                      Text / Line to Remove
                    </label>
                    {cleanerInput && (
                      <button
                        type="button"
                        onClick={() => setCleanerInput('')}
                        className="text-[10px] text-white/40 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3 h-3" /> Clear Text
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={3}
                    value={cleanerInput}
                    onChange={(e) => setCleanerInput(e.target.value)}
                    placeholder="Paste repetitive line here (e.g. 'If you find any errors (non-standard content, ads redirect, broken links, etc..), Please let us know so we can fix it as soon as possible.')"
                    className="w-full p-3 rounded-xl bg-black/40 border border-white/15 text-white text-xs font-mono leading-relaxed placeholder-white/30 focus:outline-none focus:border-[#FF79B0] focus:ring-1 focus:ring-[#FF79B0]/30 custom-scrollbar select-text"
                  />
                </div>

                {/* Options Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                  {/* Matching Mode */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider block">
                        Match Mode
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsMatchModeHelpOpen(true)}
                        className="w-4 h-4 rounded-full bg-white/10 hover:bg-[#FF79B0]/20 text-white/50 hover:text-[#FF79B0] border border-white/15 hover:border-[#FF79B0]/40 flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-90"
                        title="Click for Match Mode examples & guide"
                        aria-label="Click for Match Mode examples & guide"
                      >
                        <HelpCircle className="w-3 h-3" />
                      </button>
                    </div>
                    <select
                      value={cleanerMode}
                      onChange={(e) => setCleanerMode(e.target.value as CleanerMatchMode)}
                      className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:outline-none focus:border-[#FF79B0] cursor-pointer"
                    >
                      <option value="contains" className="bg-[#16181D]">Contains Phrase (Removes whole line)</option>
                      <option value="exact" className="bg-[#16181D]">Exact Match (Whole line match)</option>
                      <option value="inline_strip" className="bg-[#16181D]">Inline Strip (Only strip phrase inside line)</option>
                      <option value="regex" className="bg-[#16181D]">Regex Expression</option>
                    </select>
                  </div>

                  {/* Clean Scope */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider block">
                      Target Scope
                    </label>
                    <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/15">
                      <button
                        type="button"
                        onClick={() => setCleanerScope('all')}
                        className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          cleanerScope === 'all' ? 'bg-[#FF79B0] text-slate-950' : 'text-white/70 hover:text-white'
                        }`}
                      >
                        All Chapters ({safeChapters.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setCleanerScope('current')}
                        className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          cleanerScope === 'current' ? 'bg-[#FF79B0] text-slate-950' : 'text-white/70 hover:text-white'
                        }`}
                      >
                        Current Chapter
                      </button>
                    </div>
                  </div>

                  {/* Case Sensitive Toggle */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider block">
                      Casing
                    </label>
                    <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/15 cursor-pointer h-[38px]">
                      <input
                        type="checkbox"
                        checked={cleanerCaseSensitive}
                        onChange={(e) => setCleanerCaseSensitive(e.target.checked)}
                        className="accent-[#FF79B0]"
                      />
                      <span className="text-xs text-white/90">Case-Sensitive</span>
                    </label>
                  </div>
                </div>

                {/* Real-time Match Banner & Preview */}
                {cleanerInput.trim() && (
                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 text-xs">
                        {liveScanResult.totalMatchingLines > 0 ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            <span className="text-emerald-300 font-bold">
                              Found <span className="underline font-extrabold">{liveScanResult.totalMatchingLines}</span> matching line{liveScanResult.totalMatchingLines > 1 ? 's' : ''} across <span className="underline font-extrabold">{liveScanResult.matchingChaptersCount}</span> chapter{liveScanResult.matchingChaptersCount > 1 ? 's' : ''}.
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                            <span className="text-amber-300">
                              No matches found in {cleanerScope === 'all' ? 'any chapters' : 'the current chapter'}.
                            </span>
                          </>
                        )}
                      </div>

                      {liveScanResult.totalMatchingLines > 0 && (
                        <button
                          type="button"
                          onClick={() => setIsPreviewMatchesOpen(!isPreviewMatchesOpen)}
                          className="text-[11px] text-[#FF79B0] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <span>{isPreviewMatchesOpen ? 'Hide Matches' : `Preview Matches (${liveScanResult.matchingChaptersCount})`}</span>
                          {isPreviewMatchesOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </button>
                      )}
                    </div>

                    {/* Expandable Preview Snippets */}
                    {isPreviewMatchesOpen && liveScanResult.matchedChapters.length > 0 && (
                      <div className="max-h-48 overflow-y-auto space-y-2 p-2.5 bg-black/40 rounded-xl border border-white/10 custom-scrollbar select-text text-xs">
                        {liveScanResult.matchedChapters.slice(0, 10).map((mc, idx) => (
                          <div key={idx} className="p-2 rounded-lg bg-white/5 border border-white/5 space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-bold text-white/80">
                              <span>{mc.chapterTitle || `Chapter ${mc.chapterNumber}`}</span>
                              <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-mono text-[10px]">
                                {mc.matchedIndices.length} line{mc.matchedIndices.length > 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="space-y-0.5 text-white/60 font-serif italic text-[11px]">
                              {mc.sampleMatches.map((sample, sIdx) => (
                                <p key={sIdx} className="truncate bg-rose-500/10 px-1.5 py-0.5 rounded text-rose-200">
                                  "{sample}"
                                </p>
                              ))}
                            </div>
                          </div>
                        ))}
                        {liveScanResult.matchedChapters.length > 10 && (
                          <p className="text-center text-[10px] text-white/40 italic">
                            + {liveScanResult.matchedChapters.length - 10} more chapters with matching lines
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-white/80">
                      <input
                        type="checkbox"
                        checked={saveAsPersistentRule}
                        onChange={(e) => setSaveAsPersistentRule(e.target.checked)}
                        className="accent-[#FF79B0]"
                      />
                      <span>Save as persistent rule</span>
                    </label>

                    {saveAsPersistentRule && (
                      <select
                        value={cleanerRuleScope}
                        onChange={(e) => setCleanerRuleScope(e.target.value as 'global' | 'novel')}
                        className="px-2 py-1 rounded-lg bg-white/5 border border-white/15 text-white text-[11px] focus:outline-none focus:border-[#FF79B0]"
                      >
                        <option value="global" className="bg-[#16181D]">Global (All Novels)</option>
                        <option value="novel" className="bg-[#16181D]">Novel Only ({currentBookTitle})</option>
                      </select>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleExecuteClean}
                    disabled={!cleanerInput.trim() || isCleaningInProgress}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-[#FF79B0] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-xs font-black shadow-lg flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>
                      {cleanerScope === 'all' 
                        ? `Remove from All Chapters (${safeChapters.length})` 
                        : 'Remove from Current Chapter'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Saved Cleaner Rules Section */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="font-bold text-xs uppercase tracking-wider text-[#FF79B0] flex items-center gap-2">
                      <ListFilter className="w-3.5 h-3.5" />
                      <span>Saved Auto-Cleaner Rules ({safeCleanerRules.length})</span>
                    </h4>
                    <p className="text-[11px] text-white/50">
                      These rules clean chapters and will automatically apply to repetitive junk.
                    </p>
                  </div>

                  {safeCleanerRules.length > 0 && (
                    <button
                      type="button"
                      onClick={handleRunAllSavedCleanerRules}
                      className="px-3.5 py-1.5 rounded-xl bg-[#FF79B0]/20 hover:bg-[#FF79B0]/30 text-[#FF79B0] border border-[#FF79B0]/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Run All Rules on All Chapters</span>
                    </button>
                  )}
                </div>

                {safeCleanerRules.length === 0 ? (
                  <div className="text-center py-8 px-4 rounded-xl bg-white/[0.02] border border-dashed border-white/10 text-white/40 space-y-1">
                    <p className="text-xs font-bold text-white/60">No saved cleaner rules yet</p>
                    <p className="text-[11px]">Paste repetitive text above and check "Save as persistent rule" to build your cleaning dictionary.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {safeCleanerRules.map((rule) => (
                      <div
                        key={rule.id}
                        className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => handleToggleCleanerRule(rule.id)}
                            className={`w-9 h-5 rounded-full transition-all relative flex items-center p-0.5 flex-shrink-0 cursor-pointer ${
                              rule.enabled ? 'bg-[#FF79B0]' : 'bg-white/20'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-full bg-slate-900 shadow-sm transition-transform ${
                              rule.enabled ? 'translate-x-4' : 'translate-x-0'
                            }`} />
                          </button>

                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="font-mono text-xs text-white truncate select-text font-bold">
                              "{rule.pattern}"
                            </p>
                            <div className="flex items-center gap-2 flex-wrap text-[10px]">
                              <span className="px-1.5 py-0.5 rounded bg-white/10 text-white/70 font-mono uppercase font-bold">
                                {rule.mode}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded font-bold ${
                                rule.scope === 'global' ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'
                              }`}>
                                {rule.scope === 'global' ? 'Global' : `Novel: ${rule.bookTitle || currentBookTitle}`}
                              </span>
                              {rule.caseSensitive && (
                                <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">
                                  Case-Sensitive
                                </span>
                              )}
                              <span className="text-white/40">
                                Removed: {rule.removedCount || 0} lines
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setCleanerInput(rule.pattern);
                              setCleanerMode(rule.mode);
                              setCleanerCaseSensitive(rule.caseSensitive);
                            }}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition-all cursor-pointer"
                            title="Load into cleaner input"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCleanerRule(rule.id)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 transition-all cursor-pointer"
                            title="Delete rule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* ADD / EDIT RULE MODAL / DRAWER OVERLAY */}
        {isFormOpen && (
          <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <form 
              onSubmit={handleSaveRule}
              className="w-full max-w-lg rounded-2xl bg-[#16181D] border border-white/20 p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 text-slate-100"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <h3 className="font-bold text-base font-serif text-white">
                  {editingRuleId ? 'Edit Terminology Rule' : 'Add New Terminology Rule'}
                </h3>
                <button type="button" onClick={() => setIsFormOpen(false)} className="p-1 rounded-full hover:bg-white/10">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Original Term */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-[#FF79B0] uppercase tracking-wider block">Original Term</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Lune"
                    value={formOriginal}
                    onChange={(e) => setFormOriginal(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:outline-none focus:border-[#FF79B0]"
                  />
                </div>

                {/* Replacement Term */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-[#FF79B0] uppercase tracking-wider block">Preferred Replacement</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rune"
                    value={formReplacement}
                    onChange={(e) => setFormReplacement(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:outline-none focus:border-[#FF79B0]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Category */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-white/70 uppercase tracking-wider block">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as TermCategory)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:outline-none focus:border-[#FF79B0] cursor-pointer"
                  >
                    {TERMINOLOGY_CATEGORIES.map(c => (
                      <option key={c} value={c} className="bg-[#16181D]">{c}</option>
                    ))}
                  </select>
                </div>

                {/* Scope */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-white/70 uppercase tracking-wider block">Rule Scope</label>
                  <select
                    value={formScope}
                    onChange={(e) => setFormScope(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-white text-xs focus:outline-none focus:border-[#FF79B0] cursor-pointer"
                  >
                    <option value="global" className="bg-[#16181D]">Global (All Novels)</option>
                    <option value="novel" className="bg-[#16181D]">Novel Only ({currentBookTitle})</option>
                  </select>
                </div>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsCaseAware}
                    onChange={(e) => setFormIsCaseAware(e.target.checked)}
                    className="accent-[#FF79B0]"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">Case-Aware</span>
                    <span className="text-[10px] text-white/40 block">Preserves case (Rune, rune, RUNE)</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formWholeWord}
                    onChange={(e) => setFormWholeWord(e.target.checked)}
                    className="accent-[#FF79B0]"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">Whole Word</span>
                    <span className="text-[10px] text-white/40 block">Prevents partial matching inside words</span>
                  </div>
                </label>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#FF79B0] hover:bg-[#FF79B0]/90 text-slate-950 text-xs font-extrabold shadow-md cursor-pointer"
                >
                  {editingRuleId ? 'Update Rule' : 'Save Rule'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Match Mode Examples & Guide Dialog */}
        {isMatchModeHelpOpen && (
          <div 
            className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
            onClick={() => setIsMatchModeHelpOpen(false)}
          >
            <div 
              className="bg-[#181B21] border border-white/15 rounded-2xl max-w-xl w-full p-4 sm:p-5 shadow-2xl space-y-3.5 max-h-[90vh] overflow-y-auto custom-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Dialog Header */}
              <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#FF79B0]/20 border border-[#FF79B0]/30 flex items-center justify-center text-[#FF79B0]">
                    <HelpCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Match Mode Guide & Examples
                    </h3>
                    <p className="text-[11px] text-white/50">
                      Choose how text is detected and removed from chapters.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMatchModeHelpOpen(false)}
                  className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Guide Cards */}
              <div className="space-y-3 text-xs">
                
                {/* 1. Contains Phrase */}
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">1. Contains Phrase</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-mono font-bold border border-rose-500/30">
                      Removes whole line
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/60 border border-white/5 font-mono text-[11px] space-y-2">
                    <div>
                      <span className="text-white/40">Rule Text: </span>
                      <span className="text-[#FF79B0] font-bold">patreon.com</span>
                    </div>
                    <div className="space-y-1 pt-1.5 border-t border-white/5">
                      <div className="text-white/40 text-[10px] uppercase font-bold">Original Chapter Text:</div>
                      <div className="text-white/80 pl-2 border-l-2 border-white/20 text-[10.5px] space-y-0.5">
                        <div>"He drew his sword and stepped into the dungeon."</div>
                        <div className="text-rose-300/80">"Support the translation team on <span className="text-[#FF79B0] underline font-bold">patreon.com</span>/novelteam to read 10 chapters ahead!"</div>
                      </div>
                    </div>
                    <div className="space-y-1 pt-1 border-t border-white/5">
                      <div className="text-emerald-400 text-[10px] uppercase font-bold">Result After Cleaning:</div>
                      <div className="text-white/90 pl-2 border-l-2 border-emerald-500/40 text-[10.5px]">
                        <div>"He drew his sword and stepped into the dungeon."</div>
                        <div className="text-emerald-400/80 italic text-[10px]">↳ (The entire second line is erased)</div>
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-white/50">
                    <strong className="text-white/70">Best used for:</strong> Entire promotional sentences, sponsor links, or translator notes.
                  </div>
                </div>

                {/* 2. Exact Match */}
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">2. Exact Match</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold border border-amber-500/30">
                      Whole line match
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/60 border border-white/5 font-mono text-[11px] space-y-2">
                    <div>
                      <span className="text-white/40">Rule Text: </span>
                      <span className="text-[#FF79B0] font-bold">NovelFire</span>
                    </div>
                    <div className="space-y-1 pt-1.5 border-t border-white/5">
                      <div className="text-white/40 text-[10px] uppercase font-bold">Original Chapter Text:</div>
                      <div className="text-white/80 pl-2 border-l-2 border-white/20 text-[10.5px] space-y-0.5">
                        <div className="text-amber-300/90">"<span className="text-[#FF79B0] font-bold">NovelFire</span>"</div>
                        <div>"The magic beast cast a spell called NovelFire and scorched the trees."</div>
                      </div>
                    </div>
                    <div className="space-y-1 pt-1 border-t border-white/5">
                      <div className="text-emerald-400 text-[10px] uppercase font-bold">Result After Cleaning:</div>
                      <div className="text-white/90 pl-2 border-l-2 border-emerald-500/40 text-[10.5px]">
                        <div className="text-emerald-400/80 italic text-[10px]">(Empty watermark line removed)</div>
                        <div>"The magic beast cast a spell called NovelFire and scorched the trees."</div>
                        <div className="text-emerald-400/80 italic text-[10px]">↳ (Story dialogue is safely preserved!)</div>
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-white/50">
                    <strong className="text-white/70">Best used for:</strong> Standalone watermarks or titles without accidentally deleting story text.
                  </div>
                </div>

                {/* 3. Inline Strip */}
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">3. Inline Strip</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono font-bold border border-blue-500/30">
                      Strip phrase inside line
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/60 border border-white/5 font-mono text-[11px] space-y-2">
                    <div>
                      <span className="text-white/40">Rule Text: </span>
                      <span className="text-[#FF79B0] font-bold">[novelfire.net]</span>
                    </div>
                    <div className="space-y-1 pt-1.5 border-t border-white/5">
                      <div className="text-white/40 text-[10px] uppercase font-bold">Original Chapter Text:</div>
                      <div className="text-white/80 pl-2 border-l-2 border-white/20 text-[10.5px]">
                        "Ren stepped into the arena <span className="text-[#FF79B0] line-through font-bold">[novelfire.net]</span> and called forth his contracted dragon."
                      </div>
                    </div>
                    <div className="space-y-1 pt-1 border-t border-white/5">
                      <div className="text-emerald-400 text-[10px] uppercase font-bold">Result After Cleaning:</div>
                      <div className="text-white/90 pl-2 border-l-2 border-emerald-500/40 text-[10.5px]">
                        <div>"Ren stepped into the arena and called forth his contracted dragon."</div>
                        <div className="text-emerald-400/80 italic text-[10px]">↳ (Story sentence intact; only watermark cut out)</div>
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-white/50">
                    <strong className="text-white/70">Best used for:</strong> Watermarks or domain stamps injected inside legitimate sentences.
                  </div>
                </div>

                {/* 4. Regex Expression */}
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">4. Regex Expression</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-bold border border-purple-500/30">
                      Pattern matching
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/60 border border-white/5 font-mono text-[11px] space-y-2.5">
                    <div className="space-y-1">
                      <div className="text-white/40">
                        Example A (Word count brackets):
                      </div>
                      <div className="text-white/70 pl-2 border-l-2 border-white/20 text-[10.5px]">
                        Rule Pattern: <span className="text-[#FF79B0] font-bold">{`\\[\\s*\\d+\\s*words\\s*\\]`}</span>
                        <div className="text-emerald-400 pt-0.5">
                          ↳ Matches & deletes: <span className="text-white/90">[ 2450 words ]</span>, <span className="text-white/90">[ 1890 words ]</span>, <span className="text-white/90">[ 3012 words ]</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1 pt-1.5 border-t border-white/5">
                      <div className="text-white/40">
                        Example B (Translator notes in brackets):
                      </div>
                      <div className="text-white/70 pl-2 border-l-2 border-white/20 text-[10.5px]">
                        Rule Pattern: <span className="text-[#FF79B0] font-bold">{`\\[TL Note:.*?\\]`}</span>
                        <div className="text-emerald-400 pt-0.5">
                          ↳ Matches & deletes: <span className="text-white/90">[TL Note: Cultivation ranks are explained in chapter 5]</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-white/50">
                    <strong className="text-white/70">Best used for:</strong> Dynamic text with changing numbers, dates, or symbols.
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsMatchModeHelpOpen(false)}
                  className="px-4 py-1.5 rounded-xl bg-[#FF79B0] hover:bg-[#FF79B0]/90 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer active:scale-95"
                >
                  Got it
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};

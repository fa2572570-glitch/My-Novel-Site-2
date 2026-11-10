import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  BookOpen,
  Search,
  Check,
  CheckSquare,
  DownloadCloud,
  FileAudio,
  Sliders,
  Layers,
  AlertCircle,
  HardDrive,
  ArrowLeft,
  Minimize2
} from 'lucide-react';
import { useOfflineAudio } from '../hooks/useOfflineAudio';

interface ChapterItem {
  id: string;
  number: number;
  title: string;
  content: string[];
}

interface ChapterDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: ChapterItem[];
  currentChapterIndex?: number;
  novelId?: string;
  novelTitle?: string;
  voice?: string;
  pitch?: string;
}

export function ChapterDownloadModal({
  isOpen,
  onClose,
  chapters = [],
  currentChapterIndex = 0,
  novelId = 'novel',
  novelTitle = 'Web Novel',
  voice = 'en-US-SteffanNeural',
  pitch = '+0Hz'
}: ChapterDownloadModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isContinuous, setIsContinuous] = useState(true);
  const [batchSize, setBatchSize] = useState(10);
  const [customBatchInput, setCustomBatchInput] = useState('');

  const isCustomActive = customBatchInput.trim() !== '';

  const {
    downloadProgress,
    downloadContinuousBatches,
    cancelDownload,
    isChapterDownloaded
  } = useOfflineAudio(novelId);

  // Pre-select current chapter on initial open if empty
  useEffect(() => {
    if (isOpen && selectedIds.size === 0 && chapters.length > 0) {
      const cur = chapters[currentChapterIndex] || chapters[0];
      if (cur) {
        setSelectedIds(new Set([cur.id]));
      }
    }
  }, [isOpen]);

  // Filtered chapters based on search query
  const filteredChapters = useMemo(() => {
    if (!searchQuery.trim()) return chapters;
    const q = searchQuery.toLowerCase().trim();
    return chapters.filter(
      c => c.title.toLowerCase().includes(q) || c.number.toString().includes(q)
    );
  }, [chapters, searchQuery]);

  // Selected chapters in original chronological order
  const selectedChapters = useMemo(() => {
    return chapters.filter(c => selectedIds.has(c.id));
  }, [chapters, selectedIds]);

  // Calculate batch count
  const effectiveBatchSize = isContinuous ? Math.max(1, batchSize) : 1;
  const totalBundles = Math.ceil(selectedChapters.length / effectiveBatchSize);

  // Toggle single chapter selection
  const toggleChapter = (id: string) => {
    if (downloadProgress.isDownloading) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select all visible chapters
  const selectAllVisible = () => {
    if (downloadProgress.isDownloading) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      filteredChapters.forEach(c => next.add(c.id));
      return next;
    });
  };

  // Deselect all
  const deselectAll = () => {
    if (downloadProgress.isDownloading) return;
    setSelectedIds(new Set());
  };

  // Start continuous batch download
  const handleStartDownload = async () => {
    if (selectedChapters.length === 0 || downloadProgress.isDownloading) return;

    await downloadContinuousBatches(
      selectedChapters,
      isContinuous ? effectiveBatchSize : 1,
      {
        voice,
        pitch,
        bundleTitle: novelTitle
      }
    );
  };

  if (!isOpen) return null;

  const estSizeMB = (selectedChapters.length * 1.5).toFixed(1);

  return (
    <div
      id="chapter-download-backdrop"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-8 sm:pt-12 px-3 sm:px-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="chapter-download-dialog"
        className="w-full max-w-lg rounded-2xl border shadow-2xl p-4 sm:p-5 space-y-4 text-slate-100 bg-[#16181D] border-white/15 animate-in zoom-in-95 duration-200 select-none max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#FF79B0]/20 text-[#FF79B0]">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white font-serif">Download Chapters</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Close / Back button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-all cursor-pointer"
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* CONTINUOUS DOWNLOAD CARD */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-white/5 border border-white/10 space-y-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#FF79B0]" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Continuous Multi-Chapter MP4
              </span>
            </div>
            <button
              type="button"
              disabled={downloadProgress.isDownloading}
              onClick={() => setIsContinuous(!isContinuous)}
              className={`w-11 h-6 rounded-full transition-all relative flex items-center p-1 cursor-pointer disabled:opacity-40 ${
                isContinuous ? 'bg-[#FF79B0]' : 'bg-white/20'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-slate-950 shadow-md transition-transform duration-200 ${
                  isContinuous ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {isContinuous ? (
            <div className="pt-2 border-t border-white/5">
              <div className="grid grid-cols-4 gap-2 w-full">
                {[5, 10, 20].map(size => (
                  <button
                    key={size}
                    type="button"
                    disabled={downloadProgress.isDownloading}
                    onClick={() => {
                      setBatchSize(size);
                      setCustomBatchInput('');
                    }}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer flex items-center justify-center ${
                      !isCustomActive && batchSize === size
                        ? 'bg-[#FF79B0] text-slate-950 border-[#FF79B0] shadow-sm font-extrabold'
                        : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {size}
                  </button>
                ))}
                <div className="relative w-full">
                  <input
                    type="number"
                    min="1"
                    max={chapters.length || 100}
                    disabled={downloadProgress.isDownloading}
                    value={customBatchInput}
                    placeholder="Custom"
                    onChange={e => {
                      const inputVal = e.target.value;
                      setCustomBatchInput(inputVal);
                      const val = parseInt(inputVal, 10);
                      if (!isNaN(val) && val >= 1) {
                        setBatchSize(val);
                      }
                    }}
                    className={`w-full h-full py-2 px-2 rounded-xl text-xs font-mono font-bold text-center border transition-all focus:outline-none focus:border-[#FF79B0] ${
                      isCustomActive
                        ? 'bg-[#FF79B0] text-slate-950 border-[#FF79B0] shadow-sm font-extrabold placeholder-slate-950/60'
                        : 'bg-white/5 text-white border-white/10 hover:bg-white/10 focus:bg-white/10 placeholder-white/30'
                    }`}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* SEARCH & SELECTION ACTIONS */}
        <div className="space-y-2 flex-shrink-0">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3.5 text-white/40 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter chapters..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              disabled={downloadProgress.isDownloading}
              className="w-full pl-9 pr-8 py-2.5 rounded-xl text-xs bg-white/5 border border-white/15 text-white placeholder-white/40 focus:outline-none focus:border-[#FF79B0] focus:ring-1 focus:ring-[#FF79B0]/30 transition-all disabled:opacity-50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 p-1 rounded-full bg-white/10 text-white/70 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Quick Selection Buttons */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={downloadProgress.isDownloading || filteredChapters.length === 0}
                onClick={selectAllVisible}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium transition-all active:scale-95 disabled:opacity-40 cursor-pointer flex items-center gap-1.5 text-xs"
              >
                <CheckSquare className="w-3.5 h-3.5 text-[#FF79B0]" />
                <span>Select All ({filteredChapters.length})</span>
              </button>

              <button
                type="button"
                disabled={downloadProgress.isDownloading || selectedIds.size === 0}
                onClick={deselectAll}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all active:scale-95 disabled:opacity-40 cursor-pointer flex items-center justify-center text-xs"
              >
                <span>Deselect All</span>
              </button>
            </div>

            <span className="text-[11px] text-white/40 font-mono">
              {filteredChapters.length} shown
            </span>
          </div>
        </div>

        {/* CHAPTERS LIST - MATCHING USER SCREENSHOT EXACTLY */}
        <div className="flex-1 min-h-[200px] max-h-[42vh] overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
          {filteredChapters.length === 0 ? (
            <div className="py-12 text-center text-white/40 text-xs">
              No chapters match &ldquo;{searchQuery}&rdquo;
            </div>
          ) : (
            filteredChapters.map(chap => {
              const isSelected = selectedIds.has(chap.id);
              const isDownloaded = isChapterDownloaded(chap.id);

              return (
                <div
                  key={chap.id}
                  onClick={() => toggleChapter(chap.id)}
                  className={`w-full text-left p-3 rounded-xl text-xs transition-all flex items-center justify-between cursor-pointer border ${
                    isSelected
                      ? 'bg-[#FF79B0]/15 border-[#FF79B0] text-white shadow-sm ring-1 ring-[#FF79B0]/30'
                      : 'bg-white/5 hover:bg-white/10 border-white/5 text-white/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    {/* Checkbox indicator */}
                    <div
                      className={`w-4.5 h-4.5 rounded-md flex items-center justify-center border transition-all flex-shrink-0 ${
                        isSelected
                          ? 'bg-[#FF79B0] border-[#FF79B0] text-slate-950'
                          : 'border-white/30 bg-white/5 text-transparent'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>

                    {/* Chapter Title matching screenshot: 📖 Chapter X: Title */}
                    <span className="truncate font-medium">
                      📖 Chapter {chap.number}: {chap.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isDownloaded && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Offline Ready
                      </span>
                    )}
                    <span className="text-[10px] text-white/40 font-mono">
                      {chap.content ? chap.content.length : 80} paras
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* BOTTOM ACTION & LIVE DOWNLOAD PROGRESS */}
        <div className="pt-3 border-t border-white/10 flex-shrink-0 space-y-2.5">
          {downloadProgress.error && !downloadProgress.isDownloading && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-0.5">
                <span className="font-bold text-rose-300 block">Download Error</span>
                <p className="text-[11px] text-rose-200/90 break-words">{downloadProgress.error}</p>
              </div>
            </div>
          )}

          {downloadProgress.isDownloading || (downloadProgress.percent === 100 && downloadProgress.statusText) ? (
            <div className={`p-4 rounded-xl space-y-3 animate-in fade-in duration-150 border ${
              downloadProgress.percent === 100
                ? 'bg-emerald-500/10 border-emerald-500/40'
                : 'bg-white/5 border-[#FF79B0]/40'
            }`}>
              {/* Numerical percentage & Chapter Header */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      downloadProgress.percent === 100 ? 'bg-emerald-400' : 'bg-[#FF79B0] animate-ping'
                    }`} />
                    <span className="font-bold text-white text-xs truncate">
                      {downloadProgress.percent === 100
                        ? '✓ Continuous MP4 Download Complete!'
                        : `File ${downloadProgress.currentBatchIndex} of ${downloadProgress.totalBatches}${downloadProgress.batchChapterRange ? ` (${downloadProgress.batchChapterRange})` : ''}`}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/70 truncate pl-4.5">
                    {downloadProgress.statusText || downloadProgress.currentChapterTitle}
                  </p>
                </div>

                {/* Big clear percentage number */}
                <div className="text-right shrink-0">
                  <span className={`font-mono text-xl font-black drop-shadow-sm ${
                    downloadProgress.percent === 100 ? 'text-emerald-400' : 'text-[#FF79B0]'
                  }`}>
                    {downloadProgress.percent}%
                  </span>
                  <span className="block text-[10px] text-white/40 font-mono">
                    Ch. {downloadProgress.currentChapterIndex}/{downloadProgress.totalChapters}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    downloadProgress.percent === 100
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : 'bg-gradient-to-r from-[#FF79B0] via-purple-400 to-[#FF79B0]'
                  }`}
                  style={{ width: `${Math.max(3, downloadProgress.percent)}%` }}
                />
              </div>

              {/* Action Buttons: Return to Reader OR Cancel Download (only if active) */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                  title="Return to reader"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[#FF79B0]" />
                  <span>Back to Reader</span>
                </button>

                {downloadProgress.isDownloading && (
                  <button
                    type="button"
                    onClick={cancelDownload}
                    className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 hover:text-rose-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                    title="Immediately abort the download and stop file creation"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel Download</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-white/60">
                <span>Total: <strong className="text-white">{selectedChapters.length} chapter(s)</strong></span>
                <span className="mx-1.5 text-white/30">·</span>
                <span className="font-mono text-[11px] text-white/40">~{estSizeMB} MB</span>
              </div>

              <button
                type="button"
                disabled={selectedChapters.length === 0}
                onClick={handleStartDownload}
                className="flex-1 sm:flex-initial py-3 px-5 rounded-xl bg-[#FF79B0] hover:bg-[#FF79B0]/90 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 disabled:opacity-40 cursor-pointer ml-auto"
              >
                <DownloadCloud className="w-4 h-4" />
                <span>
                  {isContinuous
                    ? `Download ${totalBundles} Continuous MP4 File${totalBundles === 1 ? '' : 's'}`
                    : `Download ${selectedChapters.length} MP4 Files`}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

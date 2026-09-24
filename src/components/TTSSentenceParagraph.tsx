import React, { useMemo } from 'react';
import { splitParagraphIntoSentences, tokenizeSentenceWords } from '../utils/ttsText';
import { TTSActivePosition } from '../types/tts';

interface TTSSentenceParagraphProps {
  text: string;
  chapterId: string;
  chapterIndex: number;
  paragraphIndex: number; // -1 for title, 0..N for paragraphs
  activeTTSPosition: TTSActivePosition | null;
  isTTSActive: boolean;
  highlightMode?: 'both' | 'sentence' | 'word' | 'none';
  onSentenceClick?: (
    chapterId: string,
    chapterIndex: number,
    paragraphIndex: number,
    sentenceIndex: number,
    sentenceText: string
  ) => void;
  isTitle?: boolean;
}

export const TTSSentenceParagraph = React.memo(function TTSSentenceParagraph({
  text,
  chapterId,
  chapterIndex,
  paragraphIndex,
  activeTTSPosition,
  isTTSActive,
  highlightMode = 'both',
  onSentenceClick,
  isTitle = false
}: TTSSentenceParagraphProps) {
  // Split the paragraph text into sentences
  const sentences = useMemo(() => {
    return splitParagraphIntoSentences(text);
  }, [text]);

  if (sentences.length === 0) {
    return null;
  }

  // Check if any sentence in THIS paragraph is active
  const isThisParagraphActive = 
    activeTTSPosition?.chapterId === chapterId && 
    activeTTSPosition?.paragraphIndex === paragraphIndex;

  const activeSentenceIndex = isThisParagraphActive ? (activeTTSPosition?.sentenceIndex ?? -1) : -1;
  const activeWordIdx = isThisParagraphActive ? (activeTTSPosition?.wordIndex ?? -1) : -1;

  const showSentenceRing = highlightMode === 'both' || highlightMode === 'sentence';
  const showWordHighlight = highlightMode === 'both' || highlightMode === 'word';

  // Build tokenized structure for each sentence in the paragraph
  const sentencesData = useMemo(() => {
    return sentences.map((sText, sIdx) => {
      // If this paragraph is active, tokenize all sentences so physical line tokens can be matched across sentence boundaries
      if (isThisParagraphActive) {
        const tokens = tokenizeSentenceWords(sText);
        return { sText, sIdx, tokens };
      }
      return { sText, sIdx, tokens: null };
    });
  }, [sentences, isThisParagraphActive]);

  const paragraphContainerRef = React.useRef<HTMLSpanElement>(null);
  const [activeLineKeySet, setActiveLineKeySet] = React.useState<Set<string>>(new Set());
  const lastActiveLineKeySetRef = React.useRef<Set<string>>(new Set());

  // Compute the physical line across the entire paragraph!
  React.useLayoutEffect(() => {
    if (!isThisParagraphActive || !showSentenceRing) {
      setActiveLineKeySet(new Set());
      lastActiveLineKeySetRef.current = new Set();
      return;
    }

    const container = paragraphContainerRef.current;
    if (!container) return;

    // Find all rendered token elements in this paragraph
    const tokenEls = Array.from(
      container.querySelectorAll<HTMLElement>('[data-tts-token="true"]')
    );
    if (tokenEls.length === 0) return;

    // Find the currently active word element (or active sentence)
    let targetEl: HTMLElement | null = null;

    if (activeSentenceIndex >= 0 && activeWordIdx >= 0) {
      targetEl = tokenEls.find(
        el =>
          el.getAttribute('data-s-idx') === String(activeSentenceIndex) &&
          el.getAttribute('data-tts-w-idx') === String(activeWordIdx)
      ) || null;
    }

    // Fallback: if activeWordIdx is -1 (end of sentence), retain previous line or pick first word of sentence
    if (!targetEl) {
      if (lastActiveLineKeySetRef.current.size > 0) {
        // Keep the exact line that was playing
        return;
      }
      if (activeSentenceIndex >= 0) {
        targetEl = tokenEls.find(
          el =>
            el.getAttribute('data-s-idx') === String(activeSentenceIndex) &&
            el.hasAttribute('data-tts-w-idx')
        ) || null;
      }
    }

    if (!targetEl) {
      setActiveLineKeySet(new Set());
      return;
    }

    const targetOffsetTop = targetEl.offsetTop;
    const targetOffsetHeight = targetEl.offsetHeight || 20;
    // Generous line clustering threshold to catch all tokens on this exact physical line
    const lineThreshold = Math.max(10, targetOffsetHeight * 0.65);

    const lineKeys = new Set<string>();
    let minElIdx = Infinity;
    let maxElIdx = -1;

    tokenEls.forEach((el, index) => {
      if (Math.abs(el.offsetTop - targetOffsetTop) <= lineThreshold) {
        const tokenKey = el.getAttribute('data-token-key');
        if (tokenKey) {
          lineKeys.add(tokenKey);
          if (index < minElIdx) minElIdx = index;
          if (index > maxElIdx) maxElIdx = index;
        }
      }
    });

    // Make sure all elements between minElIdx and maxElIdx on this line are filled in
    // so there are no tiny gaps from punctuation/quotes/spaces
    if (minElIdx !== Infinity && maxElIdx !== -1) {
      for (let i = minElIdx; i <= maxElIdx; i++) {
        const key = tokenEls[i].getAttribute('data-token-key');
        if (key) {
          lineKeys.add(key);
        }
      }

      // Also include any immediately trailing punctuation or space if it stays on this line
      for (let i = maxElIdx + 1; i < tokenEls.length; i++) {
        const el = tokenEls[i];
        if (Math.abs(el.offsetTop - targetOffsetTop) <= lineThreshold) {
          const key = el.getAttribute('data-token-key');
          if (key) lineKeys.add(key);
        } else {
          break;
        }
      }
    }

    lastActiveLineKeySetRef.current = lineKeys;
    setActiveLineKeySet(lineKeys);
  }, [isThisParagraphActive, activeSentenceIndex, activeWordIdx, showSentenceRing, sentencesData]);

  // Track pointer start to prevent scroll/swipe gestures on mobile from triggering click
  const pointerDownRef = React.useRef<{ x: number; y: number } | null>(null);

  return (
    <span ref={paragraphContainerRef} className="inline">
      {sentencesData.map(({ sText, sIdx, tokens }) => {
        const isSentenceActive = isThisParagraphActive && activeSentenceIndex === sIdx;

        const handlePointerDown = onSentenceClick ? (e: React.PointerEvent) => {
          pointerDownRef.current = { x: e.clientX, y: e.clientY };
        } : undefined;

        const handlePointerUp = onSentenceClick ? (e: React.PointerEvent) => {
          if (pointerDownRef.current) {
            const dx = Math.abs(e.clientX - pointerDownRef.current.x);
            const dy = Math.abs(e.clientY - pointerDownRef.current.y);
            // If pointer moved more than 10px, it was a scroll/drag gesture, not a deliberate sentence tap
            if (dx > 10 || dy > 10) {
              pointerDownRef.current = null;
              return;
            }
          }
          pointerDownRef.current = null;
          e.stopPropagation();
          onSentenceClick(chapterId, chapterIndex, paragraphIndex, sIdx, sText);
        } : undefined;

        const isLastSentence = sIdx === sentences.length - 1;
        const trailingSpace = isLastSentence ? null : ' ';

        // If this paragraph is active, render tokenized spans so physical line highlighting can span across sentence boundaries on the same line
        if (isThisParagraphActive && tokens) {
          return (
            <React.Fragment key={sIdx}>
              <span
                id={`tts-sent-${chapterId}-${paragraphIndex}-${sIdx}`}
                data-tts-active={isSentenceActive ? "true" : undefined}
                data-p-idx={paragraphIndex}
                data-s-idx={sIdx}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                className={`inline select-text ${onSentenceClick ? 'cursor-pointer' : ''}`}
                title={onSentenceClick ? (isSentenceActive ? "Reading position (Click to re-target)" : "Click to start Read Aloud from here") : undefined}
              >
                {tokens.map((tok, tIdx) => {
                  const tokenKey = `${sIdx}-${tIdx}`;
                  const isTokenOnActiveLine = showSentenceRing && activeLineKeySet.has(tokenKey);
                  const isWordHighlighted =
                    isSentenceActive &&
                    showWordHighlight &&
                    isTTSActive &&
                    tok.isWord &&
                    tok.wordIndex === activeWordIdx;

                  let background = 'transparent';
                  let color = 'inherit';

                  if (isWordHighlighted) {
                    background = '#FFFF00';
                    color = '#000000';
                  } else if (isTokenOnActiveLine) {
                    background = '#B2D6F3';
                    color = '#000000';
                  }

                  return (
                    <span
                      key={tIdx}
                      data-tts-token="true"
                      data-s-idx={sIdx}
                      data-token-key={tokenKey}
                      data-t-idx={tIdx}
                      data-tts-w-idx={tok.isWord ? tok.wordIndex : undefined}
                      data-tts-word-active={isWordHighlighted ? "true" : undefined}
                      className="inline select-text box-decoration-clone"
                      style={{
                        backgroundColor: background,
                        color: color,
                        paddingTop: '0px',
                        paddingBottom: '0px',
                        paddingLeft: '0px',
                        paddingRight: '0px',
                        margin: '0px',
                        borderRadius: '0px',
                        transition: 'none',
                      }}
                    >
                      {tok.text}
                    </span>
                  );
                })}
              </span>
              {trailingSpace && (
                <span
                  data-tts-token="true"
                  data-s-idx={sIdx}
                  data-token-key={`${sIdx}-space`}
                  className="inline select-text box-decoration-clone"
                  style={{
                    backgroundColor: (showSentenceRing && activeLineKeySet.has(`${sIdx}-space`)) ? '#B2D6F3' : 'transparent',
                    color: (showSentenceRing && activeLineKeySet.has(`${sIdx}-space`)) ? '#000000' : 'inherit',
                    paddingTop: '0px',
                    paddingBottom: '0px',
                    paddingLeft: '0px',
                    paddingRight: '0px',
                    margin: '0px',
                    borderRadius: '0px',
                    transition: 'none',
                  }}
                >
                  {trailingSpace}
                </span>
              )}
            </React.Fragment>
          );
        }

        // Inactive paragraph: clean, regular appearance with click handler and zero padding shift
        return (
          <React.Fragment key={sIdx}>
            <span
              id={`tts-sent-${chapterId}-${paragraphIndex}-${sIdx}`}
              data-p-idx={paragraphIndex}
              data-s-idx={sIdx}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              className={`inline select-text ${onSentenceClick ? 'hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer' : ''}`}
              style={{
                paddingTop: '0px',
                paddingBottom: '0px',
                paddingLeft: '0',
                paddingRight: '0',
                margin: '0',
              }}
              title={onSentenceClick ? "Click to start Read Aloud from here" : undefined}
            >
              {sText}
            </span>
            {trailingSpace}
          </React.Fragment>
        );
      })}
    </span>
  );
}, (prevProps, nextProps) => {
  // Ultra-fast equality check for React.memo
  if (prevProps.text !== nextProps.text) return false;
  if (prevProps.chapterId !== nextProps.chapterId) return false;
  if (prevProps.paragraphIndex !== nextProps.paragraphIndex) return false;
  if (prevProps.isTTSActive !== nextProps.isTTSActive) return false;
  if (prevProps.highlightMode !== nextProps.highlightMode) return false;
  if (Boolean(prevProps.onSentenceClick) !== Boolean(nextProps.onSentenceClick)) return false;

  // Check if this paragraph was or became active
  const prevActive = prevProps.activeTTSPosition?.chapterId === prevProps.chapterId && 
                     prevProps.activeTTSPosition?.paragraphIndex === prevProps.paragraphIndex;
  const nextActive = nextProps.activeTTSPosition?.chapterId === nextProps.chapterId && 
                     nextProps.activeTTSPosition?.paragraphIndex === nextProps.paragraphIndex;

  if (prevActive !== nextActive) return false;

  if (nextActive) {
    // If it is active, check if active sentence or word changed
    if (prevProps.activeTTSPosition?.sentenceIndex !== nextProps.activeTTSPosition?.sentenceIndex) return false;
    if (prevProps.activeTTSPosition?.wordIndex !== nextProps.activeTTSPosition?.wordIndex) return false;
  }

  return true;
});

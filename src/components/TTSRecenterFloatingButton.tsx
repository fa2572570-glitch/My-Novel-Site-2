import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowUp, ArrowDown, Move } from 'lucide-react';

interface TTSRecenterFloatingButtonProps {
  isVisible: boolean;
  direction: 'above' | 'below' | null;
  onRecenter: () => void;
  currentTheme?: {
    bg: string;
    text: string;
    border: string;
    accent: string;
    cardBg?: string;
  };
}

interface SavedPosition {
  side: 'left' | 'right';
  yRatio: number; // 0 to 1 ratio of window.innerHeight
}

const STORAGE_KEY = 'tts_recenter_circle_pos';
const BUTTON_SIZE = 48; // 48px x 48px
const MARGIN_X = 16; // 16px from side
const MIN_Y = 64; // Safe margin from top (below status bar/top header)
const BOTTOM_SAFE_MARGIN = 80; // Safe margin from bottom (above bottom bars)

export const TTSRecenterFloatingButton: React.FC<TTSRecenterFloatingButtonProps> = ({
  isVisible,
  direction,
  onRecenter,
  currentTheme
}) => {
  const getInitialPosition = (): { x: number; y: number } => {
    const defaultY = typeof window !== 'undefined' ? Math.max(MIN_Y, window.innerHeight - 180) : 500;
    const defaultX = typeof window !== 'undefined' ? window.innerWidth - BUTTON_SIZE - MARGIN_X : 300;

    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as SavedPosition;
          const y = Math.min(
            Math.max(MIN_Y, parsed.yRatio * window.innerHeight),
            window.innerHeight - BUTTON_SIZE - BOTTOM_SAFE_MARGIN
          );
          const x = parsed.side === 'left' ? MARGIN_X : window.innerWidth - BUTTON_SIZE - MARGIN_X;
          return { x, y };
        }
      } catch (e) {
        console.warn('Failed to parse saved circle position', e);
      }
    }
    return { x: defaultX, y: defaultY };
  };

  const [position, setPosition] = useState<{ x: number; y: number }>(getInitialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);

  // High performance direct DOM ref & animation frame to achieve 120fps hardware-accelerated drag
  const currentPosRef = useRef<{ x: number; y: number }>(position);
  currentPosRef.current = position;

  const dragSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    initialButtonX: number;
    initialButtonY: number;
    startTime: number;
    hasMoved: boolean;
    rafId: number | null;
    latestTargetX: number;
    latestTargetY: number;
  } | null>(null);

  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Sync transform when position state changes (e.g. initial load or post-snap)
  useEffect(() => {
    if (buttonRef.current && !dragSessionRef.current) {
      buttonRef.current.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
    }
  }, [position.x, position.y]);

  // Handle window resizing safely
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => {
        const isLeft = prev.x < window.innerWidth / 2;
        const x = isLeft ? MARGIN_X : window.innerWidth - BUTTON_SIZE - MARGIN_X;
        const y = Math.min(
          Math.max(MIN_Y, prev.y),
          window.innerHeight - BUTTON_SIZE - BOTTOM_SAFE_MARGIN
        );
        return { x, y };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;

    const el = buttonRef.current;
    if (!el) return;

    try {
      el.setPointerCapture(e.pointerId);
    } catch {}

    dragSessionRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      initialButtonX: currentPosRef.current.x,
      initialButtonY: currentPosRef.current.y,
      startTime: Date.now(),
      hasMoved: false,
      rafId: null,
      latestTargetX: currentPosRef.current.x,
      latestTargetY: currentPosRef.current.y
    };

    setIsSnapping(false);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    const deltaX = e.clientX - session.startX;
    const deltaY = e.clientY - session.startY;
    const distance = Math.hypot(deltaX, deltaY);

    if (!session.hasMoved && distance > 5) {
      session.hasMoved = true;
      setIsDragging(true);
    }

    if (session.hasMoved) {
      const rawX = session.initialButtonX + deltaX;
      const rawY = session.initialButtonY + deltaY;

      // Clamping within viewport
      const clampedX = Math.min(Math.max(4, rawX), window.innerWidth - BUTTON_SIZE - 4);
      const clampedY = Math.min(Math.max(MIN_Y - 20, rawY), window.innerHeight - BUTTON_SIZE - 20);

      session.latestTargetX = clampedX;
      session.latestTargetY = clampedY;

      // 120fps hardware-accelerated direct GPU update via requestAnimationFrame
      if (session.rafId === null) {
        session.rafId = requestAnimationFrame(() => {
          if (dragSessionRef.current && buttonRef.current) {
            buttonRef.current.style.transform = `translate3d(${dragSessionRef.current.latestTargetX}px, ${dragSessionRef.current.latestTargetY}px, 0)`;
            dragSessionRef.current.rafId = null;
          }
        });
      }
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    if (session.rafId !== null) {
      cancelAnimationFrame(session.rafId);
      session.rafId = null;
    }

    const { hasMoved, startTime, latestTargetX, latestTargetY } = session;
    const elapsed = Date.now() - startTime;
    dragSessionRef.current = null;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    if (!hasMoved && elapsed < 450) {
      // Tap detected: trigger instant smooth recenter
      setIsDragging(false);
      onRecenter();
      return;
    }

    // Drag ended: execute edge snap
    setIsDragging(false);
    setIsSnapping(true);

    const centerX = latestTargetX + BUTTON_SIZE / 2;
    const isCloserToLeft = centerX < window.innerWidth / 2;
    const snappedX = isCloserToLeft ? MARGIN_X : window.innerWidth - BUTTON_SIZE - MARGIN_X;
    const snappedY = Math.min(
      Math.max(MIN_Y, latestTargetY),
      window.innerHeight - BUTTON_SIZE - BOTTOM_SAFE_MARGIN
    );

    // Apply snapped position with smooth transition
    setPosition({ x: snappedX, y: snappedY });

    // Save to localStorage
    const savedConfig: SavedPosition = {
      side: isCloserToLeft ? 'left' : 'right',
      yRatio: snappedY / window.innerHeight
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedConfig));
    } catch (err) {
      console.warn('Failed to save circle position to localStorage', err);
    }

    setTimeout(() => {
      setIsSnapping(false);
    }, 280);
  }, [onRecenter]);

  if (!isVisible) return null;

  const btnBg = currentTheme?.cardBg || '#181B21';
  const btnText = currentTheme?.text || '#E2E8F0';
  const btnBorder = currentTheme?.border || 'rgba(255, 255, 255, 0.15)';
  const accentColor = currentTheme?.accent || '#FF79B0';

  return (
    <button
      ref={buttonRef}
      id="tts-return-to-reading-circle"
      type="button"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        touchAction: 'none',
        willChange: isDragging ? 'transform' : 'auto',
        backgroundColor: btnBg,
        color: btnText,
        borderColor: btnBorder
      }}
      className={`fixed top-0 left-0 z-40 w-12 h-12 rounded-full flex items-center justify-center select-none backdrop-blur-xl cursor-grab active:cursor-grabbing border shadow-2xl ${
        isSnapping ? 'transition-transform duration-300 ease-out' : isDragging ? '' : 'transition-transform duration-150'
      } ${
        isDragging
          ? 'scale-115 shadow-2xl ring-2'
          : 'hover:scale-110 active:scale-95 hover:shadow-xl'
      }`}
      title={
        isDragging
          ? 'Release to snap to nearest edge'
          : direction === 'above'
          ? 'Jump up to spoken sentence (Hold & drag to move)'
          : 'Jump down to spoken sentence (Hold & drag to move)'
      }
      aria-label="Return to currently spoken sentence (Hold and drag to move)"
    >
      {isDragging ? (
        <Move className="w-5 h-5 animate-pulse stroke-[2.2]" style={{ color: accentColor }} />
      ) : direction === 'above' ? (
        <ArrowUp className="w-5 h-5 stroke-[2.5] transition-transform" style={{ color: accentColor }} />
      ) : (
        <ArrowDown className="w-5 h-5 stroke-[2.5] transition-transform" style={{ color: accentColor }} />
      )}
    </button>
  );
};

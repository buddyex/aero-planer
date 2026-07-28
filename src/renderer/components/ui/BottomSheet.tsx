import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { cn } from '../../utils/cn';
import './BottomSheet.css';

export type BottomSheetSnap = 'peek' | 'half' | 'full';

const SNAP_ORDER: BottomSheetSnap[] = ['peek', 'half', 'full'];

const SNAP_HEIGHT: Record<BottomSheetSnap, number> = {
  peek: 0.18,
  half: 0.45,
  full: 0.9,
};

export interface BottomSheetProps {
  snap: BottomSheetSnap;
  onSnapChange: (snap: BottomSheetSnap) => void;
  header?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Peek strip content always visible (e.g. summary chips). */
  peekContent?: ReactNode;
  'aria-label'?: string;
}

function nearestSnap(ratio: number): BottomSheetSnap {
  let best: BottomSheetSnap = 'peek';
  let bestDist = Infinity;
  for (const snap of SNAP_ORDER) {
    const dist = Math.abs(SNAP_HEIGHT[snap] - ratio);
    if (dist < bestDist) {
      bestDist = dist;
      best = snap;
    }
  }
  return best;
}

export function BottomSheet({
  snap,
  onSnapChange,
  header,
  children,
  className,
  peekContent,
  'aria-label': ariaLabel = 'Оперативная панель',
}: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startY: number;
    startHeight: number;
    pointerId: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  const expand = useCallback(() => {
    const idx = SNAP_ORDER.indexOf(snap);
    if (idx < SNAP_ORDER.length - 1) onSnapChange(SNAP_ORDER[idx + 1]);
  }, [onSnapChange, snap]);

  const collapse = useCallback(() => {
    const idx = SNAP_ORDER.indexOf(snap);
    if (idx > 0) onSnapChange(SNAP_ORDER[idx - 1]);
  }, [onSnapChange, snap]);

  useEffect(() => {
    if (snap !== 'full') return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onSnapChange('half');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onSnapChange, snap]);

  const onHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const panel = panelRef.current;
    if (!panel) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startY: e.clientY,
      startHeight: panel.getBoundingClientRect().height,
      pointerId: e.pointerId,
    };
    setDragging(true);
    setDragHeight(panel.getBoundingClientRect().height);
  };

  const onHandlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const viewport = window.innerHeight;
    const next = Math.min(
      viewport * 0.92,
      Math.max(viewport * 0.12, drag.startHeight + (drag.startY - e.clientY)),
    );
    setDragHeight(next);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    const height = dragHeight ?? drag.startHeight;
    const ratio = height / window.innerHeight;
    setDragHeight(null);
    onSnapChange(nearestSnap(ratio));
  };

  const onHandleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      expand();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      collapse();
    }
  };

  const panelStyle =
    dragging && dragHeight != null ? { height: `${dragHeight}px` } : undefined;

  return (
    <div className={cn('bottom-sheet', className)}>
      {snap === 'full' && (
        <button
          type="button"
          className="bottom-sheet__backdrop"
          aria-label="Свернуть панель"
          onClick={() => onSnapChange('half')}
        />
      )}
      <div
        ref={panelRef}
        className={cn(
          'bottom-sheet__panel',
          `bottom-sheet__panel--${snap}`,
          dragging && 'bottom-sheet__panel--dragging',
        )}
        style={panelStyle}
        role={snap === 'full' ? 'dialog' : 'region'}
        aria-modal={snap === 'full' ? true : undefined}
        aria-label={ariaLabel}
      >
        <div
          className="bottom-sheet__handle-zone"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onHandleKeyDown}
          role="slider"
          tabIndex={0}
          aria-valuemin={0}
          aria-valuemax={2}
          aria-valuenow={SNAP_ORDER.indexOf(snap)}
          aria-valuetext={
            snap === 'peek' ? 'Свёрнуто' : snap === 'half' ? 'Наполовину' : 'Развёрнуто'
          }
          aria-label="Высота панели"
        >
          <span className="bottom-sheet__handle" aria-hidden />
        </div>

        {peekContent && snap === 'peek' && (
          <div className="bottom-sheet__header">{peekContent}</div>
        )}

        {header && snap !== 'peek' && <div className="bottom-sheet__header">{header}</div>}

        {snap !== 'peek' && <div className="bottom-sheet__body custom-scrollbar">{children}</div>}
      </div>
    </div>
  );
}

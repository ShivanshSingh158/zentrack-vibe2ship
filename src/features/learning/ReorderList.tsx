import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical } from 'lucide-react';

interface DragState {
  draggingId: string;
  ghostX: number;
  ghostY: number;
  ghostW: number;
  ghostH: number;
  grabOffsetY: number;
  overIndex: number;
  sourceIndex: number;
}

export const ReorderList = React.memo(({ items, onReorder, renderItem }: {
  items: any[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  renderItem: (item: any, index: number, isDragging: boolean, startDrag: (e: React.PointerEvent) => void) => React.ReactNode;
}) => {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);

  const startDrag = useCallback((e: React.PointerEvent, index: number) => {
    e.preventDefault();
    const el = itemRefs.current[index];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const state: DragState = {
      draggingId: items[index].id,
      ghostX: rect.left,
      ghostY: rect.top,
      ghostW: rect.width,
      ghostH: rect.height,
      grabOffsetY: e.clientY - rect.top,
      overIndex: index,
      sourceIndex: index,
    };
    dragRef.current = state;
    setDrag({ ...state });
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  }, [items]);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const ghostY = e.clientY - dragRef.current.grabOffsetY;
      const ghostX = dragRef.current.ghostX;

      // Find closest row by distance to midpoint
      let overIndex = dragRef.current.overIndex;
      let minDistance = Infinity;
      itemRefs.current.forEach((el, i) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const dist = Math.abs(e.clientY - midY);
        if (dist < minDistance) { minDistance = dist; overIndex = i; }
      });

      // Capture values before rAF to avoid stale closure
      const capturedOverIndex = overIndex;
      const capturedGhostY = ghostY;
      const next = { ...dragRef.current, ghostY: capturedGhostY, ghostX, overIndex: capturedOverIndex };
      dragRef.current = next;

      // Move ghost via direct DOM on rAF for 60fps smoothness
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (ghostRef.current) {
          ghostRef.current.style.top = `${capturedGhostY}px`;
        }
        // Only re-render when overIndex changes (for indicator + displacement)
        setDrag(prev => {
          if (!prev || prev.overIndex === capturedOverIndex) return prev;
          return { ...prev, ghostY: capturedGhostY, overIndex: capturedOverIndex };
        });
      });
    };

    const onUp = () => {
      cancelAnimationFrame(rafRef.current);
      if (dragRef.current) {
        const { sourceIndex, overIndex } = dragRef.current;
        if (sourceIndex !== overIndex) onReorder(sourceIndex, overIndex);
      }
      dragRef.current = null;
      setDrag(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      cancelAnimationFrame(rafRef.current);
    };
  }, [drag, onReorder]);

  return (
    <>
      <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {items.map((item, index) => {
          const isDraggingThis = drag?.draggingId === item.id;
          const isOverAbove = drag && !isDraggingThis && drag.overIndex === index && drag.sourceIndex > index;
          const isOverBelow = drag && !isDraggingThis && drag.overIndex === index && drag.sourceIndex < index;

          // Smooth row displacement as ghost passes over them
          let translateY = 0;
          if (drag && !isDraggingThis) {
            const src = drag.sourceIndex;
            const over = drag.overIndex;
            const itemH = drag.ghostH + 4;
            if (src < over && index > src && index <= over) translateY = -itemH;
            else if (src > over && index >= over && index < src) translateY = itemH;
          }

          return (
            <div key={item.id}>
              {isOverAbove && (
                <div style={{ height: '3px', borderRadius: '3px', background: 'linear-gradient(90deg,#3b82f6,#60a5fa)', margin: '2px 0', boxShadow: '0 0 10px rgba(59,130,246,0.7)' }} />
              )}
              <div
                ref={el => { itemRefs.current[index] = el; }}
                style={{
                  opacity: isDraggingThis ? 0.25 : 1,
                  transform: `translateY(${translateY}px)`,
                  transition: isDraggingThis ? 'opacity 150ms ease' : 'transform 180ms cubic-bezier(0.2,0,0,1), opacity 150ms ease',
                  pointerEvents: drag && !isDraggingThis ? 'none' : 'auto',
                  willChange: drag ? 'transform' : 'auto',
                }}
              >
                {renderItem(item, index, isDraggingThis, (e: React.PointerEvent) => startDrag(e, index))}
              </div>
              {isOverBelow && (
                <div style={{ height: '3px', borderRadius: '3px', background: 'linear-gradient(90deg,#3b82f6,#60a5fa)', margin: '2px 0', boxShadow: '0 0 10px rgba(59,130,246,0.7)' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Ghost — body-level Portal, position driven via direct DOM ref for 60fps */}
      {drag && createPortal(
        <div
          ref={ghostRef}
          style={{
            position: 'fixed',
            left: drag.ghostX,
            top: drag.ghostY,
            width: drag.ghostW,
            height: drag.ghostH,
            pointerEvents: 'none',
            zIndex: 999999,
            background: 'rgba(18,18,22,0.98)',
            border: '1.5px solid rgba(59,130,246,0.6)',
            borderRadius: '10px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(59,130,246,0.25)',
            transform: 'scale(1.025) rotate(-0.4deg)',
            transformOrigin: 'center top',
            display: 'flex',
            alignItems: 'center',
            padding: '0 0.5rem',
            overflow: 'hidden',
          }}
        >
          {(() => {
            const item = items.find(i => i.id === drag.draggingId);
            if (!item) return null;
            const vid = item.url ? item.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/)?.[1] : null;
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', overflow: 'hidden' }}>
                <div style={{ cursor: 'grabbing', color: '#3b82f6', display: 'flex', flexShrink: 0 }}>
                  <GripVertical size={14} />
                </div>
                {vid && (
                  <div style={{ flexShrink: 0, width: '36px', height: '24px', borderRadius: '4px', overflow: 'hidden' }}>
                    <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.text}</span>
              </div>
            );
          })()}
        </div>,
        document.body
      )}
    </>
  );
});
ReorderList.displayName = 'ReorderList';

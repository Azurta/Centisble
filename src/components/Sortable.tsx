import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

/**
 * Drag-to-reorder list that works with a mouse, a finger, or the keyboard (focus the handle, then ↑/↓).
 * Items can be laid out in a column or a grid: the item under the pointer's nearest center wins.
 */
export function Sortable<T>({
  items,
  getId,
  onReorder,
  render,
  className,
  itemClassName,
  label,
}: {
  items: T[];
  getId: (item: T) => string;
  onReorder: (items: T[]) => void;
  render: (item: T, handle: ReactNode) => ReactNode;
  className?: string;
  itemClassName?: (item: T) => string;
  /** Names an item for the handle's screen-reader label. */
  label: (item: T) => string;
}) {
  const [order, setOrder] = useState<T[] | null>(null); // live order while dragging
  const [dragId, setDragId] = useState<string | null>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const list = order ?? items;

  const move = (from: number, to: number, base = list) => {
    if (from === to || to < 0 || to >= base.length) return base;
    const next = [...base];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    return next;
  };

  const onPointerDown = (e: PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(id);
    setOrder(items);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragId || !order) return;
    // Find the item whose center is closest to the pointer.
    let best = -1;
    let bestDist = Infinity;
    order.forEach((it, i) => {
      const el = nodes.current.get(getId(it));
      if (!el) return;
      const r = el.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    const from = order.findIndex((it) => getId(it) === dragId);
    if (best >= 0 && best !== from) setOrder(move(from, best, order));
  };

  const finish = () => {
    if (order && dragId) onReorder(order);
    setDragId(null);
    setOrder(null);
  };

  const onKey = (e: KeyboardEvent, index: number) => {
    const to = e.key === "ArrowUp" || e.key === "ArrowLeft" ? index - 1 : e.key === "ArrowDown" || e.key === "ArrowRight" ? index + 1 : null;
    if (to == null) return;
    e.preventDefault();
    const next = move(index, to, items);
    if (next !== items) {
      onReorder(next);
      // Keep focus on the moved item's handle.
      const id = getId(items[index]);
      requestAnimationFrame(() => nodes.current.get(id)?.querySelector<HTMLElement>(".drag-handle")?.focus());
    }
  };

  return (
    <div className={`sortable ${dragId ? "dragging" : ""} ${className ?? ""}`}>
      {list.map((item, i) => {
        const id = getId(item);
        const handle = (
          <button
            type="button"
            className="drag-handle"
            aria-label={`Drag to reorder ${label(item)}. Use arrow keys to move.`}
            title="Drag to reorder"
            onPointerDown={(e) => onPointerDown(e, id)}
            onPointerMove={onPointerMove}
            onPointerUp={finish}
            onPointerCancel={finish}
            onKeyDown={(e) => onKey(e, i)}
          >
            <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden>
              {[3, 8, 13].map((y) => (
                <g key={y}>
                  <circle cx="2.5" cy={y} r="1.4" />
                  <circle cx="7.5" cy={y} r="1.4" />
                </g>
              ))}
            </svg>
          </button>
        );
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) nodes.current.set(id, el);
              else nodes.current.delete(id);
            }}
            className={`sortable-item ${dragId === id ? "is-dragging" : ""} ${itemClassName?.(item) ?? ""}`}
          >
            {render(item, handle)}
          </div>
        );
      })}
    </div>
  );
}

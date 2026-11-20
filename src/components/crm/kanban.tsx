"use client";
import { DrawerPortal } from "@/components/drawer-portal";

import Link from "@/components/link";
import { useCallback, useEffect, useId, useOptimistic, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFitHeight } from "@/components/use-fit-height";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { fmtPKR } from "@/lib/crm-shared";

/** locked: cards can't be dropped here (stages only the system sets, e.g. On-hold); `lockedHint` explains why. */
export type KanbanColumn = { id: string; name: string; dot: string; askReason?: boolean; locked?: boolean; lockedHint?: string };
export type KanbanCard = {
  id: string;
  columnId: string;
  title: string;
  href: string;
  subtitle?: string;
  meta?: string;
  amount?: number;
  owner?: string;
  draggable: boolean;
};

/** Drag-and-drop board. `onMove` is a server action; cards move optimistically. */
export function Kanban({
  columns,
  cards,
  onMove,
  showTotals,
}: {
  columns: KanbanColumn[];
  cards: KanbanCard[];
  onMove: (id: string, columnId: string, reason?: string) => Promise<{ error?: string } | void>;
  showTotals?: boolean;
}) {
  const [optimistic, move] = useOptimistic(cards, (state, { id, columnId }: { id: string; columnId: string }) =>
    state.map((c) => (c.id === id ? { ...c, columnId } : c)),
  );
  const [, startTransition] = useTransition();
  const [pendingReason, setPendingReason] = useState<{ id: string; columnId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const dndId = useId(); // stable id avoids SSR hydration mismatch in dnd-kit aria attributes
  // The card being dragged floats above the board (columns scroll on their own and would cut it off).
  const [dragging, setDragging] = useState<string | null>(null);

  const commit = (id: string, columnId: string, reason?: string) =>
    startTransition(async () => {
      move({ id, columnId });
      const res = await onMove(id, columnId, reason);
      setError(res && res.error ? res.error : null);
    });

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const id = String(e.active.id);
    const columnId = e.over ? String(e.over.id) : null;
    const card = optimistic.find((c) => c.id === id);
    if (!columnId || !card || card.columnId === columnId) return;
    const target = columns.find((c) => c.id === columnId);
    if (target?.locked) return setError(target.lockedHint ?? `Cards can't be moved to ${target.name}.`);
    if (target?.askReason) setPendingReason({ id, columnId });
    else commit(id, columnId);
  }

  return (
    <>
      {error && <p className="mb-3 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <DndContext id={dndId} sensors={sensors} onDragStart={(e) => setDragging(String(e.active.id))} onDragCancel={() => setDragging(null)} onDragEnd={onDragEnd}>
        <BoardScroller columns={columns.map((c) => ({ id: c.id, name: c.name, dot: c.dot, count: optimistic.filter((x) => x.columnId === c.id).length }))}>
          {columns.map((col) => {
            const colCards = optimistic.filter((c) => c.columnId === col.id);
            const total = colCards.reduce((s, c) => s + (c.amount ?? 0), 0);
            return (
              <Column key={col.id} col={col} count={colCards.length} total={showTotals ? total : undefined}>
                {colCards.map((card) => (
                  <Card key={card.id} card={card} />
                ))}
              </Column>
            );
          })}
        </BoardScroller>
        <DragOverlay dropAnimation={null}>{dragging && optimistic.find((c) => c.id === dragging) ? <CardBody card={optimistic.find((c) => c.id === dragging)!} lifted /> : null}</DragOverlay>
      </DndContext>

      {pendingReason && (
        <ReasonDialog
          onCancel={() => setPendingReason(null)}
          onSubmit={(reason) => {
            commit(pendingReason.id, pendingReason.columnId, reason);
            setPendingReason(null);
          }}
        />
      )}
    </>
  );
}

function Column({ col, count, total, children }: { col: KanbanColumn; count: number; total?: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <div data-kanban-col={col.id} className="flex w-[85vw] max-w-72 shrink-0 snap-start flex-col sm:min-h-0 sm:w-72">
      <div data-kanban-head className="mb-2 flex items-center gap-2 px-1">
        <span className={cn("size-2 rounded-full", col.dot)} />
        <span className="text-sm font-medium">{col.name}</span>
        <span className="text-xs text-muted">{count}</span>
        {total !== undefined && total > 0 && <span className="ml-auto text-xs font-medium text-muted">{fmtPKR(total, { prefix: false })}</span>}
      </div>
      <div
        ref={setNodeRef}
        className={cn("min-h-40 flex-1 space-y-2 rounded-xl border border-dashed p-2 transition sm:min-h-0 sm:overflow-y-auto sm:overscroll-contain", isOver ? "border-navy-700/40 bg-navy-900/5" : "border-transparent bg-black/[0.025]")}
      >
        {children}
      </div>
    </div>
  );
}

function Card({ card }: { card: KanbanCard }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, disabled: !card.draggable });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} data-kanban-card className={cn(card.draggable && "cursor-grab active:cursor-grabbing", isDragging && "opacity-40")}>
      <CardBody card={card} />
    </div>
  );
}

function CardBody({ card, lifted }: { card: KanbanCard; lifted?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-line bg-surface p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition", lifted && "w-72 rotate-1 cursor-grabbing shadow-xl")}>
      {/* Grab anywhere (the name too) to drag: a click opens the lead, a few pixels of movement start a drag. */}
      <Link href={card.href} draggable={false} className="block text-sm font-medium hover:underline">
        {card.title}
      </Link>
      {card.subtitle && <p className="mt-0.5 truncate text-xs text-muted">{card.subtitle}</p>}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-ink/80">{card.amount ? fmtPKR(card.amount) : card.meta ?? ""}</span>
        {card.owner && <span className="truncate text-muted">{card.owner}</span>}
      </div>
    </div>
  );
}

function ReasonDialog({ onSubmit, onCancel }: { onSubmit: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <DrawerPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/30 p-4">
      <form
        className="w-full max-w-sm rounded-xl bg-surface p-5 shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim()) onSubmit(reason.trim());
        }}
      >
        <p className="font-medium">Why was this deal lost?</p>
        <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className="input mt-3" placeholder="e.g. Budget mismatch, bought elsewhere" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-9 rounded-md px-3 text-sm text-muted hover:bg-canvas">Cancel</button>
          <button className="h-9 rounded-md bg-navy-900 px-3.5 text-sm font-medium text-white">Mark lost</button>
        </div>
      </form>
    </div>
    </DrawerPortal>
  );
}

/**
 * The board's sideways movement, so nobody has to fight a horizontal scrollbar: a stage bar to jump to any column
 * (stages on screen are highlighted), arrows at the edges (one column at a time), dragging the empty background,
 * the mouse wheel over the column headers, and on phones a swipe that snaps one column at a time.
 */
function BoardScroller({ columns, children }: { columns: { id: string; name: string; dot: string; count: number }[]; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const pan = useRef<{ x: number; left: number } | null>(null);
  useFitHeight(box, 12, [columns.length], "fixed"); // the board fills the window; each column scrolls its own cards

  const measure = useCallback(() => {
    const el = box.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    const r = el.getBoundingClientRect();
    const seen = new Set<string>();
    el.querySelectorAll<HTMLElement>("[data-kanban-col]").forEach((c) => {
      const b = c.getBoundingClientRect();
      if (b.right > r.left + 40 && b.left < r.right - 40) seen.add(c.dataset.kanbanCol!);
    });
    setVisible(seen);
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, columns.length]);

  const colWidth = () => (box.current?.querySelector<HTMLElement>("[data-kanban-col]")?.offsetWidth ?? 288) + 12;
  const step = (dir: 1 | -1) => box.current?.scrollBy({ left: dir * colWidth(), behavior: "smooth" });
  const jump = (id: string) => {
    const el = box.current, col = el?.querySelector<HTMLElement>(`[data-kanban-col="${CSS.escape(id)}"]`);
    if (el && col) el.scrollTo({ left: col.offsetLeft - el.offsetLeft - 16, behavior: "smooth" });
  };

  return (
    <div>
      {/* Stage bar: jump to a column. */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Go to stage">
        {columns.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={visible.has(c.id)} onClick={() => jump(c.id)}
            className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition", visible.has(c.id) ? "border-navy-900/30 bg-navy-900/[0.06] font-medium text-ink" : "border-line text-muted hover:text-ink")}>
            <span className={cn("size-2 rounded-full", c.dot)} />{c.name}<span className="tabular-nums opacity-70">{c.count}</span>
          </button>
        ))}
      </div>
      <div className="relative">
        {edges.left && <button type="button" onClick={() => step(-1)} aria-label="Previous stages" className="absolute left-0 top-24 z-20 hidden size-10 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-surface shadow-lg hover:bg-canvas sm:flex"><ChevronLeft className="size-5" /></button>}
        {edges.right && <button type="button" onClick={() => step(1)} aria-label="Next stages" className="absolute right-0 top-24 z-20 hidden size-10 translate-x-1/2 items-center justify-center rounded-full border border-line bg-surface shadow-lg hover:bg-canvas sm:flex"><ChevronRight className="size-5" /></button>}
        <div
          ref={box}
          onScroll={measure}
          // Drag the empty background to pan (cards still drag between columns).
          onPointerDown={(e) => {
            if (e.pointerType !== "mouse" || e.button !== 0 || (e.target as HTMLElement).closest("[data-kanban-card], a, button, input, select, textarea")) return;
            pan.current = { x: e.clientX, left: box.current!.scrollLeft };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => { if (pan.current && box.current) box.current.scrollLeft = pan.current.left - (e.clientX - pan.current.x); }}
          onPointerUp={() => { pan.current = null; }}
          // Mouse wheel over the column headers scrolls sideways.
          onWheel={(e) => {
            if (!box.current || Math.abs(e.deltaX) > Math.abs(e.deltaY) || !(e.target as HTMLElement).closest("[data-kanban-head]")) return;
            box.current.scrollLeft += e.deltaY;
          }}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-4 sm:-mx-8 sm:snap-none sm:px-8 cursor-grab active:cursor-grabbing sm:[&>[data-kanban-col]]:max-h-full"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useId, useOptimistic, useState, useTransition } from "react";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
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

  const commit = (id: string, columnId: string, reason?: string) =>
    startTransition(async () => {
      move({ id, columnId });
      const res = await onMove(id, columnId, reason);
      setError(res && res.error ? res.error : null);
    });

  function onDragEnd(e: DragEndEvent) {
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
      <DndContext id={dndId} sensors={sensors} onDragEnd={onDragEnd}>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
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
        </div>
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
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn("size-2 rounded-full", col.dot)} />
        <span className="text-sm font-medium">{col.name}</span>
        <span className="text-xs text-muted">{count}</span>
        {total !== undefined && total > 0 && <span className="ml-auto text-xs font-medium text-muted">{fmtPKR(total, { prefix: false })}</span>}
      </div>
      <div
        ref={setNodeRef}
        className={cn("min-h-40 flex-1 space-y-2 rounded-xl border border-dashed p-2 transition", isOver ? "border-navy-700/40 bg-navy-900/5" : "border-transparent bg-black/[0.025]")}
      >
        {children}
      </div>
    </div>
  );
}

function Card({ card }: { card: KanbanCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id, disabled: !card.draggable });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "rounded-lg border border-line bg-surface p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition",
        card.draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "relative z-10 rotate-1 shadow-lg",
      )}
    >
      <Link href={card.href} className="block text-sm font-medium hover:underline" onPointerDown={(e) => e.stopPropagation()}>
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
  );
}

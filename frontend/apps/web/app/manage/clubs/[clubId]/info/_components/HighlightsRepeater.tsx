'use client';

import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical } from 'lucide-react';

// 추가는 7개까지만 허용. 레거시(8~10개) 데이터는 렌더·수정·삭제 가능, 추가만 차단한다 (§4.4).
const MAX_ADD = 7;
const MAX_LENGTH = 100;

type HighlightsRepeaterProps = {
  value: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
};

function SortableHighlightRow({
  id, item, readOnly, onEdit, onRemove,
}: {
  id: string;
  item: string;
  readOnly: boolean;
  onEdit: (next: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled: readOnly });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2.5 rounded-[12px] border border-[#e2ddcb] bg-white px-3 py-2"
    >
      {!readOnly && (
        <button
          type="button"
          aria-label="순서 변경"
          className="cursor-grab touch-none text-[#b8b8ac] hover:text-[#4a5247]"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <Check aria-hidden className="h-4 w-4 shrink-0 text-[#4a6b3f]" />
      <input
        type="text"
        value={item}
        onChange={(event) => onEdit(event.target.value)}
        placeholder="예: 사이드 프로젝트 동료가 필요한 사람"
        maxLength={MAX_LENGTH}
        disabled={readOnly}
        className="min-w-0 flex-1 bg-transparent text-[14px] text-[#2a2f27] placeholder:text-[#b8b8ac] focus:outline-none"
      />
      {!readOnly && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="강조 항목 삭제"
          className="shrink-0 rounded-[6px] px-1.5 py-1 text-[13px] text-[#8a8f83] hover:bg-[rgba(179,90,58,0.06)] hover:text-[#b35a3a]"
        >
          ✕
        </button>
      )}
    </li>
  );
}

export function HighlightsRepeater({ value, onChange, readOnly = false }: HighlightsRepeaterProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = value.map((_, index) => `highlight-${index}`);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    onChange(arrayMove(value, from, to));
  }

  function update(idx: number, next: string) {
    onChange(value.map((item, i) => (i === idx ? next : item)));
  }

  function add() {
    if (value.length >= MAX_ADD) return;
    onChange([...value, '']);
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            {value.map((item, index) => {
              const rowId = `highlight-${index}`;
              return (
                <SortableHighlightRow
                  key={rowId}
                  id={rowId}
                  item={item}
                  readOnly={readOnly}
                  onEdit={(next) => update(index, next)}
                  onRemove={() => remove(index)}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>
      {!readOnly && (
        <button
          type="button"
          onClick={add}
          disabled={value.length >= MAX_ADD}
          className="text-[13px] font-medium text-[#3e5b34] hover:underline disabled:cursor-not-allowed disabled:text-[#b8b8ac] disabled:no-underline"
        >
          ＋ 항목 추가 ({value.length}/{MAX_ADD})
        </button>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ClubProject } from '@duing/types';
import { PROJECT_ICON_COMPONENTS, projectCardTone } from '@/app/_lib/projectIcons';
import { ProjectIconPicker } from './ProjectIconPicker';

const MAX_PROJECTS = 6;

type Props = { value: ClubProject[]; onChange: (next: ClubProject[]) => void; readOnly: boolean };

function SortableProjectRow({
  id, project, index, readOnly, editing, onEdit, onRemove, onPatch,
}: {
  id: string;
  project: ClubProject;
  index: number;
  readOnly: boolean;
  editing: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onPatch: (patch: Partial<ClubProject>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled: readOnly });
  const IconComponent = PROJECT_ICON_COMPONENTS[project.icon];
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="rounded-[12px] border border-[#e2ddcb] bg-white"
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
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
        <span className={`grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[10px] ${projectCardTone(index)}`}>
          <IconComponent aria-hidden className="h-5 w-5 text-[#1f3a2e]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-bold text-[#2a2f27]">{project.title || '제목 없음'}</span>
          {project.subtitle !== null && project.subtitle !== '' && (
            <span className="mt-0.5 block truncate text-[11.5px] text-[#8a8f83]">{project.subtitle}</span>
          )}
        </span>
        {!readOnly && (
          <>
            <button type="button" onClick={onEdit} className="shrink-0 text-[12.5px] font-medium text-[#3e5b34] hover:underline">
              {editing ? '접기' : '편집'}
            </button>
            <button type="button" onClick={onRemove} aria-label="프로젝트 삭제" className="shrink-0 text-[12.5px] text-[#8a8f83] hover:text-[#b35a3a]">
              ✕
            </button>
          </>
        )}
      </div>
      {editing && !readOnly && (
        <div className="space-y-3 border-t border-[#f0ede3] px-3 py-3">
          <ProjectIconPicker value={project.icon} onChange={(icon) => onPatch({ icon })} />
          <input
            type="text"
            value={project.title}
            maxLength={30}
            onChange={(event) => onPatch({ title: event.target.value })}
            placeholder="프로젝트 제목 (30자 이내)"
            className="w-full rounded-[8px] border border-[#cfcab8] px-3 py-2 text-[13.5px] focus:border-[#4a6b3f] focus:outline-none"
          />
          <input
            type="text"
            value={project.subtitle ?? ''}
            maxLength={40}
            onChange={(event) => onPatch({ subtitle: event.target.value === '' ? null : event.target.value })}
            placeholder="부제목 (선택, 40자 이내)"
            className="w-full rounded-[8px] border border-[#cfcab8] px-3 py-2 text-[13.5px] focus:border-[#4a6b3f] focus:outline-none"
          />
        </div>
      )}
    </li>
  );
}

export function ProjectsRepeater({ value, onChange, readOnly }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = value.map((_, index) => `project-${index}`);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    onChange(arrayMove(value, from, to));
    setEditingIndex(null);
  }

  function add() {
    if (value.length >= MAX_PROJECTS) return;
    onChange([...value, { icon: 'CODE', title: '', subtitle: null }]);
    setEditingIndex(value.length);
  }

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {value.map((project, index) => {
              const rowId = `project-${index}`;
              return (
                <SortableProjectRow
                  key={rowId}
                  id={rowId}
                  project={project}
                  index={index}
                  readOnly={readOnly}
                  editing={editingIndex === index}
                  onEdit={() => setEditingIndex(editingIndex === index ? null : index)}
                  onRemove={() => {
                    onChange(value.filter((_, i) => i !== index));
                    setEditingIndex(null);
                  }}
                  onPatch={(patch) => onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)))}
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
          disabled={value.length >= MAX_PROJECTS}
          className="text-[13px] font-medium text-[#3e5b34] hover:underline disabled:cursor-not-allowed disabled:text-[#b8b8ac] disabled:no-underline"
        >
          ＋ 프로젝트 추가 ({value.length}/{MAX_PROJECTS})
        </button>
      )}
    </div>
  );
}

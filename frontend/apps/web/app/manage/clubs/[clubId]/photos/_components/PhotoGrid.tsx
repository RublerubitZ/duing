'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import type { ClubPhoto } from '@duing/types';
import { useReorderPhotosMutation } from '@duing/hooks';
import { PhotoCard } from './PhotoCard';

type PhotoGridProps = {
  clubId: number;
  photos: ClubPhoto[];
};

const REORDER_DEBOUNCE_MS = 1000;

export function PhotoGrid({ clubId, photos }: PhotoGridProps) {
  // 드래그로 즉시 갱신되는 로컬 순서. server 갱신 성공 후 props 가 동기화될 때까지 사용.
  const [order, setOrder] = useState(photos);
  const reorder = useReorderPhotosMutation(clubId);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitted = useRef(photos);

  useEffect(() => {
    setOrder(photos);
    lastCommitted.current = photos;
  }, [photos]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(dragEvent: DragEndEvent) {
    const { active, over } = dragEvent;
    if (!over || active.id === over.id) return;
    const oldIndex = order.findIndex((photo) => photo.id === active.id);
    const newIndex = order.findIndex((photo) => photo.id === over.id);
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    scheduleReorder(next);
  }

  function scheduleReorder(next: ClubPhoto[]) {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      try {
        await reorder.mutateAsync({
          items: next.map((photo, idx) => ({ photoId: photo.id, displayOrder: idx })),
        });
        lastCommitted.current = next;
      } catch {
        // 실패 시 마지막으로 commit 된 순서로 롤백.
        setOrder(lastCommitted.current);
        alert('순서 저장에 실패했습니다. 다시 시도해주세요.');
      }
    }, REORDER_DEBOUNCE_MS);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order.map((photo) => photo.id)} strategy={rectSortingStrategy}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '18px',
          }}
        >
          {order.map((photo, photoIndex) => (
            <PhotoCard key={photo.id} clubId={clubId} photo={photo} index={photoIndex} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

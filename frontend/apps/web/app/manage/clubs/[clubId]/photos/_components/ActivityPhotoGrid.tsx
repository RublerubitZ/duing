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
import { Plus } from 'lucide-react';
import type { ClubPhoto } from '@duing/types';
import { useCreatePhotoMutation, useFileUploadMutation, useReorderPhotosMutation } from '@duing/hooks';
import { IMAGE_UPLOAD_POLICY, validateImageFile } from '@/app/_components/imageUploadPolicy';
import { Spinner } from '@/components/loading/Spinner';
import { ActivityPhotoCard } from './ActivityPhotoCard';

const REORDER_DEBOUNCE_MS = 1000;

type Props = {
  clubId: number;
  photos: ClubPhoto[];
  onPromote: (photo: ClubPhoto) => void;
  promoteDisabled?: boolean;
};

/**
 * 전체 활동 사진 그리드. 핸들 전용 dnd + 1초 디바운스 자동저장(실패 시 마지막 순서로 롤백) +
 * 마지막에 다중 업로드 추가 카드. PhotoGrid·PhotoUploader 로직을 흡수해 대체한다.
 */
export function ActivityPhotoGrid({ clubId, photos, onPromote, promoteDisabled = false }: Props) {
  // 드래그로 즉시 갱신되는 로컬 순서. server 갱신 성공 후 props 가 동기화될 때까지 사용.
  const [order, setOrder] = useState(photos);
  const reorder = useReorderPhotosMutation(clubId);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitted = useRef(photos);

  useEffect(() => {
    setOrder(photos);
    lastCommitted.current = photos;
  }, [photos]);

  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    },
    [],
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.findIndex((photo) => photo.id === active.id);
    const newIndex = order.findIndex((photo) => photo.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    scheduleReorder(next);
  }

  function scheduleReorder(next: ClubPhoto[]) {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      try {
        await reorder.mutateAsync({
          items: next.map((photo, index) => ({ photoId: photo.id, displayOrder: index })),
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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {order.map((photo) => (
            <ActivityPhotoCard
              key={photo.id}
              clubId={clubId}
              photo={photo}
              onPromote={onPromote}
              promoteDisabled={promoteDisabled}
            />
          ))}
          <AddPhotoCard clubId={clubId} />
        </div>
      </SortableContext>
    </DndContext>
  );
}

/** 다중 파일 업로드 추가 카드 — 점선 카드 클릭 → 순차 업로드·실패 목록(PhotoUploader 로직 흡수). */
function AddPhotoCard({ clubId }: { clubId: number }) {
  const createPhoto = useCreatePhotoMutation(clubId);
  const uploadFile = useFileUploadMutation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setErrors([]);
    const failures: string[] = [];
    for (const file of Array.from(fileList)) {
      // 클라이언트 선검증 — 위반 시 서버 호출 없이 즉시 skip(백엔드 정책 5MB / JPG·PNG·WEBP 동일).
      const validationError = validateImageFile(file);
      if (validationError) {
        failures.push(`${file.name}: ${validationError}`);
        continue;
      }
      try {
        const uploaded = await uploadFile.mutateAsync({ file, purpose: 'PHOTO' });
        await createPhoto.mutateAsync({
          storageKey: uploaded.storageKey,
          caption: null,
          width: null,
          height: null,
        });
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof Error ? err.message : '업로드 실패'}`);
      }
    }
    setErrors(failures);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="사진 추가"
        className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-charcoal-3/50 bg-sage-mist/40 text-charcoal-2 transition-colors hover:border-ink hover:bg-sage-mist disabled:opacity-60"
      >
        {busy ? <Spinner size={20} /> : <Plus size={24} aria-hidden />}
        <span className="text-[12px] font-medium">{busy ? '업로드 중…' : '사진 추가'}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_UPLOAD_POLICY.acceptAttribute}
        multiple
        disabled={busy}
        onChange={(event) => handleFiles(event.target.files)}
        className="hidden"
      />
      {errors.length > 0 && (
        <ul className="text-[11.5px] text-coral">
          {errors.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

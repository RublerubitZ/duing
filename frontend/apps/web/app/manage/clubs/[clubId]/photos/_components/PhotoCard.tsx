'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ClubPhoto } from '@duing/types';
import { useDeletePhotoMutation, useUpdatePhotoMutation } from '@duing/hooks';
import { ImageWithFallback } from '@/app/_components/ImageWithFallback';

type PhotoCardProps = {
  clubId: number;
  photo: ClubPhoto;
};

export function PhotoCard({ clubId, photo }: PhotoCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.id,
  });
  const updatePhoto = useUpdatePhotoMutation(clubId);
  const deletePhoto = useDeletePhotoMutation(clubId);

  const [caption, setCaption] = useState(photo.caption ?? '');
  const [error, setError] = useState<string | null>(null);

  async function commitCaption() {
    const next = caption.trim() || null;
    const prev = photo.caption ?? null;
    if (next === prev) return;
    try {
      await updatePhoto.mutateAsync({ photoId: photo.id, payload: { caption: next } });
    } catch (err) {
      setError(err instanceof Error ? err.message : '캡션 저장 실패');
      setCaption(prev ?? '');
    }
  }

  async function handleDelete() {
    if (!confirm('이 사진을 삭제할까요?')) return;
    try {
      await deletePhoto.mutateAsync(photo.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패');
    }
  }

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}
      className="space-y-2 rounded-md border border-slate-200 bg-white p-2">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="드래그하여 순서 변경"
        className="block w-full cursor-grab text-left active:cursor-grabbing"
      >
        <ImageWithFallback
          src={photo.storageKey}
          alt={photo.caption ?? ''}
          className="aspect-square w-full rounded-sm"
          emptyMessage="사진 없음"
          errorMessage="불러올 수 없습니다"
          draggable={false}
        />
      </button>
      <input
        type="text"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={commitCaption}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        placeholder="캡션"
        maxLength={200}
        className="w-full rounded-sm border border-slate-200 px-1 py-0.5 text-xs"
      />
      <button
        type="button"
        onClick={handleDelete}
        className="text-xs text-slate-500 hover:text-rose-600"
      >
        삭제
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
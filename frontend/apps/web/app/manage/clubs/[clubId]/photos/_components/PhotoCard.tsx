'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ClubPhoto } from '@duing/types';
import { useDeletePhotoMutation, useUpdatePhotoMutation } from '@duing/hooks';

type PhotoCardProps = {
  clubId: number;
  photo: ClubPhoto;
  index: number;
};

export function PhotoCard({ clubId, photo, index }: PhotoCardProps) {
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

  const cardStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const photoLabel = `PHOTO ${String(index + 1).padStart(2, '0')}`;

  return (
    <div
      ref={setNodeRef}
      style={cardStyle}
      className="flex flex-col gap-[10px] bg-white border border-[#d9d4c3] rounded-[10px] p-3 shadow-[0_1px_0_rgba(47,58,46,0.04),0_1px_2px_rgba(47,58,46,0.05)] hover:shadow-[0_2px_6px_rgba(47,58,46,0.06),0_8px_24px_rgba(47,58,46,0.05)] hover:-translate-y-px transition-[box-shadow,transform]"
    >
      {/* thumbnail — drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="aspect-square w-full rounded-[8px] overflow-hidden border border-[#e6e1d2] bg-[#faf7ee] cursor-grab active:cursor-grabbing touch-none"
        aria-label="드래그하여 순서 변경"
      >
        {photo.storageKey ? (
          <img
            src={photo.storageKey}
            alt={photo.caption ?? photoLabel}
            className="w-full h-full object-cover block"
            draggable={false}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center font-mono text-[11px] tracking-[0.1em] uppercase text-[#b5b8ac] select-none"
            style={{
              background:
                'repeating-linear-gradient(135deg, rgba(74,107,63,0.05) 0 10px, rgba(74,107,63,0) 10px 20px), #faf7ee',
            }}
          >
            {photoLabel}
          </div>
        )}
      </div>

      {/* caption input */}
      <input
        type="text"
        value={caption}
        onChange={(captionEvent) => setCaption(captionEvent.target.value)}
        onBlur={commitCaption}
        onKeyDown={(keyEvent) => {
          if (keyEvent.key === 'Enter') keyEvent.currentTarget.blur();
        }}
        placeholder="캡션"
        maxLength={200}
        className="w-full border border-[#cfcab8] bg-white rounded-[8px] px-[10px] py-2 text-[13px] text-[#2a2f27] placeholder:text-[#b8b8ac] focus:outline-none focus:border-[#4a6b3f] focus:shadow-[0_0_0_3px_rgba(74,107,63,0.15)] transition-[border-color,box-shadow]"
      />

      {/* card footer */}
      <div className="flex items-center justify-between px-0.5">
        <span className="font-mono text-[11px] tracking-[0.08em] text-[#b5b8ac] uppercase select-none">
          DRAG TO REORDER
        </span>
        <button
          type="button"
          onClick={handleDelete}
          className="px-1.5 py-1 rounded-[6px] text-[12.5px] text-[#8a8f83] hover:text-[#b35a3a] hover:bg-[rgba(179,90,58,0.06)] cursor-pointer transition-colors bg-transparent border-none"
        >
          삭제
        </button>
      </div>

      {error && <p className="text-[12px] text-[#b35a3a] mt-0.5">{error}</p>}
    </div>
  );
}

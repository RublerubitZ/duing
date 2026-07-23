'use client';

import { useRef, useState } from 'react';
import type { ClubPhoto } from '@duing/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IMAGE_UPLOAD_POLICY, validateImageFile } from '@/app/_components/imageUploadPolicy';
import { cn } from '@/app/_lib/cn';

type Props = {
  open: boolean;
  photos: ClubPhoto[];
  /** 이미 대표 활동으로 쓰인 사진 id — 딤 처리·클릭 불가. */
  usedPhotoIds: number[];
  busy?: boolean;
  /** 부모가 처리하는 업로드/생성 서버 실패 메시지 — 다이얼로그 안에서 표시(닫힌 채 무반응 방지). */
  serverError?: string | null;
  onPick: (photo: ClubPhoto) => void;
  onUploadNew: (file: File) => void;
  onClose: () => void;
};

/**
 * 대표 활동 사진 선택 다이얼로그. 전체 활동 사진 그리드(사용 중 사진은 딤+"사용 중" 뱃지·비활성) +
 * 새 사진 업로드(validateImageFile 선검증 → 부모가 업로드·photo 생성 처리).
 */
export function PhotoPickerDialog({
  open,
  photos,
  usedPhotoIds,
  busy = false,
  serverError = null,
  onPick,
  onUploadNew,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const usedSet = new Set(usedPhotoIds);

  function handleFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    // 클라이언트 선검증 — 위반 시 서버 호출 없이 즉시 안내(백엔드 정책 5MB / JPG·PNG·WEBP 동일).
    const validationError = validateImageFile(file);
    if (inputRef.current) inputRef.current.value = '';
    if (validationError) {
      setUploadError(validationError);
      return;
    }
    setUploadError(null);
    onUploadNew(file);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-w-lg"
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>대표 활동 사진 선택</DialogTitle>
          <DialogDescription>기존 활동 사진에서 고르거나 새 사진을 업로드해요.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label className={cn('btn btn-secondary btn-sm cursor-pointer', busy && 'pointer-events-none opacity-50')}>
            새 사진 업로드
            <input
              ref={inputRef}
              type="file"
              accept={IMAGE_UPLOAD_POLICY.acceptAttribute}
              disabled={busy}
              onChange={(event) => handleFile(event.target.files)}
              className="hidden"
            />
          </label>
          <p className="text-[11.5px] text-charcoal-3">업로드한 사진은 전체 활동 사진에도 추가돼요.</p>
          {(uploadError ?? serverError) && (
            <p className="text-[12px] text-coral">{uploadError ?? serverError}</p>
          )}
        </div>

        {photos.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-charcoal-2">
            등록된 활동 사진이 없어요. 새 사진을 업로드해 주세요.
          </p>
        ) : (
          <div className="grid max-h-[52vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {photos.map((photo) => {
              const used = usedSet.has(photo.id);
              return (
                <button
                  key={photo.id}
                  type="button"
                  disabled={used || busy}
                  onClick={() => onPick(photo)}
                  aria-label={used ? '사용 중인 사진' : '이 사진 선택'}
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-md border border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    used ? 'cursor-not-allowed' : 'hover:border-ink',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL 썸네일. */}
                  <img
                    src={photo.storageKey}
                    alt={photo.caption ?? ''}
                    draggable={false}
                    className={cn('h-full w-full object-cover', used && 'opacity-40')}
                  />
                  {used && (
                    <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-0.5 text-center text-[11px] font-semibold text-white">
                      사용 중
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost btn-sm">
            닫기
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

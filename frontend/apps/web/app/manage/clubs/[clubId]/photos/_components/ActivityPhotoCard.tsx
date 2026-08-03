'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Star, Trash2 } from 'lucide-react';
import type { ClubPhoto } from '@duing/types';
import { useDeletePhotoMutation, useUpdatePhotoMutation } from '@duing/hooks';
import { ImageWithFallback } from '@/app/_components/ImageWithFallback';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/app/_lib/cn';

const CAPTION_MAX = 200;

// 모바일(hover 불가)은 상시 노출, 데스크탑(sm↑)은 hover/focus 시 노출.
const OVERLAY_VISIBILITY =
  'opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100';

type Props = {
  clubId: number;
  photo: ClubPhoto;
  /** "대표로 지정" — 첫 빈 hero 슬롯에 이 사진을 시드한다. */
  onPromote: (photo: ClubPhoto) => void;
  /** 빈 hero 슬롯이 없으면 true — 버튼 비활성 + 안내 title. */
  promoteDisabled?: boolean;
  /** 이 사진이 이미 대표 활동(저장·pending)으로 쓰이면 true — 버튼 비활성 + 안내 title(409 선차단). */
  alreadyFeatured?: boolean;
};

/**
 * 전체 활동 사진 카드. 정사각 이미지 + hover(모바일 상시) 오버레이 액션(대표로 지정·캡션·삭제) +
 * ⠿ 드래그 핸들(listeners 는 핸들에만). 캡션=소형 Dialog, 삭제=ConfirmDialog(실패는 모달 안에서 안내).
 */
export function ActivityPhotoCard({
  clubId,
  photo,
  onPromote,
  promoteDisabled = false,
  alreadyFeatured = false,
}: Props) {
  const promoteButtonDisabled = promoteDisabled || alreadyFeatured;
  const promoteTitle = alreadyFeatured
    ? '이미 대표 활동으로 사용 중인 사진이에요.'
    : promoteDisabled
      ? '빈 대표 활동 슬롯이 없어요. 대표 활동에서 먼저 하나를 비워주세요.'
      : '이 사진을 첫 빈 대표 활동 슬롯에 등록합니다.';
  // disabled 버튼의 title 툴팁은 일부 브라우저에서 안 뜨므로 사유를 스크린리더에도 노출한다(시각 추가 텍스트 없음).
  const promoteReasonId = `promote-reason-${photo.id}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.id,
  });
  const updatePhoto = useUpdatePhotoMutation(clubId);
  const deletePhoto = useDeletePhotoMutation(clubId);

  const [captionOpen, setCaptionOpen] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(photo.caption ?? '');
  // 캡션 에러는 캡션 다이얼로그 전용 채널 — 삭제 확인 모달의 오류와 섞이지 않게 분리.
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function closeCaption() {
    setCaptionOpen(false);
    setCaptionError(null);
  }

  async function saveCaption() {
    const next = captionDraft.trim() || null;
    if (next === (photo.caption ?? null)) {
      closeCaption();
      return;
    }
    setCaptionError(null);
    try {
      await updatePhoto.mutateAsync({ photoId: photo.id, payload: { caption: next } });
      closeCaption();
    } catch (err) {
      // 실패는 다이얼로그를 연 채 내부에 표시 — 입력값 보존·재시도 유리(재시도 대상이 입력이므로).
      setCaptionError(err instanceof Error ? err.message : '캡션 저장에 실패했습니다.');
    }
  }

  async function runDelete() {
    setDeleteError(null);
    try {
      await deletePhoto.mutateAsync(photo.id);
      setConfirmOpen(false);
    } catch (err) {
      // 참조 중(409) 등 실패는 모달을 열어둔 채 모달 안에서 안내한다 (공통 규칙).
      // 카드에 그리면 모달 오버레이와 aria-hidden 뒤에 갇혀 사용자에게 닿지 않는다.
      setDeleteError(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    }
  }

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <ImageWithFallback
        src={photo.storageKey}
        alt={photo.caption ?? ''}
        className="aspect-square w-full rounded-[12px] border border-line"
        emptyMessage="사진 없음"
        errorMessage="불러올 수 없습니다"
        draggable={false}
      />

      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="드래그하여 순서 변경"
        className={cn(
          'absolute right-2 top-2 grid h-7 w-7 cursor-grab touch-none place-items-center rounded-md bg-ink/60 text-white active:cursor-grabbing',
          OVERLAY_VISIBILITY,
        )}
      >
        <GripVertical size={15} />
      </button>

      <div
        className={cn(
          'absolute inset-x-2 bottom-2 flex items-center gap-1 rounded-lg bg-ink/60 p-1',
          OVERLAY_VISIBILITY,
        )}
      >
        <button
          type="button"
          onClick={() => onPromote(photo)}
          disabled={promoteButtonDisabled}
          title={promoteTitle}
          aria-describedby={promoteButtonDisabled ? promoteReasonId : undefined}
          className="flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] font-semibold text-white hover:bg-white/15 disabled:opacity-40"
        >
          <Star size={13} aria-hidden />
          대표로 지정
        </button>
        {promoteButtonDisabled && (
          <span id={promoteReasonId} className="sr-only">
            {promoteTitle}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            setCaptionDraft(photo.caption ?? '');
            setCaptionError(null);
            setCaptionOpen(true);
          }}
          aria-label="캡션 편집"
          className="grid h-7 w-7 place-items-center rounded-md text-white hover:bg-white/15"
        >
          <Pencil size={13} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            setConfirmOpen(true);
          }}
          aria-label="사진 삭제"
          className="grid h-7 w-7 place-items-center rounded-md text-white hover:bg-coral"
        >
          <Trash2 size={13} aria-hidden />
        </button>
      </div>

      <Dialog
        open={captionOpen}
        onOpenChange={(next) => {
          if (!next && !updatePhoto.isPending) closeCaption();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>캡션 편집</DialogTitle>
            <DialogDescription>사진 설명을 입력해요. 비워서 저장하면 캡션이 지워져요.</DialogDescription>
          </DialogHeader>
          <input
            aria-label="캡션"
            value={captionDraft}
            maxLength={CAPTION_MAX}
            onChange={(event) => setCaptionDraft(event.target.value)}
            placeholder="사진 설명(선택)"
            className="w-full rounded-md border border-line px-2.5 py-1.5 text-[13px] focus:border-ink focus:outline-none"
          />
          <p className="text-right text-[11px] text-charcoal-3">
            {captionDraft.length}/{CAPTION_MAX}
          </p>
          {captionError && <p className="text-[12px] text-coral">{captionError}</p>}
          <DialogFooter>
            <button
              type="button"
              onClick={closeCaption}
              disabled={updatePhoto.isPending}
              className="btn btn-ghost btn-sm"
            >
              취소
            </button>
            <button
              type="button"
              onClick={saveCaption}
              disabled={updatePhoto.isPending}
              className="btn btn-primary btn-sm disabled:opacity-50"
            >
              저장
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        title="이 사진을 삭제할까요?"
        description="삭제한 사진은 복구할 수 없습니다."
        isPending={deletePhoto.isPending}
        errorMessage={deleteError}
        onConfirm={runDelete}
        onCancel={() => {
          setConfirmOpen(false);
          setDeleteError(null);
        }}
      />
    </div>
  );
}

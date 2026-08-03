'use client';

import { useState, type ReactNode } from 'react';
import type { ClubHeroActivity, UpdateHeroActivityPayload } from '@duing/types';
import {
  useCreateHeroActivityMutation,
  useDeleteHeroActivityMutation,
  useUpdateHeroActivityMutation,
} from '@duing/hooks';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { HeroActivityCard } from '@/app/_components/HeroActivityCard';

const TITLE_MAX = 30;
const DESC_MAX = 80;

type PendingPhoto = { clubPhotoId: number; storageKey: string };

type Props = {
  clubId: number;
  slotNumber: number;
  hero: ClubHeroActivity | null;
  dragHandle: ReactNode;
  onPickPhoto: () => void;
  /** 신규/교체용으로 부모(피커)가 시드한 선택 사진. */
  pendingPhoto?: PendingPhoto | null;
  onSaved?: () => void;
  /** 저장 직전(create/update) 대기 중 정렬 디바운스를 즉시 flush 한다 — reorder↔create 레이스 방지. */
  onBeforeSave?: () => Promise<void>;
};

/**
 * 슬롯 1개의 편집 컨테이너. 상태 머신:
 *  - 빈 슬롯(hero·pendingPhoto 모두 없음): 카드/버튼 → onPickPhoto(), 입력 비활성.
 *  - 신규 편집(pendingPhoto 시드): 제목·설명 입력 → 저장 시 검증 후 create(displayOrder=slotNumber).
 *  - 기존 편집(hero): 값 시드, 바뀐 필드만 PATCH, 사진 교체(onPickPhoto), 비우기(DELETE).
 */
export function HeroActivityEditor({
  clubId,
  slotNumber,
  hero,
  dragHandle,
  onPickPhoto,
  pendingPhoto = null,
  onSaved,
  onBeforeSave,
}: Props) {
  const createMutation = useCreateHeroActivityMutation(clubId);
  const updateMutation = useUpdateHeroActivityMutation(clubId);
  const deleteMutation = useDeleteHeroActivityMutation(clubId);

  const [title, setTitle] = useState(hero?.title ?? '');
  const [description, setDescription] = useState(hero?.description ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);
  // 삭제(비우기) 실패 전용 채널 — 확인 모달 안에서 표시한다(공통 규칙). 편집 폼 오류와 섞이지 않게 분리.
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isEmpty = hero === null && pendingPhoto === null;
  const imageUrl = hero?.storageKey ?? pendingPhoto?.storageKey ?? null;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  async function handleSave() {
    setValidationError(null);
    setDeleteError(null);
    const trimmedTitle = title.trim();
    const trimmedDesc = description.trim();

    if (hero === null) {
      if (pendingPhoto === null) {
        setValidationError('사진을 선택해주세요.');
        return;
      }
      if (!trimmedTitle) {
        setValidationError('제목을 입력해주세요.');
        return;
      }
      if (!trimmedDesc) {
        setValidationError('설명을 입력해주세요.');
        return;
      }
      // 검증 통과 후, mutate 직전에 대기 중 정렬 디바운스를 확정한다(create displayOrder↔서버 순서 정합).
      await onBeforeSave?.();
      try {
        await createMutation.mutateAsync({
          clubPhotoId: pendingPhoto.clubPhotoId,
          title: trimmedTitle,
          description: trimmedDesc,
          displayOrder: slotNumber,
        });
        onSaved?.();
      } catch {
        // 표시는 mutationError 채널로 — rejection 만 삼켜 unhandled 를 막는다.
      }
      return;
    }

    // 기존 수정 — 빈 값은 에러(BE title/desc 필수), 바뀐 필드만 PATCH.
    if (!trimmedTitle) {
      setValidationError('제목을 입력해주세요.');
      return;
    }
    if (!trimmedDesc) {
      setValidationError('설명을 입력해주세요.');
      return;
    }
    const payload: UpdateHeroActivityPayload = {};
    if (trimmedTitle !== hero.title) payload.title = trimmedTitle;
    if (trimmedDesc !== hero.description) payload.description = trimmedDesc;
    if (pendingPhoto !== null && pendingPhoto.clubPhotoId !== hero.clubPhotoId) {
      payload.clubPhotoId = pendingPhoto.clubPhotoId;
    }
    // 변경 없음은 조용히 무시(빈 값만 에러).
    if (Object.keys(payload).length === 0) return;
    await onBeforeSave?.();
    try {
      await updateMutation.mutateAsync({ heroActivityId: hero.id, payload });
      onSaved?.();
    } catch {
      // 표시는 mutationError 채널로.
    }
  }

  async function handleDelete() {
    if (hero === null) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(hero.id);
      setConfirmOpen(false);
      onSaved?.();
    } catch (error) {
      // 실패는 모달을 열어둔 채 모달 안에서 안내한다 (공통 규칙).
      // 편집 영역에 그리면 모달 오버레이와 aria-hidden 뒤에 갇힌다.
      setDeleteError(error instanceof Error ? error.message : '삭제에 실패했습니다.');
    }
  }

  const mutationError =
    (createMutation.isError && createMutation.error instanceof Error && createMutation.error.message) ||
    (updateMutation.isError && updateMutation.error instanceof Error && updateMutation.error.message) ||
    null;
  // deleteError 는 확인 모달 안에서 보여주므로 편집 영역 표시에서는 제외한다.
  const displayError = validationError ?? mutationError;

  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-1.5">
        <div className="pt-1 text-charcoal-3">{dragHandle}</div>
        <div className="flex-1">
          {isEmpty ? (
            <button
              type="button"
              onClick={onPickPhoto}
              aria-label={`${slotNumber}번 슬롯 사진 선택`}
              className="block w-full rounded-[14px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <HeroActivityCard slotNumber={slotNumber} imageUrl={null} title={title} description={description} />
            </button>
          ) : (
            <HeroActivityCard slotNumber={slotNumber} imageUrl={imageUrl} title={title} description={description} />
          )}
        </div>
      </div>

      {isEmpty ? (
        <button type="button" onClick={onPickPhoto} className="btn btn-secondary btn-sm w-full">
          사진 선택
        </button>
      ) : (
        <>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[12.5px] font-semibold text-ink">제목</span>
              <span className="text-[11px] text-charcoal-3">
                {title.length}/{TITLE_MAX}
              </span>
            </div>
            <input
              aria-label="제목"
              value={title}
              maxLength={TITLE_MAX}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="활동 제목"
              className="w-full rounded-md border border-line px-2.5 py-1.5 text-[13px] focus:border-ink focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[12.5px] font-semibold text-ink">설명</span>
              <span className="text-[11px] text-charcoal-3">
                {description.length}/{DESC_MAX}
              </span>
            </div>
            <textarea
              aria-label="설명"
              value={description}
              maxLength={DESC_MAX}
              rows={2}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="활동 설명"
              className="w-full resize-none rounded-md border border-line px-2.5 py-1.5 text-[13px] focus:border-ink focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="btn btn-primary btn-sm disabled:opacity-50"
            >
              저장
            </button>
            <button type="button" onClick={onPickPhoto} className="btn btn-secondary btn-sm">
              사진 교체
            </button>
            {hero !== null && (
              <button
                type="button"
                onClick={() => {
                  setValidationError(null);
                  setDeleteError(null);
                  setConfirmOpen(true);
                }}
                className="ml-auto text-[12.5px] text-charcoal-2 hover:text-coral"
              >
                비우기
              </button>
            )}
          </div>
        </>
      )}

      {displayError && <p className="text-[12px] text-coral">{displayError}</p>}

      {hero !== null && (
        <ConfirmDialog
          open={confirmOpen}
          title="이 대표 활동을 비울까요?"
          description="사진과 문구가 삭제됩니다. 다른 활동의 순서는 자동으로 당겨지지 않아요."
          confirmLabel="비우기"
          isPending={deleteMutation.isPending}
          errorMessage={deleteError}
          onConfirm={handleDelete}
          onCancel={() => {
            setConfirmOpen(false);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}

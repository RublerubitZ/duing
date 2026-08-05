'use client';

import { useState } from 'react';

import type { AdminRecruitmentDetail, ForceCloseRecruitmentPayload } from '@duing/types';

import { ButtonSpinner } from '@/components/loading/Spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const REASON_MAX_LENGTH = 500;

type Props = {
  recruitment: AdminRecruitmentDetail;
  isPending: boolean;
  /** 실패 사유는 호출자가 정한다 — 다이얼로그는 열린 채로 그 문구만 보여준다. */
  errorMessage: string | null;
  onConfirm: (payload: ForceCloseRecruitmentPayload) => void;
  onCancel: () => void;
};

/**
 * 마감이 무엇을 끊는지는 지원 방식마다 다르다. 자체 지원은 지원서 접수가 멎고, 외부 폼은 지원이
 * 두잉 밖에서 이뤄지므로 실제로 끊기는 건 가입 링크 발급이다 — 확인 전에 그 차이를 먼저 알린다.
 */
function closeImpactNotice(recruitment: AdminRecruitmentDetail): string {
  if (recruitment.applicationMode === 'SELF') {
    return '마감하면 신규 지원이 중단되고 평가·면접 진행도 멈춥니다. 아직 결과가 정해지지 않은 지원서는 마감 후에도 합격·불합격 확정만 할 수 있습니다.';
  }
  const joinLink = recruitment.joinLink;
  if (joinLink === null) {
    // 활성 코드가 없으면 남은 사용 기한도 없다 — 지어내지 않는다.
    return '새 가입 링크는 발급할 수 없습니다.';
  }
  return `새 가입 링크는 발급할 수 없습니다. 기존 가입 링크는 모집 종료 후 ${joinLink.joinWindowDays}일까지만 사용할 수 있습니다.`;
}

export function AdminForceCloseDialog({
  recruitment,
  isPending,
  errorMessage,
  onConfirm,
  onCancel,
}: Props) {
  const [reason, setReason] = useState('');

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>모집을 강제로 마감할까요?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-charcoal-2">{recruitment.clubName}</span> ·{' '}
            {recruitment.title}
          </DialogDescription>
        </DialogHeader>

        <p className="pill-warm rounded-md px-3 py-2 text-[13px]">
          {closeImpactNotice(recruitment)}
        </p>

        <div>
          <label
            htmlFor="force-close-reason"
            className="mb-1.5 block text-[12.5px] font-semibold text-charcoal-2"
          >
            마감 사유 (선택)
          </label>
          <textarea
            id="force-close-reason"
            value={reason}
            aria-describedby="force-close-reason-hint"
            // maxLength 는 타이핑·붙여넣기만 끊는다. 드래그-드롭 삽입·자동입력도 상한을 지키도록 값 자체를 자른다.
            onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX_LENGTH))}
            rows={4}
            placeholder="예) 모집 기간이 끝났는데 마감되지 않아 운영에서 마감"
            className="min-h-[72px] w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none"
          />
          <div
            id="force-close-reason-hint"
            className="mt-1 flex items-center justify-between gap-2 text-[11px] text-charcoal-3"
          >
            <span>입력한 사유는 감사 로그에 기록됩니다.</span>
            <span>
              {reason.length}/{REASON_MAX_LENGTH}
            </span>
          </div>
        </div>

        {errorMessage && (
          <p className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">{errorMessage}</p>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="btn btn-ghost btn-sm"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ reason: reason.trim() || undefined })}
            disabled={isPending}
            className="btn btn-danger btn-sm"
          >
            {isPending && <ButtonSpinner />}
            마감하기
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

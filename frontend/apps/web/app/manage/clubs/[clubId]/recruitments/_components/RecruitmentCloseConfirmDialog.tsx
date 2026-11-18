'use client';

import { ConfirmDialog } from '@/app/_components/ConfirmDialog';

type Props = {
  /** 이번 등록으로 마감 처리될 기존 모집의 제목. */
  recruitmentTitle: string;
  isPending: boolean;
  /** 등록이 거절됐을 때의 안내 — 창을 닫지 않고 창 안에 그린다. */
  errorMessage?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * 새 모집 등록이 기존 OPEN 모집을 자동 마감하기 전 확인 다이얼로그
 * (아카이브 스펙 §9 — lazy-close 리뷰 프리즈 고지).
 *
 * 마감되면 그 모집의 지원현황이 조회 전용으로 굳고 심사 액션이 일괄 409 로 전환된다. 되돌릴 수 없는
 * 전환인데 지금까지는 예고가 없었으므로 제출 직전에 한 번 묻는다.
 * 골격(취소 정책·처리 중 가드·실패 안내)은 공용 ConfirmDialog 가 맡는다.
 */
export function RecruitmentCloseConfirmDialog({
  recruitmentTitle,
  isPending,
  errorMessage = null,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <ConfirmDialog
      open
      title="기존 모집을 마감하시겠습니까?"
      description={<>새 모집을 등록하면 현재 진행 중인 모집 &apos;{recruitmentTitle}&apos; 이 마감 처리됩니다.</>}
      confirmLabel="등록 및 마감"
      confirmVariant="primary"
      isPending={isPending}
      busyLabel="기존 모집 마감 중"
      errorMessage={errorMessage}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p className="text-[13px] leading-relaxed text-charcoal-2">
        마감된 모집은 평가와 면접 진행이 멈추고, 남은 지원서는 합격·불합격 확정만 할 수 있습니다.
      </p>
      {/* create 경로에서 이 다이얼로그가 뜨면 공개 확인은 생략된다 — 공개 시점 고지를 여기서 대신한다. */}
      <p className="text-[13px] leading-relaxed text-charcoal-2">
        등록과 동시에 학생에게 공개돼요.
      </p>
      <p className="text-[13px] leading-relaxed text-charcoal-2">계속하시겠습니까?</p>
    </ConfirmDialog>
  );
}

'use client';

import { useState } from 'react';

import type { AdminUserDetail, UserStatus } from '@duing/types';

import { ButtonSpinner } from '@/components/loading/Spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// 서버 검증은 Bean Validation 의 @Size(max = 200) 라 UTF-16 코드유닛으로 센다. textarea 의 maxLength 와
// `str.length` 가 정확히 그 단위다 — 코드포인트/서체소로 세면 이모지 섞인 사유에서 서버만 400 을 낸다.
const REASON_MAX_LENGTH = 200;

type Props = {
  detail: AdminUserDetail;
  nextStatus: UserStatus;
  isPending: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

export function AdminUserStatusDialog({ detail, nextStatus, isPending, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState('');

  const isSuspending = nextStatus === 'SUSPENDED';
  const reasonLabel = isSuspending ? '정지 사유' : '정지 해제 사유';
  const confirmLabel = isSuspending ? '계정 정지' : '정지 해제';
  // 서버는 @NotBlank 에 더해 전각 공백(U+3000)만 담긴 사유도 @Pattern 으로 거부한다. JS trim() 은
  // 전각 공백까지 털어내므로, 이 한 줄이 서버 검증과 같은 지점에서 막는다 — 400 을 받아보게 두지 않는다.
  const trimmedReason = reason.trim();
  // 회장을 정지시켜야 할 상황 자체가 있을 수 있다 — 경고만 하고 막지 않는다(회장 교체는 별도 기능).
  const leaderClubNames = detail.clubs
    .filter((club) => club.role === 'LEADER')
    .map((club) => club.clubName)
    .join(', ');

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <DialogContent
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{isSuspending ? '계정을 정지할까요?' : '정지를 해제할까요?'}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-charcoal-2">{detail.name}</span> ({detail.studentId}){' '}
            {isSuspending
              ? '회원의 모든 세션이 즉시 종료되고, 이후 로그인·API 접근이 차단됩니다.'
              : '회원이 다시 정상적으로 로그인할 수 있게 됩니다.'}
          </DialogDescription>
        </DialogHeader>

        {/* pill-coral(#fce2d9 배경 / #9a3f23 글자)은 레포에서 대비를 맞춰 둔 코랄 조합이다.
            옅은 배경(bg-coral/5) 위 text-coral 은 2.97:1 이라 WCAG AA 에 못 미친다. */}
        {isSuspending && leaderClubNames && (
          <p className="pill-coral rounded-md px-3 py-2 text-[13px]">
            이 회원은 {leaderClubNames} 동아리의 회장입니다. 계정을 정지하면 해당 동아리 운영에 영향이
            있을 수 있습니다.
          </p>
        )}

        <div>
          <label
            htmlFor="status-reason"
            className="mb-1.5 block text-[12.5px] font-semibold text-charcoal-2"
          >
            {reasonLabel}
          </label>
          <textarea
            id="status-reason"
            value={reason}
            maxLength={REASON_MAX_LENGTH}
            // 글자 수 제한과 사유가 남는 곳은 입력란에 포커스했을 때 함께 읽혀야 한다 — 라벨만으로는
            // 스크린리더에 "정지 사유, 편집 여러 줄"까지만 전달된다.
            aria-describedby="status-reason-hint"
            onChange={(event) => setReason(event.target.value)}
            placeholder="예) 커뮤니티 신고 3건 누적"
            className="min-h-[72px] w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none"
          />
          <div
            id="status-reason-hint"
            className="mt-1 flex items-center justify-between gap-2 text-[11px] text-charcoal-3"
          >
            {/* 사유는 관리자 메모가 아니라 감사 로그로 간다 — 둘은 별개의 저장소다. */}
            <span>입력한 사유는 감사 로그에 기록됩니다.</span>
            {/* 입력을 실제로 끊는 건 maxLength 이고 그건 원문 길이를 본다. 공백을 걷어낸 길이를 보여주면
                앞뒤 공백이 섞였을 때 카운터는 여유가 남았는데 타이핑만 막히는 상태가 된다. */}
            <span>
              {reason.length}/{REASON_MAX_LENGTH}
            </span>
          </div>
        </div>

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm(trimmedReason)}
            // maxLength 는 타이핑·붙여넣기만 끊는다. 드래그-드롭 삽입이나 자동입력 확장으로 값이 들어오면
            // 그대로 통과하므로, 서버가 실제로 검증하는 값(보내는 값 = trimmedReason)으로 한 번 더 막는다.
            disabled={
              isPending || trimmedReason.length === 0 || trimmedReason.length > REASON_MAX_LENGTH
            }
            // 정지는 파괴적 액션이라 danger 변형, 해제는 되돌리는 쪽이라 기본 강조를 쓴다 —
            // 두 확인 버튼이 같은 빨강이면 무엇을 확정하는지가 색으로 구분되지 않는다.
            className={`btn btn-sm ${isSuspending ? 'btn-danger' : 'btn-primary'}`}
          >
            {isPending && <ButtonSpinner />}
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

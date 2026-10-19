import type { Ref } from 'react';

import { COLLEGE_DISPLAY_NAME, GRADE_DISPLAY_NAME, type Grade, type PendingProfileCheckStatus } from '@duing/types';

import { formatSemesterLabel } from '@/app/_lib/semesterLabel';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';

// 하단 시트와 가운데 다이얼로그는 같은 Radix Dialog 프리미티브라 DialogTitle·DialogDescription 이
// 두 컨테이너 모두에서 제목·설명으로 연결된다(aria-labelledby·aria-describedby).

const LABEL_CLASS = 'text-[14px] text-charcoal-3';
const VALUE_CLASS = 'min-w-0 break-words text-[15px] font-semibold text-ink-deep';

type ProfileCheckBodyProps = {
  status: PendingProfileCheckStatus;
  titleRef: Ref<HTMLHeadingElement>;
};

/** 학기 라벨 → 제목 → 정보 카드 → 운영진 문구. 300자 문구가 작은 화면에서 카드를 첫 화면 밖으로 밀지 않게 카드를 먼저 둔다. */
export function ProfileCheckBody({ status, titleRef }: ProfileCheckBodyProps) {
  const currentGrade = GRADE_DISPLAY_NAME[status.grade];
  return (
    <>
      <p className="text-[13px] font-semibold text-ink">
        {formatSemesterLabel(status.semesterYear, status.semesterTerm)}
      </p>
      <DialogTitle
        ref={titleRef}
        tabIndex={-1}
        className="mt-1.5 text-[22px] font-bold leading-[1.35] tracking-[-0.02em] text-ink-deep outline-none"
      >
        {status.title}
      </DialogTitle>
      <dl className="mt-5 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 rounded-lg bg-cream px-5 py-3">
        <dt className={LABEL_CLASS}>학년</dt>
        <dd className={VALUE_CLASS}>
          {status.suggestedGrade === null ? (
            currentGrade
          ) : (
            // 버튼이 바꿀 값을 데이터 행에서 보여 준다 — 습관적으로 누르기 전에 눈에 걸리게.
            <>
              <span className="font-normal text-charcoal-3">
                <span className="sr-only">현재 </span>
                {currentGrade}
              </span>
              <span aria-hidden="true" className="mx-1.5 font-normal text-charcoal-3">
                →
              </span>
              <strong className="font-semibold">
                <span className="sr-only">, 이번 학기 제안 </span>
                {GRADE_DISPLAY_NAME[status.suggestedGrade]}
              </strong>
            </>
          )}
        </dd>
        <dt className={LABEL_CLASS}>단과대학</dt>
        <dd className={VALUE_CLASS}>{status.college === null ? '—' : COLLEGE_DISPLAY_NAME[status.college]}</dd>
        <dt className={LABEL_CLASS}>전공</dt>
        <dd className={VALUE_CLASS}>{status.major ?? '—'}</dd>
      </dl>
      <DialogDescription className="mt-5 whitespace-pre-line text-[15px] leading-[1.6] text-charcoal-2">
        {status.message}
      </DialogDescription>
    </>
  );
}

type ProfileCheckActionsProps = {
  /** stacked = 모바일 시트(주 버튼 56px 위에서부터 세로로), inline = PC 다이얼로그(보조·주 나란히). */
  layout: 'stacked' | 'inline';
  suggestedGrade: Grade | null;
  isPending: boolean;
  errorMessage: string | null;
  onConfirm: () => void;
  onEdit: () => void;
  onSnooze: () => void;
};

export function ProfileCheckActions({
  layout,
  suggestedGrade,
  isPending,
  errorMessage,
  onConfirm,
  onEdit,
  onSnooze,
}: ProfileCheckActionsProps) {
  const confirmLabel =
    suggestedGrade === null ? '현재 정보가 맞아요' : `${GRADE_DISPLAY_NAME[suggestedGrade]}이 맞아요`;
  const confirmButton = (
    <button
      type="button"
      onClick={onConfirm}
      disabled={isPending}
      className={layout === 'stacked' ? 'btn btn-primary h-14 w-full rounded-lg text-base' : 'btn btn-primary w-full'}
    >
      {isPending && <ButtonSpinner />}
      {confirmLabel}
    </button>
  );
  const editButton = (
    <button type="button" onClick={onEdit} disabled={isPending} className="btn btn-secondary w-full">
      정보 수정하기
    </button>
  );
  return (
    <div className="flex flex-col gap-2">
      {errorMessage && (
        <p role="alert" className="text-[13px] text-coral-deep">
          {errorMessage}
        </p>
      )}
      {layout === 'stacked' ? (
        <>
          {confirmButton}
          {editButton}
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {editButton}
          {confirmButton}
        </div>
      )}
      <button
        type="button"
        onClick={onSnooze}
        disabled={isPending}
        className="btn btn-ghost h-11 w-full text-[15px]"
      >
        나중에 확인하기
      </button>
      {/* 버튼 안 스피너는 이름을 바꾸지 않는다 — 진행 중임은 이 영역이 읽어 준다(#914). */}
      <span role="status" className="sr-only">
        {isPending ? '정보 확인 중' : null}
      </span>
    </div>
  );
}

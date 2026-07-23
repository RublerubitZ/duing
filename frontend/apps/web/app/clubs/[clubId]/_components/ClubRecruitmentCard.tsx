'use client';

import type { StudentRecruitmentProjection } from '@duing/types';
import {
  displayStatusLabel,
  recruitmentDaysLeft,
  recruitmentPeriodLabel,
} from '../../../_lib/recruitmentDisplay';
import { FavoriteToggleButton } from '../../../_components/FavoriteToggleButton';
import { Spinner } from '@/components/loading/Spinner';
import { useClubApply } from '../_lib/useClubApply';

type Props = {
  /** 진행 중인 모집(없으면 undefined). 모집중·예정·상시·마감 모두 받아 처리한다. */
  recruitment: StudentRecruitmentProjection | undefined;
  clubId: number;
};

export function ClubRecruitmentCard({ recruitment, clubId }: Props) {
  const { canApply, handleApply, applyButtonLabel, isCheckingEligibility } =
    useClubApply(recruitment);

  const status = recruitment?.displayStatus;
  const daysLeft = recruitment ? recruitmentDaysLeft(recruitment.endDate) : null;

  const header = (() => {
    if (!recruitment) return '모집 없음';
    if (status === 'OPEN' && daysLeft !== null) return `모집중 · D-${daysLeft}`;
    if (status === 'ALWAYS_OPEN') return '상시모집';
    if (status === 'UPCOMING') return `모집예정 · ${recruitment.startDate}부터`;
    return '모집마감';
  })();

  const heading = (() => {
    if (!recruitment) return '현재 진행 중인\n모집이 없습니다';
    if (status === 'OPEN') return '지금 바로\n지원할 수 있어요';
    if (status === 'ALWAYS_OPEN') return '언제든\n지원할 수 있어요';
    if (status === 'UPCOMING') return '곧 모집이\n시작돼요';
    return '이번 모집은\n종료됐어요';
  })();

  return (
    <aside className="relative">
      {/* 찜 버튼은 전 모집 상태 공통으로 카드 우상단에 플로팅한다(aside 가 positioning context). */}
      <FavoriteToggleButton clubId={clubId} size="md" className="absolute right-5 top-5" />
      <div className="rounded-[24px] border border-line bg-paper p-7 shadow-2">
        <div className="mb-3 text-xs font-bold tracking-wide06 text-ink">
          {header}
        </div>
        <h3 className="mb-5 whitespace-pre-line font-body text-2xl font-bold text-ink-deep">
          {heading}
        </h3>

        {recruitment && (
          <div className="mb-5 flex flex-col gap-3.5 text-sm">
            <Row
              label="모집 인원"
              value={`${recruitment.capacity}명${recruitment.useInterview ? ' (서류 + 면접)' : ' (서류)'}`}
            />
            <Row
              label="모집 기간"
              value={recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)}
            />
            <Row
              label="모집 대상"
              value={recruitment.targetRole === 'OFFICER' ? '운영진' : '부원'}
            />
            {recruitment.interviewStartDate && recruitment.interviewEndDate && (
              <Row
                label="면접 일정"
                value={`${recruitment.interviewStartDate} ~ ${recruitment.interviewEndDate}`}
              />
            )}
            {recruitment.applicantCount !== null && (
              <Row
                label="지원자"
                value={`현재 ${recruitment.applicantCount}명 지원`}
              />
            )}
            <Row label="상태" value={displayStatusLabel(recruitment.displayStatus)} last />
          </div>
        )}

        {recruitment?.targetRole === 'OFFICER' && (
          <p className="mb-5 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
            ⚠ 이 모집은 운영진 모집입니다. 이 동아리의 기존 부원만 지원할 수 있습니다.
          </p>
        )}

        <button
          type="button"
          onClick={handleApply}
          disabled={!canApply || isCheckingEligibility}
          className="btn btn-primary btn-big w-full disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isCheckingEligibility ? (
            <span role="status" aria-label="지원 자격 확인 중" className="inline-flex items-center">
              <Spinner size={14} />
            </span>
          ) : (
            applyButtonLabel
          )}
        </button>
      </div>
    </aside>
  );
}

function Row({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div className={`flex gap-3 ${last ? '' : 'border-b border-dashed border-line pb-3'}`}>
      <div className="w-20 text-[12.5px] text-charcoal-3">{label}</div>
      <div className="flex-1 font-semibold text-charcoal">{value}</div>
    </div>
  );
}

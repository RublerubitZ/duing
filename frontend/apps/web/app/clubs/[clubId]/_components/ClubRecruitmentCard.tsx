'use client';

import { useRouter } from 'next/navigation';
import type { RecruitmentDetail } from '@duing/types';
import { useAuthStore } from '@duing/stores';
import {
  displayStatusLabel,
  recruitmentDaysLeft,
  recruitmentPeriodLabel,
} from '../../../_lib/recruitmentDisplay';
import { toRoute } from '../../../_lib/route';
import { FavoriteToggleButton } from '../../../_components/FavoriteToggleButton';

type Props = {
  /** 진행 중인 모집(없으면 undefined). 모집중·예정·상시·마감 모두 받아 처리한다. */
  recruitment: RecruitmentDetail | undefined;
  clubId: number;
};

export function ClubRecruitmentCard({ recruitment, clubId }: Props) {
  const authStatus = useAuthStore((state) => state.status);
  const router = useRouter();

  const status = recruitment?.displayStatus;
  const canApply = status === 'OPEN' || status === 'ALWAYS_OPEN';
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

  const applyButtonLabel = recruitment?.applicationMode === 'EXTERNAL'
    ? '외부 폼으로 이동'
    : '지원하기';

  function handleApply() {
    if (!recruitment || !canApply) return;
    if (recruitment.applicationMode === 'EXTERNAL' && recruitment.externalFormUrl) {
      window.open(recruitment.externalFormUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const applyPath: `/${string}` = `/apply/${recruitment.id}`;
    if (authStatus !== 'authenticated') {
      router.push(toRoute(`/login?next=${encodeURIComponent(applyPath)}`));
      return;
    }
    router.push(toRoute(applyPath));
  }

  return (
    <aside className="space-y-4">
      <div className="sticky top-6 rounded-[24px] border border-line bg-paper p-7 shadow-2">
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
          disabled={!canApply}
          className="btn btn-primary btn-big mb-2.5 w-full disabled:cursor-not-allowed disabled:opacity-40"
        >
          {applyButtonLabel}
        </button>

        <div className="flex gap-2">
          <div className="flex-1">
            <FavoriteToggleButton clubId={clubId} size="md" />
          </div>
        </div>
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

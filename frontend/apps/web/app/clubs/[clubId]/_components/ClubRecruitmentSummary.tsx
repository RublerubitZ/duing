'use client';

// 모바일 전용(md:hidden) 모집 요약 카드 — 탭 위에 노출해 핵심 모집 정보를 즉시 보여준다.
// 데스크탑은 우측 사이드바의 풀 카드(ClubRecruitmentCard)를 그대로 쓴다. 지원 행동은 하단 고정 바가 담당.
// 모집이 없으면 렌더하지 않는다(하단 바가 '모집 없음'을 안내).

import type { StudentRecruitmentProjection } from '@duing/types';

import { Sparkle } from '../../../_components/Sparkle';
import {
  displayStatusLabel,
  recruitmentDaysLeft,
  recruitmentPeriodLabel,
} from '../../../_lib/recruitmentDisplay';

type Props = {
  /** 진행 중인 모집(없으면 undefined). */
  recruitment: StudentRecruitmentProjection | undefined;
};

// "2026-06-21" → "~06.21" (상시모집은 마감일 없음 → null)
function endLabel(endDate: string | null): string | null {
  if (endDate === null) return null;
  const [, month, day] = endDate.split('-');
  if (!month || !day) return null;
  return `~${month}.${day}`;
}

export function ClubRecruitmentSummary({ recruitment }: Props) {
  if (!recruitment) return null;

  const status = recruitment.displayStatus;
  const daysLeft = recruitmentDaysLeft(recruitment.endDate);
  const header =
    status === 'OPEN' && daysLeft !== null ? `모집중 · D-${daysLeft}` : displayStatusLabel(status);
  const end = endLabel(recruitment.endDate);

  const rows: Array<{ label: string; value: string }> = [
    {
      label: '인원',
      value: `${recruitment.capacity}명${recruitment.useInterview ? ' (서류 + 면접)' : ' (서류)'}`,
    },
    { label: '기간', value: recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate) },
    { label: '대상', value: recruitment.targetRole === 'OFFICER' ? '운영진' : '부원' },
  ];
  if (recruitment.interviewStartDate && recruitment.interviewEndDate) {
    rows.push({
      label: '면접',
      value: `${recruitment.interviewStartDate} ~ ${recruitment.interviewEndDate}`,
    });
  }

  const applied = recruitment.applicantCount;
  const ratio =
    applied !== null && recruitment.capacity > 0
      ? Math.min(100, Math.round((applied / recruitment.capacity) * 100))
      : null;

  return (
    <section className="rounded-2xl bg-sage-mist p-4" aria-label="모집 정보">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink-deep">
          <Sparkle size={13} color="#1F4A36" />
          {header}
        </span>
        {end && <span className="font-mono text-[12.5px] font-bold text-ink">{end}</span>}
      </div>

      <dl className="grid grid-cols-[44px_1fr] gap-y-1.5 text-[12.5px]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-charcoal-3">{row.label}</dt>
            <dd className="font-semibold text-charcoal">{row.value}</dd>
          </div>
        ))}
      </dl>

      {ratio !== null && (
        <div className="mt-3.5 border-t border-ink/10 pt-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-ink-deep">
            <span>현재 지원자</span>
            <span className="font-bold">
              {applied} / {recruitment.capacity}명
            </span>
          </div>
          <div className="h-[7px] overflow-hidden rounded-full bg-ink/12">
            <div className="h-full rounded-full bg-ink" style={{ width: `${ratio}%` }} />
          </div>
        </div>
      )}
    </section>
  );
}

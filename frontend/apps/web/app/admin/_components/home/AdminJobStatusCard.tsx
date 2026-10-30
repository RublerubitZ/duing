'use client';

import Link from 'next/link';
import { useAdminJobStatusesQuery } from '@duing/hooks';
import { DUING_CONTACT_EMAIL, DUING_KAKAO_CHAT_URL } from '@/app/_constants/duingContact';
import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { DASHBOARD_CHIP_TONE_CLASS } from '@/components/dashboard/dashboardChipTone';

import { JOB_STATUS_CONTACT_GUIDE, buildJobStatusRows, jobStatusHeadline } from './adminJobStatusPresentation';

import type { JobStatusRow } from './adminJobStatusPresentation';

const CHIP_CLASS = 'shrink-0 break-keep rounded-full px-2 py-0.5 text-xs font-semibold';
// 카드 푸터 링크 전례(AdminSchoolSyncCard) — 터치 높이 44px
const CONTACT_LINK_CLASS = 'inline-flex min-h-11 items-center text-xs font-medium text-ink hover:underline';

/** 총동연 홈 자동 작업 — 업무에 닿는 스케줄 잡 5개의 상태. 경고가 있을 때만 배지와 두잉팀 연락 경로를 보인다. */
export function AdminJobStatusCard() {
  const jobStatusesQuery = useAdminJobStatusesQuery();
  const jobStatuses = jobStatusesQuery.data;
  // 기준 시각은 받은 시각 — 같은 응답을 다시 받아도 dataUpdatedAt 은 바뀌어 다시 그려지고 상대 시각("8분 전")이 멈추지 않는다
  // (data 참조는 구조 공유로 그대로라 data 만 읽으면 다시 그리지 않는다). 서버 판정 시각과도 맞다.
  const rows = jobStatuses ? buildJobStatusRows(jobStatuses.jobs, new Date(jobStatusesQuery.dataUpdatedAt || Date.now())) : [];
  const warningCount = rows.filter((row) => row.isWarning).length;

  return (
    <DashboardCard
      title="자동 작업"
      badge={
        warningCount > 0 ? (
          <span className={cn(CHIP_CLASS, DASHBOARD_CHIP_TONE_CLASS.late)}>확인 필요 {warningCount}</span>
        ) : undefined
      }
      isLoading={jobStatuses === undefined && !jobStatusesQuery.isError}
      isError={jobStatusesQuery.isError}
      isEmpty={!jobStatuses}
      footer={warningCount > 0 ? <ContactLinks /> : undefined}
    >
      {jobStatuses ? <JobStatusBody rows={rows} hasWarning={warningCount > 0} /> : null}
    </DashboardCard>
  );
}

function JobStatusBody({ rows, hasWarning }: { rows: JobStatusRow[]; hasWarning: boolean }) {
  return (
    <>
      <p className="break-keep text-sm text-charcoal-2">{jobStatusHeadline(rows)}</p>
      {hasWarning ? <p className="mt-0.5 break-keep text-xs text-charcoal-3">{JOB_STATUS_CONTACT_GUIDE}</p> : null}
      <ul className="mt-3 flex flex-col gap-2.5">
        {rows.map((row) => (
          <JobStatusItem key={row.key} row={row} />
        ))}
      </ul>
    </>
  );
}

function JobStatusItem({ row }: { row: JobStatusRow }) {
  return (
    <li className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="min-w-0 break-keep text-sm font-medium text-charcoal">{row.name}</span>
        {row.chip ? <span className={cn(CHIP_CLASS, DASHBOARD_CHIP_TONE_CLASS[row.chip.tone])}>{row.chip.label}</span> : null}
        {/* 경고 아닌 줄은 결과까지 한 줄로 — 평소 카드 높이를 낮춘다(좁으면 다음 줄로 내려간다) */}
        {row.isWarning ? null : <span className="break-keep text-xs text-charcoal-3">{row.resultText}</span>}
      </div>
      {row.isWarning ? <p className="mt-0.5 break-keep text-xs text-charcoal-2">{row.resultText}</p> : null}
      {row.impact ? (
        <p className={cn('mt-0.5 break-keep text-xs', row.isWarning ? 'text-charcoal-2' : 'text-charcoal-3')}>{row.impact}</p>
      ) : null}
      {row.workaround ? <p className="mt-0.5 break-keep text-xs text-charcoal-2">{row.workaround}</p> : null}
    </li>
  );
}

function ContactLinks() {
  return (
    <div className="flex flex-wrap gap-x-4">
      <a href={DUING_KAKAO_CHAT_URL} target="_blank" rel="noopener noreferrer" className={CONTACT_LINK_CLASS}>
        두잉팀 카카오 문의
      </a>
      <a href={`mailto:${DUING_CONTACT_EMAIL}`} aria-label={`메일 보내기 ${DUING_CONTACT_EMAIL}`} className={CONTACT_LINK_CLASS}>
        메일 보내기
      </a>
      <Link href={toRoute('/me/inquiries/new')} className={CONTACT_LINK_CLASS}>
        1:1 문의
      </Link>
    </div>
  );
}

'use client';

import { useState, useMemo } from 'react';

import {
  formatDateKst,
  formatTimeKst,
  kstDateTimeFormatter,
  parseKstInstant,
  useMyApplicationsQuery,
  useMyApplicationDetailQuery,
} from '@duing/hooks';
import type { ApplicationSummary, ApplicationStatus, AssignedInterview, ClubCategory } from '@duing/types';

import { ExploreNav } from '@/app/_components/ExploreNav';
import { APPLICATION_STATUS_APPLICANT_LABEL } from '@/app/_constants/application-status';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';

import { FILTERS, STATUS_TO_FILTER, PAGE_PAD, PAGE_MAX } from '../_constants/data';
import type { App, FilterKey, Counts, Logo, AppStatus, Step } from '../_constants/data';
import { ApplyStatusHero } from '../_components/ApplyStatusHero';
import { ApplyTopTabs } from '../_components/ApplyTopTabs';
import { ApplyRow } from '../_components/ApplyRow';
import { ApplySummaryCard } from '../_components/ApplySummaryCard';
import { StageFilterCard } from '../_components/StageFilterCard';
import { InfoNoteBox } from '../_components/InfoNoteBox';
import { ApplyDetailModal } from '../_components/ApplyDetailModal';

const CATEGORY_LABELS: Record<ClubCategory, string> = {
  ACADEMIC:  '학술',
  CREATION:  '창작',
  ART:       '예술',
  SPORTS:    '운동',
  VOLUNTEER: '봉사',
  RELIGION:  '종교',
  HOBBY:     '취미',
  OTHER:     '기타',
};

function toAppStatus(status: ApplicationStatus, interview: AssignedInterview | null): AppStatus {
  switch (status) {
    case 'SUBMITTED':         return 'applied';
    // 보류는 지원자에게 심사 중과 동일하다 — 별도 시각 구분을 두지 않는다 (스펙 §1-1).
    case 'ON_HOLD':           return 'applied';
    case 'INTERVIEW_PENDING': return interview ? 'interview-scheduled' : 'interview-pending';
    case 'ACCEPTED':          return 'passed';
    case 'REJECTED':          return 'failed';
  }
}

function deriveSteps(status: ApplicationStatus): Step[] {
  type StepStateValue = 'done' | 'current' | 'pending';
  const stateMap: Record<ApplicationStatus, [StepStateValue, StepStateValue, StepStateValue]> = {
    SUBMITTED:         ['current', 'pending', 'pending'],
    ON_HOLD:           ['current', 'pending', 'pending'], // 지원자에게 심사 중과 동일
    INTERVIEW_PENDING: ['done',    'current', 'pending'],
    ACCEPTED:          ['done',    'done',    'done'   ],
    REJECTED:          ['done',    'done',    'done'   ],
  };
  const [screening, interview, finalResult] = stateMap[status];
  // 단계 이름은 상태 라벨이 아니라 진행 마디다 — SectionApply(['심사','면접'])·
  // ApplicationStepper('최종 결과') 와 같은 용어를 쓴다. 서류 단계는 제거됐다 (스펙 §5-5).
  return [
    { label: '심사',      date: '-', state: screening   },
    { label: '면접',      date: '-', state: interview   },
    { label: '최종 결과', date: '-', state: finalResult },
  ];
}

function deriveRight(status: ApplicationStatus, interview: AssignedInterview | null) {
  if (status === 'INTERVIEW_PENDING' && interview) {
    const dateStr = formatDateKst(interview.startAt);
    const timeStr = formatTimeKst(interview.startAt);
    const sub = interview.location ? `${timeStr} · ${interview.location}` : timeStr;
    return { eyebrow: '면접일', value: dateStr, sub };
  }
  if (status === 'ACCEPTED') {
    return { eyebrow: '결과', value: APPLICATION_STATUS_APPLICANT_LABEL.ACCEPTED };
  }
  return null;
}

function toLogo(logoUrl: string | null, clubName: string): Logo {
  if (logoUrl) {
    return { kind: 'img', url: logoUrl, bg: '#E8EEE8', fg: '#1F3D2C' };
  }
  const initial = clubName.charAt(0).toUpperCase();
  return { kind: 'wordmark', text: initial, bg: '#2A3828', fg: '#E8EEE8' };
}

// KST 요일 — "YYYY.MM.DD (요일) HH:mm" 구조 유지용.
const WEEKDAY_FORMATTER = kstDateTimeFormatter({ weekday: 'short' });

function formatDateTime(iso: string): string {
  return `${formatDateKst(iso)} (${WEEKDAY_FORMATTER.format(parseKstInstant(iso))}) ${formatTimeKst(iso)}`;
}

function toApp(summary: ApplicationSummary): App {
  return {
    id: String(summary.id),
    name: summary.clubName,
    cat: CATEGORY_LABELS[summary.category] ?? summary.category,
    tag: summary.recruitmentTitle,
    appliedDate: formatDateKst(summary.submittedAt),
    appliedAt: formatDateTime(summary.submittedAt),
    division: '-',
    department: '-',
    files: [],
    memo: '',
    steps: deriveSteps(summary.status),
    status: toAppStatus(summary.status, summary.interview),
    right: deriveRight(summary.status, summary.interview),
    logo: toLogo(summary.logoUrl, summary.clubName),
  };
}

type Props = {
  defaultOpenId?: string | null;
};

export function ApplicationsPage({ defaultOpenId = null }: Props) {
  const [selected, setSelected] = useState<FilterKey[]>(['all']);
  const [openId, setOpenId] = useState<string | null>(defaultOpenId);

  const { data: applicationSummaries, isLoading, isError } = useMyApplicationsQuery();

  const openApplicationId = openId !== null ? Number(openId) : undefined;
  const { data: openDetail } = useMyApplicationDetailQuery(openApplicationId);

  const apps: App[] = useMemo(
    () => (applicationSummaries ?? []).map(toApp),
    [applicationSummaries],
  );

  const toggleFilter = (key: FilterKey) => {
    setSelected(prev => {
      if (key === 'all') return ['all'];
      if (prev.length === 1 && prev[0] === key) return ['all'];
      return [key];
    });
  };

  const counts = useMemo<Counts>(() => {
    const countMap: Counts = { all: apps.length };
    FILTERS.forEach(filterItem => { if (filterItem.key !== 'all') countMap[filterItem.key] = 0; });
    apps.forEach(app => {
      const filterKey = STATUS_TO_FILTER[app.status];
      if (filterKey && countMap[filterKey] != null) countMap[filterKey] = (countMap[filterKey] ?? 0) + 1;
    });
    return countMap;
  }, [apps]);

  const visibleApps = useMemo(() => {
    if (selected.includes('all')) return apps;
    return apps.filter(app => {
      const filterKey = STATUS_TO_FILTER[app.status];
      return filterKey !== undefined && selected.includes(filterKey);
    });
  }, [selected, apps]);

  const openApp = openId ? apps.find(app => app.id === openId) ?? null : null;

  return (
    // min-h-dvh — 안드로이드 크롬에서 100vh 는 주소창이 접힌 큰 뷰포트라 문서가 화면보다 길어진다.
    <div className="duing min-h-dvh bg-cream">
      <ExploreNav slimOnMobile />
      <ApplyStatusHero />
      <ApplyTopTabs active={selected} onToggle={toggleFilter} counts={counts} />

      <section style={{ padding: `16px ${PAGE_PAD} 40px` }}>
        <div
          className="mx-auto grid grid-cols-1 items-start gap-4 md:grid-cols-[1fr_200px]"
          style={{ maxWidth: PAGE_MAX }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isLoading ? (
              <ListRowsSkeleton
                rows={4}
                rowClassName="h-[84px] rounded-[14px]"
                className="space-y-2"
                label="지원 내역 불러오는 중"
              />
            ) : isError ? (
              <div style={{
                background: 'var(--paper)',
                border: '1px dashed var(--gray-line)',
                borderRadius: 14,
                padding: '48px 24px',
                textAlign: 'center',
                fontSize: 13, color: 'var(--charcoal-3)',
              }}>
                지원 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
              </div>
            ) : visibleApps.length === 0 ? (
              <div style={{
                background: 'var(--paper)',
                border: '1px dashed var(--gray-line)',
                borderRadius: 14,
                padding: '48px 24px',
                textAlign: 'center',
                fontSize: 13, color: 'var(--charcoal-3)',
              }}>
                {apps.length === 0 ? '아직 지원한 동아리가 없습니다.' : '선택한 단계에 해당하는 지원 내역이 없습니다.'}
              </div>
            ) : (
              visibleApps.map(app => (
                <ApplyRow
                  key={app.id}
                  app={app}
                  isActive={openId === app.id}
                  onOpen={(id) => setOpenId(id)}
                />
              ))
            )}

            <div style={{ marginTop: 8 }}>
              <InfoNoteBox />
            </div>
          </div>

          {/* 요약·단계 필터 사이드바 — 데스크탑 전용. 모바일은 상단 ApplyTopTabs 가 필터를 제공한다. */}
          <aside className="sticky top-4 hidden flex-col gap-3 md:flex">
            <ApplySummaryCard counts={counts} />
            <StageFilterCard checked={selected} onToggle={toggleFilter} counts={counts} />
          </aside>
        </div>
      </section>

      <ApplyDetailModal
        app={openApp}
        detail={openDetail ?? null}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}
